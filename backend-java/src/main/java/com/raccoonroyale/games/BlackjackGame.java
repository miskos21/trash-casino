package com.raccoonroyale.games;

import java.security.SecureRandom;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** In-memory authoritative Blackjack against a rule-bound house dealer. No transport, wallet, persistence, or LLM access. */
public final class BlackjackGame {
    public enum Action { HIT, STAND }
    public enum Status { PLAYING, STOOD, BUST, BLACKJACK }
    public enum Outcome { WIN, LOSE, PUSH, BLACKJACK }
    public record Card(String rank, String suit) {
        int points() { return rank.equals("A") ? 11 : List.of("J", "Q", "K").contains(rank) ? 10 : Integer.parseInt(rank); }
    }
    public record Hand(String playerId, List<Card> cards, int total, Status status, Outcome outcome) {}
    /** The dealer hole card is omitted until the dealer reveals it. */
    public record PublicState(List<Hand> players, List<Card> dealerCards, int hiddenCards, int dealerTotal,
                              String currentPlayerId, boolean finished) {}

    private static final List<String> RANKS = List.of("A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K");
    private static final List<String> SUITS = List.of("S", "H", "D", "C");
    private final List<String> seats;
    private final Deque<Card> shoe;
    private final Map<String, List<Card>> hands = new LinkedHashMap<>();
    private final Map<String, Status> statuses = new LinkedHashMap<>();
    private final Map<String, Outcome> outcomes = new LinkedHashMap<>();
    private final List<Card> dealer = new ArrayList<>();
    private String currentPlayer;
    private boolean finished;

    public BlackjackGame(List<String> playerIds) {
        this(playerIds, shuffledShoe(new SecureRandom()));
    }

    // Package-private deterministic shoe injection for rule tests only. Cards are drawn from the front.
    BlackjackGame(List<String> playerIds, List<Card> cards) {
        if (playerIds == null || playerIds.isEmpty() || playerIds.size() > 4
            || playerIds.stream().anyMatch(id -> id == null || !id.matches("[a-zA-Z0-9_-]{1,64}"))
            || playerIds.stream().distinct().count() != playerIds.size()) {
            throw new IllegalArgumentException("Require 1–4 unique player IDs");
        }
        seats = List.copyOf(playerIds);
        shoe = new ArrayDeque<>(cards);
        for (var id : seats) hands.put(id, new ArrayList<>());
        for (int i = 0; i < 2; i++) {
            for (var id : seats) hands.get(id).add(draw());
            dealer.add(draw());
        }
        for (var id : seats) statuses.put(id, total(hands.get(id)) == 21 ? Status.BLACKJACK : Status.PLAYING);
        if (total(dealer) == 21) settle(); // The dealer peeks: a natural ends the hand before anyone acts.
        else advanceFrom(-1);
    }

    /** Two standard decks so four maximal hands and the dealer can never exhaust the shoe. */
    private static List<Card> shuffledShoe(SecureRandom random) {
        var cards = new ArrayList<Card>();
        for (int deck = 0; deck < 2; deck++) for (var suit : SUITS) for (var rank : RANKS) cards.add(new Card(rank, suit));
        Collections.shuffle(cards, random);
        return cards;
    }

    private Card draw() {
        var card = shoe.pollFirst();
        if (card == null) throw new IllegalStateException("Shoe exhausted");
        return card;
    }

    static int total(List<Card> cards) {
        int sum = cards.stream().mapToInt(Card::points).sum();
        long softAces = cards.stream().filter(card -> card.rank().equals("A")).count();
        while (sum > 21 && softAces-- > 0) sum -= 10;
        return sum;
    }

    public synchronized PublicState publicState() {
        var players = seats.stream().map(id -> new Hand(id, List.copyOf(hands.get(id)), total(hands.get(id)),
            statuses.get(id), outcomes.get(id))).toList();
        var shown = finished ? List.copyOf(dealer) : List.of(dealer.getFirst());
        return new PublicState(players, shown, finished ? 0 : 1, total(shown), currentPlayer, finished);
    }

    public synchronized void apply(String actor, Action action) {
        if (!hands.containsKey(actor)) throw new IllegalArgumentException("Unknown player");
        if (finished) throw new IllegalStateException("Hand is finished");
        if (!actor.equals(currentPlayer)) throw new IllegalArgumentException("Not this player's turn");
        if (action == Action.HIT) {
            var hand = hands.get(actor);
            hand.add(draw());
            int total = total(hand);
            if (total < 21) return;
            statuses.put(actor, total > 21 ? Status.BUST : Status.STOOD); // 21 cannot improve, so stop automatically.
        } else if (action == Action.STAND) {
            statuses.put(actor, Status.STOOD);
        } else {
            throw new IllegalArgumentException("Unknown action");
        }
        advanceFrom(seats.indexOf(actor));
    }

    /** Timeout and absent-player fallback is always legal and never reads hidden cards. */
    public synchronized Action fallbackFor(String actor) {
        if (finished || !actor.equals(currentPlayer)) throw new IllegalArgumentException("No active turn");
        return Action.STAND;
    }

    /** Rule-based agent move: it reads only its own hand and copies the dealer rule. */
    public synchronized Action npcMoveFor(String actor) {
        if (finished || !actor.equals(currentPlayer)) throw new IllegalArgumentException("No active turn");
        return total(hands.get(actor)) < 17 ? Action.HIT : Action.STAND;
    }

    private void advanceFrom(int index) {
        for (int i = index + 1; i < seats.size(); i++) {
            if (statuses.get(seats.get(i)) == Status.PLAYING) { currentPlayer = seats.get(i); return; }
        }
        currentPlayer = null;
        // The dealer draws only when some player can still beat it; it stands on all 17s.
        if (statuses.values().stream().anyMatch(status -> status == Status.STOOD)) {
            while (total(dealer) < 17) dealer.add(draw());
        }
        settle();
    }

    private void settle() {
        int dealerTotal = total(dealer);
        boolean dealerNatural = dealer.size() == 2 && dealerTotal == 21;
        for (var id : seats) {
            int total = total(hands.get(id));
            statuses.replace(id, Status.PLAYING, Status.STOOD); // Only after a dealer natural.
            var status = statuses.get(id);
            outcomes.put(id, status == Status.BLACKJACK ? dealerNatural ? Outcome.PUSH : Outcome.BLACKJACK
                : status == Status.BUST || dealerNatural ? Outcome.LOSE
                : dealerTotal > 21 || total > dealerTotal ? Outcome.WIN
                : total == dealerTotal ? Outcome.PUSH : Outcome.LOSE);
        }
        currentPlayer = null;
        finished = true;
    }
}
