package com.raccoonroyale.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.raccoonroyale.websocket.Protocol;
import java.io.IOException;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * Turns untrusted model text into a proposed action. Rejects anything outside the shared {@code AgentAction}
 * schema, actions not allowed for the task, and token amounts where no payment is possible. The engine still
 * validates game legality afterwards; this parser only decides whether the reply is well-formed.
 */
@Component
public class AgentActionParser {
    public static final int MAX_MESSAGE = 280;
    public static final Set<String> TURN_ACTIONS = Set.of("BID", "CALL_BLUFF");
    public static final Set<String> CHAT_ACTIONS = Set.of("CHAT");

    public record Proposal(String action, AgentContext.Bid bid, String message) {}

    public static class InvalidAgentOutput extends RuntimeException {
        public InvalidAgentOutput(String reason) { super(reason); }
    }

    private final Protocol protocol;

    public AgentActionParser(Protocol protocol) { this.protocol = protocol; }

    public Proposal parse(String raw, Set<String> allowed) {
        if (raw == null || raw.isBlank()) throw new InvalidAgentOutput("empty reply");
        JsonNode node;
        try {
            node = protocol.readStrict(firstJsonObject(raw));
        } catch (IOException malformed) {
            throw new InvalidAgentOutput("not valid JSON");
        }
        var errors = protocol.agentActionErrors(node);
        if (!errors.isEmpty()) throw new InvalidAgentOutput("schema: " + String.join("; ", errors));
        String action = node.get("action").asText();
        if (!allowed.contains(action)) throw new InvalidAgentOutput("action " + action + " is not allowed here");
        // No payment can happen through a move or chat reply, so any non-zero amount is invalid.
        if (!node.get("proposedPrice").asText().equals("0")) throw new InvalidAgentOutput("unexpected token amount");
        JsonNode bidNode = node.get("bid");
        AgentContext.Bid bid = null;
        if (action.equals("BID")) {
            if (bidNode.isNull()) throw new InvalidAgentOutput("BID without a bid");
            bid = new AgentContext.Bid(bidNode.get("quantity").asInt(), bidNode.get("face").asInt());
        }
        String message = node.get("message").asText().strip();
        if (message.length() > MAX_MESSAGE) message = message.substring(0, MAX_MESSAGE);
        if (action.equals("CHAT") && message.isEmpty()) throw new InvalidAgentOutput("CHAT without a message");
        return new Proposal(action, bid, message);
    }

    /** Models often wrap JSON in prose or code fences. Take the first balanced top-level object only. */
    static String firstJsonObject(String raw) {
        int start = raw.indexOf('{');
        if (start < 0) throw new InvalidAgentOutput("no JSON object");
        int depth = 0;
        boolean inString = false, escaped = false;
        for (int i = start; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (inString) {
                if (escaped) escaped = false;
                else if (c == '\\') escaped = true;
                else if (c == '"') inString = false;
            } else if (c == '"') inString = true;
            else if (c == '{') depth++;
            else if (c == '}' && --depth == 0) return raw.substring(start, i + 1);
        }
        throw new InvalidAgentOutput("unterminated JSON object");
    }
}
