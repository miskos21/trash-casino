package com.raccoonroyale.websocket;

import java.io.IOException;
import java.util.Map;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
public class GameSocketHandler extends TextWebSocketHandler {
    private final Protocol protocol;

    public GameSocketHandler(Protocol protocol) { this.protocol = protocol; }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws IOException {
        session.setTextMessageSizeLimit(4096);
        session.sendMessage(new TextMessage(protocol.message("CONNECTED", null,
            Map.of("service", "raccoon-royale-backend"))));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage text) throws IOException {
        String reply;
        try {
            var message = protocol.parseClient(text.getPayload());
            reply = message.get("type").asText().equals("PING")
                ? protocol.message("PONG", message.get("requestId"), Map.of())
                : protocol.error("NOT_IMPLEMENTED", message.get("requestId"));
        } catch (IllegalArgumentException | IOException invalid) {
            // Never echo untrusted input or schema errors containing player data.
            reply = protocol.error("INVALID_MESSAGE", null);
        }
        session.sendMessage(new TextMessage(reply));
    }
}
