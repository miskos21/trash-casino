package com.raccoonroyale.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * TEMPORARY MOCK: an offline stand-in for the LLM so the game runs without an API key. It is not a language
 * model. It plays reasonable Liar's Dice from the agent's own dice and answers chat with canned in-character
 * lines. Its replies go through the same parser and engine validation as a live model's.
 */
public class MockAgentBrain implements AgentBrain {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Map<AgentContext.Persona, List<String>> TALK = Map.of(
        AgentContext.Persona.DON, List.of("You're sweating, kid.", "Nice table. Shame if someone lost on it.",
            "Bold claim. I like bold.", "The Don has seen better bluffs at a fish market."),
        AgentContext.Persona.FOXY, List.of("Ooh, this is getting spicy!", "I totally have the dice. Probably.", "Hehe, your move!",
            "Did anyone else hear that? No? Okay!"));

    @Override public String mode() { return "TEMPORARY_MOCK"; }

    @Override
    public CompletableFuture<String> respond(AgentContext context) {
        var reply = context.task() == AgentContext.Task.TURN && context.liarsDice() != null
            ? turn(context) : chat(context);
        try {
            return CompletableFuture.completedFuture(JSON.writeValueAsString(reply));
        } catch (Exception impossible) {
            return CompletableFuture.failedFuture(impossible);
        }
    }

    private static Map<String, Object> action(String action, AgentContext.Bid bid, String message) {
        var reply = new HashMap<String, Object>();
        reply.put("action", action);
        reply.put("bid", bid == null ? null : Map.of("quantity", bid.quantity(), "face", bid.face()));
        reply.put("proposedPrice", "0");
        reply.put("message", message);
        reply.put("agreementId", null);
        return reply;
    }

    /** Expected count of a face = own matches plus a sixth of everyone else's dice (ones are not wild). */
    private static Map<String, Object> turn(AgentContext context) {
        var dice = context.liarsDice();
        int[] own = new int[7];
        dice.ownDice().forEach(face -> own[face]++);
        int others = dice.totalDice() - dice.ownDice().size();
        var last = dice.lastBid();
        String talk = line(context, dice.round() + (last == null ? 0 : last.quantity()));
        if (last != null && last.quantity() > own[last.face()] + others / 6.0 + 1) return action("CALL_BLUFF", null, talk);
        int best = 1;
        for (int face = 2; face <= 6; face++) if (own[face] >= own[best]) best = face;
        int quantity = last == null ? Math.max(1, own[best]) : best > last.face() ? last.quantity() : last.quantity() + 1;
        if (quantity > dice.totalDice() || last != null && quantity > own[best] + others / 6.0 + 1) {
            return last == null ? action("BID", new AgentContext.Bid(1, best), talk) : action("CALL_BLUFF", null, talk);
        }
        return action("BID", new AgentContext.Bid(quantity, best), talk);
    }

    private static Map<String, Object> chat(AgentContext context) {
        var chat = context.recentChat();
        String last = chat.isEmpty() ? "" : chat.getLast().text().toLowerCase(Locale.ROOT);
        String reply = context.persona() == AgentContext.Persona.DON
            ? last.contains("dice") || last.contains("kostk") ? "My dice stay under my cup, friend. Guess harder."
            : last.contains("tip") || last.contains("money") || last.contains("trash") ? "Money talk? Not at this table. Not yet."
            : line(context, chat.size())
            : last.contains("dice") || last.contains("kostk") ? "Can't tell you! ...okay maybe one hint later."
            : line(context, chat.size());
        return action("CHAT", null, reply);
    }

    private static String line(AgentContext context, int seed) {
        var lines = TALK.get(context.persona());
        return lines.get(Math.floorMod(seed, lines.size()));
    }
}
