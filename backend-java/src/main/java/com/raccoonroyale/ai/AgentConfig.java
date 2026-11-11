package com.raccoonroyale.ai;

import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Chooses the agent brain: a live LLM when a key is configured, otherwise the labelled TEMPORARY MOCK. */
@Configuration
public class AgentConfig {
    private static final Logger log = LoggerFactory.getLogger(AgentConfig.class);

    @Bean
    AgentBrain agentBrain(@Value("${app.llm.mode}") String mode, @Value("${app.llm.base-url}") String baseUrl,
                          @Value("${app.llm.model}") String model, @Value("${app.llm.api-key}") String apiKey,
                          @Value("${app.llm.timeout-ms}") long timeoutMs) {
        boolean live = switch (mode.toLowerCase()) {
            case "mock" -> false;
            case "live" -> {
                if (apiKey.isBlank()) throw new IllegalStateException("LLM_MODE=live requires LLM_API_KEY");
                yield true;
            }
            default -> !apiKey.isBlank();
        };
        if (!live) {
            log.warn("Agents use the TEMPORARY MOCK brain (no LLM). Set LLM_API_KEY in .env to use a live model.");
            return new MockAgentBrain();
        }
        log.info("Agents use a live LLM: model {} at {}", model, baseUrl);
        return new LlmAgentBrain(baseUrl, model, apiKey, Duration.ofMillis(timeoutMs));
    }
}
