package com.raccoonroyale.config;

import com.raccoonroyale.websocket.GameSocketHandler;
import java.util.Arrays;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {
    private final GameSocketHandler handler;
    private final String origin;

    public WebSocketConfig(GameSocketHandler handler, @Value("${app.web-origin}") String origin) {
        this.handler = handler;
        this.origin = origin;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws").setAllowedOrigins(
            Arrays.stream(origin.split(",")).map(String::trim).toArray(String[]::new));
    }
}
