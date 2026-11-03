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
}
