package com.raccoonroyale.websocket;

import com.raccoonroyale.rooms.RoomService;
import java.io.IOException;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
public class GameSocketHandler extends TextWebSocketHandler {
    private final Protocol protocol;
    private final RoomService rooms;
    private final java.util.Map<String,WebSocketSession> sessions=new java.util.concurrent.ConcurrentHashMap<>();
    public GameSocketHandler(Protocol protocol,RoomService rooms) {this.protocol=protocol;this.rooms=rooms;}
    @Override public void afterConnectionEstablished(WebSocketSession session) throws IOException {
        session.setTextMessageSizeLimit(4096);
        var guarded=new ConcurrentWebSocketSessionDecorator(session,3000,65536);
        sessions.put(session.getId(),guarded);rooms.connected(guarded);
    }
    @Override protected void handleTextMessage(WebSocketSession session,TextMessage text) {
        WebSocketSession guarded=sessions.get(session.getId());
        if(guarded==null) return;
        try {rooms.handle(guarded,protocol.parseClient(text.getPayload()));}
        catch(IllegalArgumentException|IOException invalid) {rooms.invalid(guarded);}
    }
    @Override public void afterConnectionClosed(WebSocketSession session,CloseStatus status) {
        WebSocketSession guarded=sessions.remove(session.getId());
        if(guarded!=null) rooms.disconnected(guarded);
    }
}
