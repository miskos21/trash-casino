package com.raccoonroyale.rooms;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.raccoonroyale.websocket.Protocol;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

class RoomServiceTest {
    @Test void disconnectIsVisibleAndReconnectRestoresOnlyThatSeat() throws Exception {
        var host = new Guest(); host.create(); var guest = new Guest(); guest.join(host);
        host.ready(); guest.ready(); host.start();
        var dice = guest.last("GAME_STATE").path("ownDice");
        rooms.disconnected(guest.socket);
        var absent = host.last("ROOM_STATE").path("participants").get(1);
        assertFalse(absent.path("connected").asBoolean());
        assertEquals("DISCONNECTED", absent.path("presence").asText());
        var replacement = new Guest();
        replacement.send("PLAYER_RECONNECT", Map.of("roomId", guest.roomId(), "resumeToken", guest.last("ROOM_SESSION").path("resumeToken").asText()));
        assertEquals("ONLINE", host.last("ROOM_STATE").path("participants").get(1).path("presence").asText());
        assertEquals(dice, replacement.last("GAME_STATE").path("ownDice"));
    }

    @Test void explicitLeaveIsAcknowledgedForfeitsDiceAndRevokesRecovery() throws Exception {
        var host = new Guest(); host.create(); var guest = new Guest(); guest.join(host);
        host.ready(); guest.ready(); host.start();
        String token = guest.last("ROOM_SESSION").path("resumeToken").asText();
        String room = guest.roomId();
        guest.send("ROOM_LEAVE", Map.of("roomId", room), "leave-once");
        assertEquals(room, guest.last("ROOM_LEFT").path("roomId").asText());
        assertEquals("LEFT", host.last("ROOM_STATE").path("participants").get(1).path("presence").asText());
        assertEquals(0, host.last("GAME_STATE").path("publicState").path("participants").get(1).path("diceCount").asInt());
        guest.send("ROOM_LEAVE", Map.of("roomId", room), "leave-once");
        assertEquals(room, guest.last("ROOM_LEFT").path("roomId").asText());
        var replacement = new Guest(); replacement.send("PLAYER_RECONNECT", Map.of("roomId", room, "resumeToken", token));
        assertEquals("INVALID_SESSION", replacement.last("ERROR").path("code").asText());
        guest.send("PLAYER_BID", host.bid(1, 1, 1));
        assertEquals("INVALID_SESSION", guest.last("ERROR").path("code").asText());
    }

    @Test void leavingTwoPlayerMatchEndsItAtOnceAndTheLeaverKeepsTheirChips() throws Exception {
        var host = new Guest(); host.send("ROOM_CREATE", Map.of("displayName", "Host", "avatar", "CAT", "agents", 0));
        var guest = new Guest(); guest.join(host); host.ready(); guest.ready(); host.start();
        guest.send("ROOM_LEAVE", Map.of("roomId", guest.roomId()));
        assertEquals("FINISHED", host.last("ROOM_STATE").path("phase").asText());
        var result = host.last("GAME_RESULT");
        assertTrue(result.path("winnerId").isNull(), "5 chips each: a tie, nobody lost anything by leaving");
        for (var standing : result.path("standings")) assertEquals(5, standing.path("chips").asInt());
    }

    @Test void onlyTheHostCanEndAChipMatchAndStandingsBecomeFinal() throws Exception {
        var host = new Guest(); host.send("ROOM_CREATE", Map.of("displayName", "Host", "avatar", "CAT", "agents", 1));
        var guest = new Guest(); guest.join(host); host.ready(); guest.ready(); host.start();
        String matchId = host.last("GAME_STATE").path("publicState").path("matchId").asText();
        guest.send("MATCH_END", Map.of("roomId", guest.roomId(), "matchId", matchId));
        assertEquals("NOT_HOST", guest.last("ERROR").path("code").asText());
        host.send("PLAYER_BID", host.bid(15, 6, 0)); // Unlikely to be met, so a bluff call moves a chip.
        guest.send("CALL_BLUFF", Map.of("matchId", matchId, "expectedRevision", 1));
        var chips = host.last("GAME_STATE").path("publicState").path("participants");
        int total = 0;
        for (var p : chips) { assertEquals(5, p.path("diceCount").asInt()); total += p.path("chips").asInt(); }
        assertEquals(15, total, "Chips move between players and are never created or destroyed");
        host.send("MATCH_END", Map.of("roomId", host.roomId(), "matchId", matchId));
        assertEquals("FINISHED", host.last("ROOM_STATE").path("phase").asText());
        var result = guest.last("GAME_RESULT");
        assertEquals(3, result.path("standings").size());
        assertEquals("GAME_OVER", host.last("GAME_STATE").path("publicState").path("history").get(
            host.last("GAME_STATE").path("publicState").path("history").size() - 1).path("type").asText());
        host.send("MATCH_END", Map.of("roomId", host.roomId(), "matchId", matchId));
        assertEquals("ILLEGAL_ACTION", host.last("ERROR").path("code").asText());
    }

    @Test void blackjackDepartureDoesNotKeepPlayingNewHandsAndCannotJoinMidShoe() throws Exception {
        var host = new Guest(); host.send("ROOM_CREATE", Map.of("displayName", "Host", "avatar", "CAT", "game", "BLACKJACK", "agents", 0));
        var guest = new Guest(); guest.join(host); host.ready(); guest.ready(); host.start();
        guest.send("ROOM_LEAVE", Map.of("roomId", guest.roomId())); // During the shuffle.
        rooms.tick();
        assertEquals(1, host.last("BLACKJACK_STATE").path("players").size());
        assertEquals(host.id(), host.last("BLACKJACK_STATE").path("players").get(0).path("playerId").asText());
        var stranger = new Guest(); stranger.join(host);
        assertEquals("ROOM_STARTED", stranger.last("ERROR").path("code").asText());
    }

    @Test void heartbeatTimeoutClosesHalfOpenSocketButAllowsGuestRecovery() throws Exception {
        var host = new Guest(); host.create();
        rooms.expireConnections(System.currentTimeMillis() + 45_001);
        verify(host.socket).close(org.springframework.web.socket.CloseStatus.SESSION_NOT_RELIABLE);
        var replacement = new Guest();
        replacement.send("PLAYER_RECONNECT", Map.of("roomId", host.roomId(), "resumeToken", host.last("ROOM_SESSION").path("resumeToken").asText()));
        assertEquals(host.id(), replacement.id());
        assertEquals("ONLINE", replacement.last("ROOM_STATE").path("participants").get(0).path("presence").asText());
    }
    ObjectMapper mapper = new ObjectMapper();
    Protocol protocol;
    RoomService rooms;
    @BeforeEach void setup() throws Exception { protocol = new Protocol(mapper); rooms = new RoomService(protocol, 0, 0, 0); }
    class Guest {
        // TEMPORARY MOCK: WebSocket transport in unit tests only; game state uses the real engine.
        WebSocketSession socket = mock(WebSocketSession.class);
        List<JsonNode> received = new ArrayList<>();
        Guest() throws Exception {
            when(socket.getId()).thenReturn(UUID.randomUUID().toString()); when(socket.isOpen()).thenReturn(true);
            doAnswer(invocation -> { received.add(mapper.readTree(((TextMessage) invocation.getArgument(0)).getPayload())); return null; })
                .when(socket).sendMessage(any());
            rooms.connected(socket);
        }
        void send(String type, Object payload) throws Exception { send(type, payload, UUID.randomUUID().toString()); }
        void send(String type, Object payload, String id) throws Exception {
            rooms.handle(socket, protocol.parseClient(mapper.writeValueAsString(Map.of("protocolVersion", 1, "type", type, "requestId", id, "payload", payload))));
        }
        JsonNode last(String type) { return received.stream().filter(n -> n.path("type").asText().equals(type)).reduce((a,b) -> b).orElseThrow().get("payload"); }
        String id() { return last("ROOM_SESSION").path("playerId").asText(); }
        String roomId() { return last("ROOM_SESSION").path("roomId").asText(); }
        void create() throws Exception { send("ROOM_CREATE", Map.of("displayName", "Host", "avatar", "CAT")); }
        void join(Guest host) throws Exception { send("ROOM_JOIN", Map.of("displayName", "Guest", "avatar", "CAPYBARA", "roomCode", host.last("ROOM_SESSION").path("roomCode").asText())); }
        void ready() throws Exception { send("ROOM_READY", Map.of("roomId", roomId(), "ready", true)); }
        void start() throws Exception { send("ROOM_START", Map.of("roomId", roomId())); }
        Map<String,Object> bid(int quantity, int face, long revision) {
            return Map.of("matchId", last("GAME_STATE").path("publicState").path("matchId").asText(), "expectedRevision", revision, "bid", Map.of("quantity", quantity, "face", face));
        }
    }
    @Test void capacityReadinessHostAndSessionIsolation() throws Exception {
        var host = new Guest(); host.create(); var guest = new Guest(); guest.join(host);
        guest.start(); assertEquals("NOT_HOST", guest.last("ERROR").path("code").asText());
        host.start(); assertEquals("NOT_READY", host.last("ERROR").path("code").asText());
        var third = new Guest(); third.join(host); var extra = new Guest(); extra.join(host);
        assertEquals("ROOM_FULL", extra.last("ERROR").path("code").asText());
        assertEquals(4, host.last("ROOM_STATE").path("participants").size());
        assertFalse(host.last("ROOM_STATE").toString().contains(guest.last("ROOM_SESSION").path("resumeToken").asText()));
        host.ready(); guest.ready(); third.ready(); host.start();
        for(var player : List.of(host, guest, third)) {
            var state = player.last("GAME_STATE"); assertEquals(5, state.path("ownDice").size());
            for(var p : state.path("publicState").path("participants")) assertFalse(p.has("dice"));
        }
        extra.send("PLAYER_BID", host.bid(1, 1, 0));
        assertEquals("INVALID_SESSION", extra.last("ERROR").path("code").asText());
    }
    @Test void illegalTurnStaleRevisionAndDuplicateRequestDoNotMutateState() throws Exception {
        var host = new Guest(); host.create(); var guest = new Guest(); guest.join(host);
        host.ready(); guest.ready(); host.start();
        guest.send("PLAYER_BID", guest.bid(1, 1, 0)); assertEquals("ILLEGAL_ACTION", guest.last("ERROR").path("code").asText());
        var action = host.bid(1, 1, 0);
        host.send("PLAYER_BID", action, "same-request"); host.send("PLAYER_BID", action, "same-request");
        assertEquals(1, host.last("GAME_STATE").path("publicState").path("revision").asLong());
        var history=host.last("GAME_STATE").path("publicState").path("history");
        assertEquals(2,history.size());
        assertEquals("BID",history.get(1).path("type").asText());
        assertEquals(host.id(),history.get(1).path("actorId").asText());
        assertEquals("PLAYER",history.get(1).path("cause").asText());
        assertEquals(history,guest.last("GAME_STATE").path("publicState").path("history"));
        assertFalse(history.toString().contains("ownDice"));
        assertFalse(history.toString().contains("resumeToken"));
        guest.send("PLAYER_BID", guest.bid(2, 1, 0)); assertEquals("STALE_STATE", guest.last("ERROR").path("code").asText());
        guest.send("PLAYER_BID", guest.bid(1, 1, 1)); assertEquals("ILLEGAL_ACTION", guest.last("ERROR").path("code").asText());
        assertEquals(1, guest.last("GAME_STATE").path("publicState").path("revision").asLong());
    }
    @Test void timeoutsAndNpcCompleteFullMatchAndAllowRematch() throws Exception {
        var host = new Guest(); host.create(); host.ready(); host.start();
        String first = host.last("GAME_STATE").path("publicState").path("matchId").asText();
        for(int turn=0; turn<100 && !host.last("ROOM_STATE").path("phase").asText().equals("FINISHED"); turn++) rooms.tick();
        assertEquals("FINISHED", host.last("ROOM_STATE").path("phase").asText());
        assertEquals("NOT_STARTED", host.last("GAME_RESULT").path("settlement").asText());
        var reveal = host.last("DICE_REVEAL"); assertEquals(2, reveal.path("dice").size());
        assertTrue(reveal.path("actualCount").asInt() <= 10);
        var history=host.last("GAME_STATE").path("publicState").path("history");
        assertTrue(history.size()<=60);
        assertEquals("GAME_OVER",history.get(history.size()-1).path("type").asText());
        assertTrue(java.util.stream.StreamSupport.stream(history.spliterator(),false)
            .anyMatch(event->event.path("cause").asText().equals("TIMEOUT")));
        host.ready(); host.start();
        assertNotEquals(first, host.last("GAME_STATE").path("publicState").path("matchId").asText());
        assertEquals(5, host.last("GAME_STATE").path("ownDice").size());
        assertEquals(1,host.last("GAME_STATE").path("publicState").path("history").size());
    }
    @Test void reconnectRequiresSecretAndOldCloseDoesNotDetachNewSocket() throws Exception {
        var host = new Guest(); host.create(); host.ready(); host.start();
        var attacker = new Guest(); attacker.send("PLAYER_RECONNECT", Map.of("roomId", host.roomId(), "resumeToken", "a".repeat(43)));
        assertEquals("INVALID_SESSION", attacker.last("ERROR").path("code").asText());
        var replacement = new Guest(); replacement.send("PLAYER_RECONNECT", Map.of("roomId", host.roomId(), "resumeToken", host.last("ROOM_SESSION").path("resumeToken").asText()));
        assertEquals(host.id(), replacement.id());
        assertEquals(host.last("GAME_STATE").path("ownDice"), replacement.last("GAME_STATE").path("ownDice"));
        assertEquals(host.last("GAME_STATE").path("publicState").path("history"),
            replacement.last("GAME_STATE").path("publicState").path("history"));
        rooms.disconnected(host.socket);
        assertTrue(replacement.last("ROOM_STATE").path("participants").get(0).path("connected").asBoolean());
        replacement.send("PLAYER_BID", replacement.bid(1, 1, 0));
        assertEquals(1, replacement.last("GAME_STATE").path("publicState").path("revision").asInt());
    }
    @Test void leavingLobbyTransfersHostAndFreesSeat() throws Exception {
        var host = new Guest(); host.create(); var guest = new Guest(); guest.join(host);
        host.send("ROOM_LEAVE", Map.of("roomId", host.roomId()));
        assertEquals(guest.id(), guest.last("ROOM_STATE").path("hostId").asText());
        assertEquals(2, guest.last("ROOM_STATE").path("participants").size());
        guest.ready(); guest.start(); assertEquals("IN_PROGRESS", guest.last("ROOM_STATE").path("phase").asText());
    }
    @Test void abandonedSeatDoesNotBlockLobbyAfterMatch() throws Exception {
        var host = new Guest(); host.create(); var guest = new Guest(); guest.join(host);
        host.ready(); guest.ready(); host.start();
        guest.send("ROOM_LEAVE", Map.of("roomId", guest.roomId()));
        for(int turn=0; turn<150 && !host.last("ROOM_STATE").path("phase").asText().equals("FINISHED"); turn++) rooms.tick();
        rooms.tick();
        assertEquals("FINISHED", host.last("ROOM_STATE").path("phase").asText());
        assertEquals(2, host.last("ROOM_STATE").path("participants").size());
        host.ready(); host.start();
        assertEquals("IN_PROGRESS", host.last("ROOM_STATE").path("phase").asText());
    }
    @Test void blackjackRoomDealsHumansHidesHoleCardAndValidatesTurns() throws Exception {
        var host = new Guest(); host.send("ROOM_CREATE", Map.of("displayName", "Host", "avatar", "CAT", "game", "BLACKJACK", "agents", 0));
        var guest = new Guest(); guest.join(host);
        assertEquals("BLACKJACK", guest.last("ROOM_STATE").path("game").asText());
        host.ready(); guest.ready(); host.start();
        var shuffle = host.last("BLACKJACK_STATE");
        assertEquals("SHUFFLING", shuffle.path("handPhase").asText()); // The dealer shuffles before any card is dealt.
        assertEquals(0, shuffle.path("players").get(0).path("cards").size());
        String commitment = shuffle.path("shoe").path("commitment").asText();
        assertTrue(commitment.matches("[0-9a-f]{64}"));
        assertTrue(shuffle.path("shoe").path("reveal").isNull());
        assertEquals(311, shuffle.path("cardsRemaining").asInt()); // Six decks minus the burn card.
        rooms.tick();
        String matchId = host.last("BLACKJACK_STATE").path("matchId").asText();
        for(var player : List.of(host, guest)) {
            var state = player.last("BLACKJACK_STATE");
            assertEquals(2, state.path("players").size()); // No agents; the house dealer has no seat or hand.
            assertFalse(state.path("dealer").has("playerId"));
            if(state.path("handPhase").asText().equals("PLAYING")) {
                assertEquals(1, state.path("dealer").path("cards").size());
                assertEquals(1, state.path("dealer").path("hiddenCards").asInt());
            }
            assertTrue(player.received.stream().noneMatch(n -> n.path("type").asText().equals("GAME_STATE")));
        }
        host.send("PLAYER_BID", Map.of("matchId", matchId, "expectedRevision", 0, "bid", Map.of("quantity", 1, "face", 1)));
        assertEquals("ILLEGAL_ACTION", host.last("ERROR").path("code").asText());
        for(int turn=0; turn<4 && host.last("BLACKJACK_STATE").path("handPhase").asText().equals("PLAYING"); turn++) {
            var state = host.last("BLACKJACK_STATE");
            long revision = state.path("revision").asLong();
            var mover = state.path("currentPlayerId").asText().equals(host.id()) ? host : guest;
            var other = mover == host ? guest : host;
            other.send("BLACKJACK_STAND", Map.of("matchId", matchId, "expectedRevision", revision));
            assertEquals("ILLEGAL_ACTION", other.last("ERROR").path("code").asText());
            mover.send("BLACKJACK_HIT", Map.of("matchId", matchId, "expectedRevision", revision + 1));
            assertEquals("STALE_STATE", mover.last("ERROR").path("code").asText());
            assertEquals(revision, host.last("BLACKJACK_STATE").path("revision").asLong());
            mover.send("BLACKJACK_STAND", Map.of("matchId", matchId, "expectedRevision", revision));
        }
        var done = guest.last("BLACKJACK_STATE");
        assertEquals("RESULT", done.path("handPhase").asText());
        assertEquals("IN_PROGRESS", done.path("phase").asText()); // The shoe continues with another hand.
        assertEquals("IN_PROGRESS", guest.last("ROOM_STATE").path("phase").asText());
        assertEquals(0, done.path("dealer").path("hiddenCards").asInt());
        assertTrue(done.path("dealer").path("cards").size() >= 2);
        for(var hand : done.path("players")) {
            assertFalse(hand.path("outcome").isNull());
            var tally = hand.path("tally");
            assertEquals(1, tally.path("wins").asInt() + tally.path("losses").asInt() + tally.path("pushes").asInt());
        }
        long resultRevision = done.path("revision").asLong();
        guest.send("BLACKJACK_STAND", Map.of("matchId", matchId, "expectedRevision", resultRevision));
        assertEquals("ILLEGAL_ACTION", guest.last("ERROR").path("code").asText()); // No moves between hands.
        rooms.tick(); // The result pause is zero in tests.
        var second = host.last("BLACKJACK_STATE");
        assertEquals(2, second.path("hand").asInt());
        assertEquals(matchId, second.path("matchId").asText());
        assertTrue(second.path("cardsRemaining").asInt() < done.path("cardsRemaining").asInt()); // Same shoe, not reshuffled.
        if(second.path("handPhase").asText().equals("PLAYING")) assertEquals(1, second.path("dealer").path("hiddenCards").asInt());
        // Record every settled hand this player witnessed, then verify them against the revealed shoe order.
        var witnessed = new ArrayList<JsonNode>(List.of(done));
        for(int tick=0; tick<5000 && !host.last("ROOM_STATE").path("phase").asText().equals("FINISHED"); tick++) {
            rooms.tick();
            var latest = host.last("BLACKJACK_STATE");
            if(latest.path("handPhase").asText().equals("RESULT") && latest.path("hand").asInt() != witnessed.getLast().path("hand").asInt())
                witnessed.add(latest);
        }
        var shoe = host.last("BLACKJACK_STATE");
        var reveal = shoe.path("shoe").path("reveal");
        var order = new ArrayList<String>();
        for(var card : reveal.path("order")) order.add(card.path("rank").asText() + card.path("suit").asText());
        assertEquals(commitment, com.raccoonroyale.games.BlackjackGame.sha256(reveal.path("salt").asText() + ":" + String.join(",", order)));
        assertEquals(commitment, shoe.path("shoe").path("commitment").asText());
        assertEquals(312, order.size());
        for(var hand : witnessed) {
            // Casino deal order: each player then the dealer, twice; then each player's hits in seat order; then the dealer.
            var dealt = new ArrayList<String>();
            var players = hand.path("players"); var dealer = hand.path("dealer").path("cards");
            for(int round = 0; round < 2; round++) {
                for(var player : players) dealt.add(card(player.path("cards").get(round)));
                dealt.add(card(dealer.get(round)));
            }
            for(var player : players) for(int i = 2; i < player.path("cards").size(); i++) dealt.add(card(player.path("cards").get(i)));
            for(int i = 2; i < dealer.size(); i++) dealt.add(card(dealer.get(i)));
            int start = hand.path("shoe").path("handStart").asInt();
            assertEquals(order.subList(start, start + dealt.size()), dealt, "hand " + hand.path("hand").asInt());
        }
        assertEquals("FINISHED", shoe.path("phase").asText());
        assertTrue(shoe.path("hand").asInt() > 2);
        assertTrue(shoe.path("cardsRemaining").asInt() <= 78);
        assertEquals(0, shoe.path("nextHandAtEpochMillis").asLong());
        host.ready(); guest.ready(); host.start();
        assertNotEquals(matchId, host.last("BLACKJACK_STATE").path("matchId").asText());
        assertEquals(0, host.last("BLACKJACK_STATE").path("hand").asInt()); // A fresh shoe is shuffled.
        assertNotEquals(commitment, host.last("BLACKJACK_STATE").path("shoe").path("commitment").asText());
    }
    static String card(JsonNode card) { return card.path("rank").asText() + card.path("suit").asText(); }
    @Test void blackjackTimeoutStandsAndAgentsPlayTheirOwnHands() throws Exception {
        var host = new Guest(); host.send("ROOM_CREATE", Map.of("displayName", "Host", "avatar", "FROG", "game", "BLACKJACK", "agents", 2));
        assertEquals(List.of("Host", "Don Raccoone", "Foxy"), java.util.stream.StreamSupport.stream(
            host.last("ROOM_STATE").path("participants").spliterator(), false).map(p -> p.path("displayName").asText()).toList());
        host.ready(); host.start();
        for(int tick=0; tick<40 && !host.last("BLACKJACK_STATE").path("handPhase").asText().equals("RESULT"); tick++) rooms.tick();
        var state = host.last("BLACKJACK_STATE");
        assertEquals("RESULT", state.path("handPhase").asText());
        var players = state.path("players");
        assertEquals(3, players.size());
        var status = players.get(0).path("status").asText();
        assertTrue(status.equals("STOOD") || status.equals("BLACKJACK"), status); // The human timed out and stood.
        for(int i = 1; i < 3; i++) {
            var agent = players.get(i);
            assertTrue(agent.path("npc").asBoolean());
            // Rule-based agents stop at 17 or more unless the dealer's natural ended the hand first.
            assertTrue(agent.path("total").asInt() >= 17 || state.path("dealer").path("cards").size() == 2
                && state.path("dealer").path("total").asInt() == 21, agent.toString());
        }
    }
    @Test void agentCountControlsSeatsCapacityAndDiceMinimum() throws Exception {
        var solo = new Guest(); solo.send("ROOM_CREATE", Map.of("displayName", "Solo", "avatar", "CAT", "agents", 0));
        assertEquals(1, solo.last("ROOM_STATE").path("participants").size());
        solo.ready(); solo.start();
        assertEquals("NOT_READY", solo.last("ERROR").path("code").asText()); // Liar's Dice needs two participants.
        var host = new Guest(); host.send("ROOM_CREATE", Map.of("displayName", "Host", "avatar", "CAT", "agents", 2));
        var guest = new Guest(); guest.join(host); var third = new Guest(); third.join(host);
        assertEquals("ROOM_FULL", third.last("ERROR").path("code").asText());
        var seats = host.last("ROOM_STATE").path("participants");
        assertEquals(List.of(false, false, true, true), java.util.stream.StreamSupport.stream(seats.spliterator(), false)
            .map(p -> p.path("npc").asBoolean()).toList()); // Humans sit before agents.
        host.ready(); guest.ready(); host.start();
        assertEquals(4, host.last("GAME_STATE").path("publicState").path("participants").size());
        assertThrows(IllegalArgumentException.class, () -> protocol.parseClient(mapper.writeValueAsString(Map.of("protocolVersion", 1,
            "type", "ROOM_CREATE", "requestId", "x", "payload", Map.of("displayName", "A", "avatar", "CAT", "agents", 3)))));
    }
}
