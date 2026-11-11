package com.raccoonroyale.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * Calls any OpenAI-compatible chat completions API (Groq, xAI, NEAR AI Cloud, ...). The API key stays in this
 * object and is sent only in the Authorization header; it never enters a prompt, a log line, or a client message.
 */
public class LlmAgentBrain implements AgentBrain {
    private final HttpClient http;
    private final ObjectMapper json = new ObjectMapper();
    private final URI endpoint;
    private final String model, apiKey;
    private final Duration timeout;

    public LlmAgentBrain(String baseUrl, String model, String apiKey, Duration timeout) {
        this.endpoint = URI.create(baseUrl.replaceAll("/+$", "") + "/chat/completions");
        this.model = model;
        this.apiKey = apiKey;
        this.timeout = timeout;
        this.http = HttpClient.newBuilder().connectTimeout(timeout).build();
    }

    @Override public String mode() { return "LLM"; }

    @Override
    public CompletableFuture<String> respond(AgentContext context) {
        String body;
        try {
            body = json.writeValueAsString(Map.of(
                "model", model,
                "temperature", 0.8,
                "max_tokens", 1500, // Reasoning models spend part of this before the answer.
                "messages", List.of(
                    Map.of("role", "system", "content", AgentPrompt.system(context)),
                    Map.of("role", "user", "content", AgentPrompt.user(context)))));
        } catch (Exception impossible) {
            return CompletableFuture.failedFuture(impossible);
        }
        var request = HttpRequest.newBuilder(endpoint).timeout(timeout)
            .header("Authorization", "Bearer " + apiKey).header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body)).build();
        return http.sendAsync(request, HttpResponse.BodyHandlers.ofString()).thenApply(response -> {
            // Only the status is surfaced; provider error bodies may echo request details.
            if (response.statusCode() != 200) throw new IllegalStateException("LLM HTTP " + response.statusCode());
            try {
                return json.readTree(response.body()).path("choices").path(0).path("message").path("content").asText("");
            } catch (Exception malformed) {
                throw new IllegalStateException("LLM response is not JSON");
            }
        });
    }
}
