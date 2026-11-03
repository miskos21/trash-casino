package com.raccoonroyale.api;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersion;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.net.http.WebSocketHandshakeException;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletionException;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class TransportIntegrationTest {
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    private final HttpClient client = HttpClient.newHttpClient();

    @Test void healthMatchesSharedSchema() throws Exception {
        var response = client.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/health")).GET().build(),
            HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode());
        assertSchema("HealthResponse", mapper.readTree(response.body()));
    }

    @Test void websocketActuallyRoundTripsAndMatchesServerContract() throws Exception {
        var inbox = new Inbox();
        var socket = connect(inbox);
        try {
            assertEquals("CONNECTED", receive(inbox).get("type").asText());
            socket.sendText("""
                {"protocolVersion":1,"type":"PING","requestId":"r1","payload":{}}
                """, true).join();
            var pong = receive(inbox);
            assertEquals("PONG", pong.get("type").asText());
            assertEquals("r1", pong.get("requestId").asText());
        } finally { socket.abort(); }
    }

    @Test void rejectsMalformedUnknownFieldsAndServerOnlyMessages() throws Exception {
        var inbox = new Inbox();
        var socket = connect(inbox);
        try {
            receive(inbox);
            for (String invalid : new String[] { "not-json", "null", "{}",
                "{\"protocolVersion\":1,\"type\":\"PING\",\"requestId\":null,\"payload\":{},\"wallet\":\"victim.testnet\"}",
                "{\"protocolVersion\":1,\"type\":\"PONG\",\"requestId\":null,\"payload\":{}}",
                "{\"protocolVersion\":1,\"type\":\"PING\",\"requestId\":null,\"payload\":{}} {}",
                "{\"protocolVersion\":1,\"type\":\"PING\",\"type\":\"PING\",\"requestId\":null,\"payload\":{}}" }) {
                socket.sendText(invalid, true).join();
                assertEquals("INVALID_MESSAGE", receive(inbox).path("payload").path("code").asText());
            }
        } finally { socket.abort(); }
    }

    @Test void roomsCreateServerIssuedGuestSessions() throws Exception {
        var inbox = new Inbox();
        var socket = connect(inbox);
        try {
            receive(inbox);
            socket.sendText("""
                {"protocolVersion":1,"type":"ROOM_CREATE","requestId":"create-1","payload":{"displayName":"Judge","avatar":"RACCOON"}}
                """, true).join();
            var session = receive(inbox);
            assertEquals("ROOM_SESSION", session.path("type").asText());
            assertEquals(43, session.path("payload").path("resumeToken").asText().length());
            var room = receive(inbox);
            assertEquals("ROOM_STATE", room.path("type").asText());
            assertEquals(2, room.path("payload").path("participants").size());
        } finally { socket.abort(); }
    }

    @Test void rejectsUnapprovedBrowserOrigin() {
        var thrown = assertThrows(CompletionException.class, () -> client.newWebSocketBuilder()
            .header("Origin", "https://unapproved.example")
            .buildAsync(URI.create("ws://localhost:" + port + "/ws"), new Inbox()).join());
        var handshake = assertInstanceOf(WebSocketHandshakeException.class, thrown.getCause());
        assertEquals(403, handshake.getResponse().statusCode());
    }

    @Test void acceptsViteLoopbackOrigin() throws Exception {
        var inbox = new Inbox();
        var socket = client.newWebSocketBuilder().header("Origin", "http://127.0.0.1:5173")
            .buildAsync(URI.create("ws://localhost:" + port + "/ws"), inbox).join();
        try { assertEquals("CONNECTED", receive(inbox).path("type").asText()); }
        finally { socket.abort(); }
    }

    private WebSocket connect(Inbox inbox) {
        return client.newWebSocketBuilder().header("Origin", "http://localhost:5173")
            .buildAsync(URI.create("ws://localhost:" + port + "/ws"), inbox).join();
    }

    private JsonNode receive(Inbox inbox) throws Exception {
        String text = inbox.messages.poll(5, TimeUnit.SECONDS);
        assertNotNull(text, "Timed out awaiting WebSocket message");
        var value = mapper.readTree(text);
        assertSchema("ServerMessage", value);
        return value;
    }

    private void assertSchema(String definition, JsonNode value) throws Exception {
        try (var input = getClass().getResourceAsStream("/schemas/api.schema.json")) {
            var root = mapper.readTree(input);
            var schema = mapper.createObjectNode();
            schema.set("$defs", root.get("$defs"));
            schema.put("$ref", "#/$defs/" + definition);
            var validator = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(schema);
            assertTrue(validator.validate(value).isEmpty(), () -> validator.validate(value).toString());
        }
    }

    private static class Inbox implements WebSocket.Listener {
        final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
        final StringBuilder fragments = new StringBuilder();
        @Override public void onOpen(WebSocket socket) { socket.request(1); }
        @Override public CompletionStage<?> onText(WebSocket socket, CharSequence data, boolean last) {
            fragments.append(data);
            if (last) { messages.add(fragments.toString()); fragments.setLength(0); }
            socket.request(1);
            return null;
        }
    }
}
