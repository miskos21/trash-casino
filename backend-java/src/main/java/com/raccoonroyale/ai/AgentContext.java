package com.raccoonroyale.ai;

import java.util.List;
import java.util.Map;

/**
 * Everything an agent may know when it decides. Built by the room from the agent's own engine view, so other
 * players' dice or hidden cards cannot reach a prompt: this type has no field that could carry them.
 */
public record AgentContext(
    String matchId,
    String agentId,
    String agentName,
    Persona persona,
    Task task,
    String game,
    LiarsDice liarsDice,
    Blackjack blackjack,
    List<ChatLine> recentChat) {

    public enum Task { TURN, CHAT_REPLY }

    public enum Persona {
        DON("Don Raccoone, a raccoon mob boss: proud, sly, competitive, and fond of mind games. "
            + "Short, witty, slightly menacing lines with mob-movie flair. Teases opponents about their bids."),
        FOXY("Foxy, a talkative, impulsive fox who bluffs sometimes and can never keep quiet. "
            + "Chatty, playful, easily excited.");

        public final String description;
        Persona(String description) { this.description = description; }

        public static Persona forSeat(String seatId) {
            return seatId.startsWith("foxy-") ? FOXY : DON;
        }
    }

    /** Public table state plus the agent's own dice only. */
    public record LiarsDice(int round, List<Integer> ownDice, Map<String, Integer> diceCountsByName,
                            Map<String, Integer> chipsByName, int totalDice,
                            Bid lastBid, String lastBidderName, List<String> recentPublicEvents) {}
    public record Bid(int quantity, int face) {}

    /** Every Blackjack card shown here is face up for all players; the dealer hole card is absent. */
    public record Blackjack(List<String> ownCards, int ownTotal, String dealerUpCard, Map<String, List<String>> othersCards) {}

    public record ChatLine(String senderName, boolean agent, String text) {}
}
