package com.raccoonroyale.ai;

import java.util.concurrent.CompletableFuture;

/**
 * Produces an agent's raw reply text for a context. The reply is untrusted: {@link AgentActionParser} validates it
 * and the game engine validates the resulting action before anything changes.
 */
public interface AgentBrain {
    CompletableFuture<String> respond(AgentContext context);

    /** {@code LLM} for a live model, {@code TEMPORARY_MOCK} for the labelled offline mock. */
    String mode();
}
