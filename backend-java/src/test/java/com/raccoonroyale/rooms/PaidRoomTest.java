package com.raccoonroyale.rooms;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.raccoonroyale.ai.AgentActionParser;
import com.raccoonroyale.ai.MockAgentBrain;
import com.raccoonroyale.auth.WalletAuthService;
import com.raccoonroyale.chain.ChainGateway;
import com.raccoonroyale.websocket.Protocol;
import java.math.BigInteger;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

/** Paid rooms: wallet sessions, stakes taken from casino balances, cancellation, and settlement. */
class PaidRoomTest {
    static final BigInteger TRASH = ChainGateway.ONE_TRASH;
    static final BigInteger TEN_TRASH = TRASH.multiply(BigInteger.TEN);
    static final String TX = "4GZbrRrNQ3fWGbW6K7VWz9CP3PZ8nKcSvvkQKEeF9nQJ";

    /**
     * TEMPORARY MOCK (test only): a tiny model of the casino ledger. create_game takes
     * every human stake from the casino balance or fails as a whole, like the contract.
     * The running backend always uses near-bridge.
     */
    static class RecordingChain implements ChainGateway {
        final List<String> calls = new ArrayList<>();
        final Map<String, BigInteger> balances = new HashMap<>();
        final Map<String, List<String>> games = new LinkedHashMap<>();
        final List<BigInteger> houseStakes = new ArrayList<>();
        final List<List<Payout>> settlements = new ArrayList<>();
        boolean settleOk = true;
        public boolean enabled() { return true; }
        public String network() { return "testnet"; }
        public String tokenId() { return "token.trash.testnet"; }
        public String casinoId() { return "casino.trash.testnet"; }
        public String explorerUrl() { return "https://testnet.nearblocks.io"; }
        public BigInteger buyIn() { return TEN_TRASH; }
        public Optional<String> agentAccount(String agent) { return agent.equals("don") ? Optional.of("don.trash.testnet") : Optional.empty(); }
        static CompletableFuture<TxResult> ok() { return CompletableFuture.completedFuture(new TxResult(true, TX, null)); }
        static CompletableFuture<TxResult> failed(String error) { return CompletableFuture.completedFuture(new TxResult(false, null, error)); }
        public CompletableFuture<TxResult> createGame(String gameId, BigInteger buyIn, List<String> players, BigInteger houseStake, long timeoutSeconds) {
            calls.add("create");
            var humans = players.stream().filter(p -> !p.startsWith("don.")).toList();
            for (String p : humans) {
                if (balances.getOrDefault(p, BigInteger.ZERO).compareTo(buyIn) < 0) {
                    return failed("Smart contract panicked: " + p + " has insufficient casino balance");
                }
            }
            humans.forEach(p -> balances.merge(p, buyIn.negate(), BigInteger::add));
            games.put(gameId, players);
            houseStakes.add(houseStake);
            return ok();
        }
        public CompletableFuture<Optional<ChainGame>> game(String gameId) { return CompletableFuture.completedFuture(Optional.empty()); }
        public CompletableFuture<TxResult> settleGame(String gameId, List<Payout> payouts) {
            calls.add("settle");
            settlements.add(payouts);
            if (!settleOk) return failed("settle failed");
            payouts.forEach(p -> balances.merge(p.accountId(), p.amount(), BigInteger::add));
            return ok();
        }
        public CompletableFuture<TxResult> cancelGame(String gameId) { calls.add("cancel"); return ok(); }
        public CompletableFuture<Balances> balances(String accountId) {
            return CompletableFuture.completedFuture(new Balances(BigInteger.ZERO, balances.getOrDefault(accountId, BigInteger.ZERO)));
        }
        public CompletableFuture<Boolean> verifyNep413(String a, String k, String s, String m, String r, String n) {
            return CompletableFuture.completedFuture(a.endsWith(".testnet"));
        }
    }

    final ObjectMapper mapper = new ObjectMapper();
    final RecordingChain chain = new RecordingChain();
    final WalletAuthService wallets = new WalletAuthService(chain, "trashnino");
    final Protocol protocol;
    final RoomService rooms;

    PaidRoomTest() throws Exception {
        protocol = new Protocol(mapper);
        rooms = new RoomService(protocol, new MockAgentBrain(), new AgentActionParser(protocol), chain, wallets, 0, 0, 0, 5000, 0);
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
        String id() { return last("ROOM_SESSION").path("playerId").asText(); }
        String roomId() { return last("ROOM_SESSION").path("roomId").asText(); }
        String code() { return last("ROOM_SESSION").path("roomCode").asText(); }
        JsonNode economy() { return last("ROOM_STATE").path("economy"); }
        String phase() { return last("ROOM_STATE").path("phase").asText(); }
        void ready() throws Exception { send("ROOM_READY", Map.of("roomId", roomId(), "ready", true)); }
        void startMatch() throws Exception { send("ROOM_START", Map.of("roomId", roomId())); }
    }

    Map<String, Object> create(String game, String session, int agents, Integer bet) {
        var payload = new HashMap<String, Object>(Map.of("displayName", "Alice", "avatar", "CAT", "game", game,
            "agents", agents, "paid", true));
        if (session != null) payload.put("sessionToken", session);
        if (bet != null) payload.put("betTrash", bet);
        return payload;
    }

    BigInteger balance(String account) { return chain.balances.getOrDefault(account, BigInteger.ZERO); }

    // ------------------------------------------------------------------ wallets

    @Test void paidRoomNeedsAVerifiedWallet() throws Exception {
        var alice = new Player();
        alice.send("ROOM_CREATE", create("LIARS_DICE", null, 1, null));
        assertEquals("WALLET_REQUIRED", alice.last("ERROR").path("code").asText());
        alice.send("ROOM_CREATE", create("LIARS_DICE", "A".repeat(43), 1, null));
        assertEquals("WALLET_REQUIRED", alice.last("ERROR").path("code").asText(), "an unknown session proves nothing");
        assertTrue(wallets.verify("bob.testnet", "ed25519:" + "1".repeat(44), "c2ln", "A".repeat(43) + "=").get().isEmpty(),
            "a nonce the server never issued is rejected");
    }

    @Test void nonceIsSingleUse() throws Exception {
        var challenge = wallets.challenge();
        String key = "ed25519:" + "1".repeat(44);
        assertTrue(wallets.verify("alice.testnet", key, "c2ln", challenge.nonce()).get().isPresent());
        assertTrue(wallets.verify("alice.testnet", key, "c2ln", challenge.nonce()).get().isEmpty());
    }

    @Test void oneWalletGetsOneSeat() throws Exception {
        String aliceSession = session("alice.testnet");
        var alice = new Player();
        alice.send("ROOM_CREATE", create("LIARS_DICE", aliceSession, 0, null));
        var twin = new Player();
        twin.send("ROOM_JOIN", Map.of("displayName", "Twin", "avatar", "FOX", "roomCode", alice.code(), "sessionToken", aliceSession));
        assertEquals("ALREADY_IN_ROOM", twin.last("ERROR").path("code").asText());
        var guest = new Player();
        guest.send("ROOM_JOIN", Map.of("displayName", "Guest", "avatar", "FOX", "roomCode", alice.code()));
        assertEquals("WALLET_REQUIRED", guest.last("ERROR").path("code").asText());
    }

    // -------------------------------------------------------------- Liar's Dice

    @Test void liarsDiceStartsWithoutPlayerSignaturesAndPaysTheChipLeader() throws Exception {
        chain.balances.put("alice.testnet", TEN_TRASH.multiply(BigInteger.TWO));
        var alice = new Player();
        alice.send("ROOM_CREATE", create("LIARS_DICE", session("alice.testnet"), 1, null));
        assertEquals("PAID", alice.economy().path("mode").asText());
        assertEquals("don.trash.testnet", alice.last("ROOM_STATE").path("participants").get(1).path("accountId").asText());

        alice.ready(); alice.startMatch();
        // The buy-in came straight from the casino balance; the match is already running.
        assertEquals(List.of("alice.testnet", "don.trash.testnet"), chain.games.values().iterator().next());
        assertEquals(TEN_TRASH, balance("alice.testnet"));
        assertEquals("IN_PROGRESS", alice.phase());
        assertEquals("FUNDED", alice.economy().path("funding").asText());
        assertEquals(5, alice.last("GAME_STATE").path("ownDice").size());

        for (int i = 0; i < 2_000 && !alice.got("GAME_RESULT"); i++) rooms.tick(); // Timeouts play legal fallbacks.
        var result = alice.last("GAME_RESULT");
        assertEquals("CONFIRMED", result.path("settlement").asText());
        assertEquals(1, chain.settlements.size(), "settles exactly once");
        var payouts = chain.settlements.getFirst();
        var total = payouts.stream().map(ChainGateway.Payout::amount).reduce(BigInteger.ZERO, BigInteger::add);
        assertTrue(total.compareTo(TEN_TRASH.multiply(BigInteger.TWO)) <= 0, "never more than the pot");
        if (!result.path("winnerId").isNull()) {
            String winner = result.path("winnerId").asText().startsWith("don-") ? "don.trash.testnet" : "alice.testnet";
            assertEquals(List.of(new ChainGateway.Payout(winner, TEN_TRASH.multiply(BigInteger.TWO))), payouts);
        }
        assertEquals(TX, alice.economy().path("settlementTxHash").asText());
    }

    @Test void liarsDiceWithoutCasinoBalanceFailsAndStaysInLobby() throws Exception {
        chain.balances.put("alice.testnet", TRASH);
        var alice = new Player();
        alice.send("ROOM_CREATE", create("LIARS_DICE", session("alice.testnet"), 1, null));
        alice.ready(); alice.startMatch();
        assertEquals("FAILED", alice.economy().path("funding").asText());
        assertEquals("LOBBY", alice.phase());
        assertTrue(alice.economy().path("message").asText().contains("Alice does not have 10 TRASH"));
        assertFalse(alice.got("GAME_STATE"));
        assertEquals(TRASH, balance("alice.testnet"), "nothing was taken");
    }

    // ---------------------------------------------------------------- Blackjack

    /** Plays hands with legal timeouts until {@code hands} hands were settled or the shoe ended. */
    void playHands(Player p, int hands) throws Exception {
        for (int i = 0; i < 5_000 && chain.settlements.size() < hands && !"FINISHED".equals(p.phase()); i++) rooms.tick();
    }

    @Test void blackjackLocksEachHandAndPaysByOutcome() throws Exception {
        chain.balances.put("alice.testnet", TRASH.multiply(BigInteger.valueOf(100)));
        var alice = new Player();
        alice.send("ROOM_CREATE", create("BLACKJACK", session("alice.testnet"), 1, 2));
        assertEquals(TRASH.multiply(BigInteger.TWO).toString(), alice.economy().path("buyIn").asText(), "bet per hand");
        alice.ready(); alice.startMatch();

        // Hand 1 is funded before any card is dealt: Alice's bet and a 1.5x house stake. Don is not on-chain.
        assertEquals(List.of("alice.testnet"), chain.games.values().iterator().next());
        assertEquals(TRASH.multiply(BigInteger.valueOf(3)), chain.houseStakes.getFirst());
        assertEquals(TRASH.multiply(BigInteger.valueOf(98)), balance("alice.testnet"));
        assertTrue(alice.got("BLACKJACK_STATE"));

        playHands(alice, 3);
        assertTrue(chain.settlements.size() >= 3, "several hands were settled");
        assertTrue(chain.games.size() >= chain.settlements.size(), "each settled hand had its own game");
        // Every hand pays 0 (lose), 2 (push), 4 (win), or 5 (blackjack) TRASH, never more.
        var allowed = List.of(BigInteger.ZERO, TRASH.multiply(BigInteger.TWO), TRASH.multiply(BigInteger.valueOf(4)), TRASH.multiply(BigInteger.valueOf(5)));
        for (var payouts : chain.settlements) {
            var paid = payouts.stream().map(ChainGateway.Payout::amount).reduce(BigInteger.ZERO, BigInteger::add);
            assertTrue(allowed.contains(paid), "unexpected payout " + paid);
            payouts.forEach(p -> assertEquals("alice.testnet", p.accountId()));
        }
        assertEquals("CONFIRMED", alice.economy().path("settlement").asText());
    }

    @Test void blackjackPlayerOutOfCasinoTrashSitsOut() throws Exception {
        chain.balances.put("alice.testnet", TRASH.multiply(BigInteger.valueOf(100)));
        chain.balances.put("bob.testnet", TRASH); // Exactly one hand.
        var alice = new Player();
        alice.send("ROOM_CREATE", create("BLACKJACK", session("alice.testnet"), 0, 1));
        var bob = new Player();
        bob.send("ROOM_JOIN", Map.of("displayName", "Bob", "avatar", "FOX", "roomCode", alice.code(), "sessionToken", session("bob.testnet")));
        alice.ready(); bob.ready(); alice.startMatch();
        assertEquals(List.of("alice.testnet", "bob.testnet"), chain.games.values().iterator().next());

        // Bob can only cover hand 1 unless he wins it; play until he runs out or the shoe ends.
        for (int i = 0; i < 5_000 && !"FINISHED".equals(alice.phase()) && !alice.economy().path("message").asText().contains("Bob ran out"); i++) {
            rooms.tick();
        }
        if (alice.economy().path("message").asText().contains("Bob ran out")) {
            playHands(alice, chain.settlements.size() + 2);
            var lastGame = new ArrayList<>(chain.games.values()).getLast();
            assertEquals(List.of("alice.testnet"), lastGame, "later hands are Alice only");
            assertTrue(alice.last("BLACKJACK_STATE").path("players").size() == 1, "Bob is dealt out");
        }
        assertTrue(balance("bob.testnet").signum() >= 0);
    }

    @Test void blackjackBetMustBeAtLeastOneTrash() throws Exception {
        var alice = new Player();
        assertThrows(IllegalArgumentException.class,
            () -> alice.send("ROOM_CREATE", create("BLACKJACK", session("alice.testnet"), 0, 0)), "the schema rejects 0");
    }

    @Test void freeRoomsNeverTouchTheChain() throws Exception {
        var alice = new Player();
        alice.send("ROOM_CREATE", Map.of("displayName", "Alice", "avatar", "CAT", "game", "LIARS_DICE", "agents", 1));
        assertTrue(alice.last("ROOM_STATE").path("economy").isNull());
        alice.ready(); alice.startMatch();
        for (int i = 0; i < 2_000 && !alice.got("GAME_RESULT"); i++) rooms.tick();
        assertEquals("NOT_STARTED", alice.last("GAME_RESULT").path("settlement").asText());
        assertTrue(chain.calls.isEmpty());
    }
}
