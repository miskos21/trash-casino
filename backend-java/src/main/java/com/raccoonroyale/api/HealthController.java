package com.raccoonroyale.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
    public record HealthResponse(String status, String service, String network, int protocolVersion) {}

    @GetMapping("/api/health")
    public HealthResponse health() {
        return new HealthResponse("UP", "raccoon-royale-backend", "testnet", 1);
    }
}
