package com.raccoonroyale.rooms;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.raccoonroyale.auth.WalletAuthService;
import com.raccoonroyale.chain.ChainGateway;
import com.raccoonroyale.websocket.Protocol;
import java.math.BigInteger;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

/** Paid Liar's Dice rooms: wallet sessions, on-chain funding, cancellation, and settlement. */
class PaidRoomTest {
    static final BigInteger TEN_TRASH = ChainGateway.ONE_TRASH.multiply(BigInteger.TEN);

    /**
     * TEMPORARY MOCK (test only): records chain calls and answers with configurable
     * final outcomes. The running backend always uses near-bridge.
     */
    static class RecordingChain implements ChainGateway {
        final List<String> calls = new ArrayList<>();
        final Map<String, Boolean> deposited = new HashMap<>();
        List<String> players = List.of();
        List<Payout> payouts;
        boolean createOk = true, settleOk = true, cancelOk = true;
        public boolean enabled() { return true; }
        public String network() { return "testnet"; }
        public String tokenId() { return "token.trash.testnet"; }
        public String casinoId() { return "casino.trash.testnet"; }
        public String explorerUrl() { return "https://testnet.nearblocks.io"; }
        public BigInteger buyIn() { return TEN_TRASH; }
        public Optional<String> agentAccount(String agent) { return agent.equals("don") ? Optional.of("don.trash.testnet") : Optional.empty(); }
        static CompletableFuture<TxResult> outcome(boolean ok) {
            return CompletableFuture.completedFuture(ok ? new TxResult(true, "4GZbrRrNQ3fWGbW6K7VWz9CP3PZ8nKcSvvkQKEeF9nQJ", null)
                : new TxResult(false, null, "Smart contract panicked"));
        }
        public CompletableFuture<TxResult> createGame(String gameId, BigInteger buyIn, List<String> players, long timeoutSeconds) {
            calls.add("create"); this.players = players;
            for (String p : players) deposited.put(p, p.startsWith("don."));
            return outcome(createOk);
        }
        public CompletableFuture<Optional<ChainGame>> game(String gameId) {
            calls.add("status");
            return CompletableFuture.completedFuture(Optional.of(new ChainGame("OPEN", Map.copyOf(deposited))));
        }
        public CompletableFuture<TxResult> settleGame(String gameId, List<Payout> payouts) { calls.add("settle"); this.payouts = payouts; return outcome(settleOk); }
        public CompletableFuture<TxResult> cancelGame(String gameId) { calls.add("cancel"); return outcome(cancelOk); }
        public CompletableFuture<Balances> balances(String accountId) { return CompletableFuture.completedFuture(new Balances(BigInteger.ZERO, BigInteger.ZERO)); }
        public CompletableFuture<Boolean> verifyNep413(String a, String k, String s, String m, String r, String n) {
            return CompletableFuture.completedFuture(a.endsWith(".testnet"));
        }
    }

    final ObjectMapper mapper = new ObjectMapper();
    final RecordingChain chain = new RecordingChain();
    final WalletAuthService wallets = new WalletAuthService(chain, "trashnino");
    Protocol protocol;
    RoomService rooms;

    void start(long fundingMillis) throws Exception {
        protocol = new Protocol(mapper);
        rooms = new RoomService(protocol, chain, wallets, 0, 0, 0, fundingMillis, 0);
    }

    String session(String account) throws Exception {
        var challenge = wallets.challenge();
        return wallets.verify(account, "ed25519:" + "1".repeat(44), "c2lnbmF0dXJl", challenge.nonce()).get()
            .orElseThrow().sessionToken();
    }

    class Player {
        // TEMPORARY MOCK: WebSocket transport in unit tests only; game state uses the real engine.
        final WebSocketSession socket = mock(WebSocketSession.class);
        final List<JsonNode> received = new ArrayList<>();
        Player() throws Exception {
            when(socket.getId()).thenReturn(UUID.randomUUID().toString()); when(socket.isOpen()).thenReturn(true);
            doAnswer(i -> { received.add(mapper.readTree(((TextMessage) i.getArgument(0)).getPayload())); return null; })
                .when(socket).sendMessage(any());
            rooms.connected(socket);
        }
        void send(String type, Map<String, Object> payload) throws Exception {
            rooms.handle(socket, protocol.parseClient(mapper.writeValueAsString(Map.of("protocolVersion", 1, "type", type,
                "requestId", UUID.randomUUID().toString(), "payload", payload))));
        }
        JsonNode last(String type) {
            return received.stream().filter(n -> n.path("type").asText().equals(type)).reduce((a, b) -> b).orElseThrow().get("payload");
        }
        boolean got(String type) { return received.stream().anyMatch(n -> n.path("type").asText().equals(type)); }
        String roomId() { return last("ROOM_SESSION").path("roomId").asText(); }
        String code() { return last("ROOM_SESSION").path("roomCode").asText(); }
        JsonNode economy() { return last("ROOM_STATE").path("economy"); }
        void ready() throws Exception { send("ROOM_READY", Map.of("roomId", roomId(), "ready", true)); }
        void startMatch() throws Exception { send("ROOM_START", Map.of("roomId", roomId())); }
    }

    Map<String, Object> create(String session, int agents) {
        var payload = new HashMap<String, Object>(Map.of("displayName", "Alice", "avatar", "CAT", "game", "LIARS_DICE",
            "agents", agents, "paid", true));
        if (session != null) payload.put("sessionToken", session);
        return payload;
    }

    @Test void paidRoomNeedsAVerifiedWallet() throws Exception {
        start(60_000);
        var alice = new Player();
        alice.send("ROOM_CREATE", create(null, 1));
        assertEquals("WALLET_REQUIRED", alice.last("ERROR").path("code").asText());
        alice.send("ROOM_CREATE", create("A".repeat(43), 1));
        assertEquals("WALLET_REQUIRED", alice.last("ERROR").path("code").asText(), "an unknown session proves nothing");
        assertTrue(wallets.verify("bob.testnet", "ed25519:" + "1".repeat(44), "c2ln", "A".repeat(43) + "=").get().isEmpty(),
            "a nonce the server never issued is rejected");
    }

    @Test void nonceIsSingleUse() throws Exception {
        start(60_000);
        var challenge = wallets.challenge();
        String key = "ed25519:" + "1".repeat(44);
        assertTrue(wallets.verify("alice.testnet", key, "c2ln", challenge.nonce()).get().isPresent());
        assertTrue(wallets.verify("alice.testnet", key, "c2ln", challenge.nonce()).get().isEmpty());
    }

    @Test void fullPaidMatchFundsOnChainThenSettlesTheWinner() throws Exception {
        start(60_000);
        var alice = new Player();
        alice.send("ROOM_CREATE", create(session("alice.testnet"), 1));
        assertEquals("PAID", alice.economy().path("mode").asText());
        assertEquals("alice.testnet", alice.last("ROOM_STATE").path("participants").get(0).path("accountId").asText());
        assertEquals("don.trash.testnet", alice.last("ROOM_STATE").path("participants").get(1).path("accountId").asText());

        alice.ready(); alice.startMatch();
        assertEquals(List.of("alice.testnet", "don.trash.testnet"), chain.players);
        assertEquals("FUNDING", alice.last("ROOM_STATE").path("phase").asText());
        assertEquals("AWAITING_PAYMENTS", alice.economy().path("funding").asText());
        assertFalse(alice.got("GAME_STATE"), "no dice before every seat has paid");

        rooms.tick(); // Don is seated by the contract; Alice has not paid yet.
        assertEquals("FUNDING", alice.last("ROOM_STATE").path("phase").asText());
        assertEquals(1, alice.economy().path("paidPlayerIds").size());

        chain.deposited.put("alice.testnet", true); // Alice signs join_game in her wallet.
        rooms.tick();
        assertEquals("IN_PROGRESS", alice.last("ROOM_STATE").path("phase").asText());
        assertEquals("FUNDED", alice.economy().path("funding").asText());
        assertEquals(5, alice.last("GAME_STATE").path("ownDice").size());

        for (int i = 0; i < 1_000 && !alice.got("GAME_RESULT"); i++) rooms.tick(); // Timeouts play legal fallbacks.
        var result = alice.last("GAME_RESULT");
        assertEquals("CONFIRMED", result.path("settlement").asText());
        String winner = result.path("winnerId").asText();
        String winnerAccount = winner.startsWith("don-") ? "don.trash.testnet" : "alice.testnet";
        assertEquals(List.of(new ChainGateway.Payout(winnerAccount, TEN_TRASH.multiply(BigInteger.TWO))), chain.payouts);
        assertEquals("CONFIRMED", alice.economy().path("settlement").asText());
        assertEquals("4GZbrRrNQ3fWGbW6K7VWz9CP3PZ8nKcSvvkQKEeF9nQJ", alice.economy().path("settlementTxHash").asText());
        assertEquals(1, chain.calls.stream().filter("settle"::equals).count(), "settles exactly once");
    }

    @Test void unpaidBuyInTimesOutAndCancelsOnChain() throws Exception {
        start(0);
        var alice = new Player();
        alice.send("ROOM_CREATE", create(session("alice.testnet"), 1));
        alice.ready(); alice.startMatch();
        rooms.tick(); // Deadline passed: start cancelling.
        rooms.tick(); // Send cancel_game.
        assertTrue(chain.calls.contains("cancel"));
        assertEquals("CANCELLED", alice.economy().path("funding").asText());
        assertEquals("LOBBY", alice.last("ROOM_STATE").path("phase").asText());
        assertTrue(alice.economy().path("message").asText().contains("in time"));
        assertFalse(alice.got("GAME_STATE"));
    }

    @Test void failedGameCreationReturnsToLobby() throws Exception {
        start(60_000);
        chain.createOk = false;
        var alice = new Player();
        alice.send("ROOM_CREATE", create(session("alice.testnet"), 1));
        alice.ready(); alice.startMatch();
        assertEquals("FAILED", alice.economy().path("funding").asText());
        assertEquals("LOBBY", alice.last("ROOM_STATE").path("phase").asText());
        assertFalse(alice.last("ROOM_STATE").path("participants").get(0).path("ready").asBoolean());
    }

    @Test void leavingDuringFundingCancelsAndOneWalletGetsOneSeat() throws Exception {
        start(60_000);
        String aliceSession = session("alice.testnet");
        var alice = new Player();
        alice.send("ROOM_CREATE", create(aliceSession, 0));
        var twin = new Player();
        twin.send("ROOM_JOIN", Map.of("displayName", "Twin", "avatar", "FOX", "roomCode", alice.code(), "sessionToken", aliceSession));
        assertEquals("ALREADY_IN_ROOM", twin.last("ERROR").path("code").asText());
        var guest = new Player();
        guest.send("ROOM_JOIN", Map.of("displayName", "Guest", "avatar", "FOX", "roomCode", alice.code()));
        assertEquals("WALLET_REQUIRED", guest.last("ERROR").path("code").asText());
        var bob = new Player();
        bob.send("ROOM_JOIN", Map.of("displayName", "Bob", "avatar", "FOX", "roomCode", alice.code(), "sessionToken", session("bob.testnet")));
        alice.ready(); bob.ready(); alice.startMatch();
        assertEquals(List.of("alice.testnet", "bob.testnet"), chain.players);
        bob.send("ROOM_LEAVE", Map.of("roomId", bob.roomId()));
        rooms.tick();
        assertTrue(chain.calls.contains("cancel"));
        assertEquals("CANCELLED", alice.economy().path("funding").asText());
        assertTrue(alice.economy().path("message").asText().contains("Bob left"));
    }

    @Test void freeRoomsNeverTouchTheChain() throws Exception {
        start(60_000);
        var alice = new Player();
        alice.send("ROOM_CREATE", Map.of("displayName", "Alice", "avatar", "CAT", "game", "LIARS_DICE", "agents", 1));
        assertTrue(alice.last("ROOM_STATE").path("economy").isNull());
        alice.ready(); alice.startMatch();
        for (int i = 0; i < 1_000 && !alice.got("GAME_RESULT"); i++) rooms.tick();
        assertEquals("NOT_STARTED", alice.last("GAME_RESULT").path("settlement").asText());
        assertTrue(chain.calls.isEmpty());
    }
}
