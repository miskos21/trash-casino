package com.raccoonroyale.games;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * In-memory authoritative Blackjack against a rule-bound house dealer, dealt like a casino shoe: the dealer
 * shuffles all decks once, burns the top card, and deals every hand from the top of that same shoe until the
 * cut card comes out. The hand in progress then finishes and the shoe ends.
 *
 * Before any card is dealt the game commits to the full shoe order with SHA-256(salt + ":" + order). The salt
 * and order are revealed only after the shoe ends, so players can check that the order never changed during
 * play. This does not prove the shuffle itself was random: the server is trusted to shuffle with SecureRandom.
 * No transport, wallet, persistence, or LLM access.
 */
public final class BlackjackGame {
    public enum Action { HIT, STAND }
    public enum Status { PLAYING, STOOD, BUST, BLACKJACK }
    public enum Outcome { WIN, LOSE, PUSH, BLACKJACK }
    public record Card(String rank, String suit) {
        int points() { return rank.equals("A") ? 11 : List.of("J", "Q", "K").contains(rank) ? 10 : Integer.parseInt(rank); }
    }
    /** Running tally across the hands of this shoe. */
    public record Tally(int wins, int losses, int pushes, int blackjacks) {}
    public record Hand(String playerId, List<Card> cards, int total, Status status, Outcome outcome, Tally tally) {}
    /** The dealer hole card is omitted until the dealer reveals it. */
    /** Hand 0 is the shuffle before the first deal; handStart is the shoe position where this hand's deal began. */
    public record PublicState(int handNumber, List<Hand> players, List<Card> dealerCards, int hiddenCards, int dealerTotal,
                              String currentPlayerId, boolean handOver, boolean shoeOver, int cardsRemaining,
                              int shoeSize, int burned, int handStart, String commitment) {}
    public record ShoeReveal(String salt, List<Card> order) {}

    public static final int DECKS = 6;
    /** The cut card sits at 75% penetration, leaving far more cards than any single hand can use. */
    public static final int CUT_CARD_REMAINING = DECKS * 52 / 4;
    private static final List<String> RANKS = List.of("A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K");
    private static final List<String> SUITS = List.of("S", "H", "D", "C");
    private final List<String> seats;
    private final List<Card> shoe;
    private final int cutCardRemaining, burned;
    private final String salt, commitment;
    private int position, handStart;
    private final Map<String, List<Card>> hands = new LinkedHashMap<>();
    private final Map<String, Status> statuses = new LinkedHashMap<>();
    private final Map<String, Outcome> outcomes = new LinkedHashMap<>();
    private final Map<String, Tally> tallies = new LinkedHashMap<>();
    private final List<Card> dealer = new ArrayList<>();
    private int handNumber;
    private String currentPlayer;
    private boolean handOver, shoeOver;

    public BlackjackGame(List<String> playerIds) {
        this(playerIds, shuffledShoe(RANDOM), CUT_CARD_REMAINING, 1, randomSalt());
    }

    // Package-private deterministic shoe injection for rule tests only. Cards are drawn from the front.
    // Without a cut position the shoe ends after the first hand; test shoes burn no card.
    BlackjackGame(List<String> playerIds, List<Card> cards) {
        this(playerIds, cards, Integer.MAX_VALUE, 0, "00000000000000000000000000000000");
    }

    BlackjackGame(List<String> playerIds, List<Card> cards, int cutCardRemaining) {
        this(playerIds, cards, cutCardRemaining, 0, "00000000000000000000000000000000");
    }

    /** The shoe starts shuffled and burned with no hand dealt; call {@link #nextHand()} to deal hand 1. */
    BlackjackGame(List<String> playerIds, List<Card> cards, int cutCardRemaining, int burn, String salt) {
        if (playerIds == null || playerIds.isEmpty() || playerIds.size() > 4
            || playerIds.stream().anyMatch(id -> id == null || !id.matches("[a-zA-Z0-9_-]{1,64}"))
            || playerIds.stream().distinct().count() != playerIds.size()) {
            throw new IllegalArgumentException("Require 1–4 unique player IDs");
        }
        seats = List.copyOf(playerIds);
        shoe = List.copyOf(cards);
        this.cutCardRemaining = cutCardRemaining;
        this.salt = salt;
        commitment = sha256(salt + ":" + orderText(shoe));
        burned = burn;
        position = burn; // Burned cards leave the shoe face down before the first deal.
        for (var id : seats) {
            hands.put(id, new ArrayList<>());
            tallies.put(id, new Tally(0, 0, 0, 0));
            statuses.put(id, Status.PLAYING);
        }
        handOver = true; // Waiting for the first deal.
    }

    private static final SecureRandom RANDOM = new SecureRandom();
    private static String randomSalt() {
        byte[] bytes = new byte[16];
        RANDOM.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }
    public static String orderText(List<Card> cards) {
        return String.join(",", cards.stream().map(card -> card.rank() + card.suit()).toList());
    }
    public static String sha256(String text) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private static List<Card> shuffledShoe(SecureRandom random) {
        var cards = new ArrayList<Card>();
        for (int deck = 0; deck < DECKS; deck++) for (var suit : SUITS) for (var rank : RANKS) cards.add(new Card(rank, suit));
        Collections.shuffle(cards, random);
        return cards;
    }

    private void deal() {
        handNumber++;
        handOver = false;
        handStart = position;
        for (var hand : hands.values()) hand.clear();
        dealer.clear();
        outcomes.clear();
        for (int i = 0; i < 2; i++) {
            for (var id : seats) hands.get(id).add(draw());
            dealer.add(draw());
        }
        for (var id : seats) statuses.put(id, total(hands.get(id)) == 21 ? Status.BLACKJACK : Status.PLAYING);
        if (total(dealer) == 21) settle(); // The dealer peeks: a natural ends the hand before anyone acts.
        else advanceFrom(-1);
    }

    /** Deals the next hand from the same shoe: the first hand after the shuffle, then after each result. */
    public synchronized void nextHand() {
        if (!handOver || shoeOver) throw new IllegalStateException("No next hand in this shoe");
        deal();
    }

    private Card draw() {
        if (position >= shoe.size()) throw new IllegalStateException("Shoe exhausted");
        return shoe.get(position++);
    }

    /** The full shoe order is secret until the shoe has ended. */
    public synchronized ShoeReveal reveal() {
        if (!shoeOver) throw new IllegalStateException("The shoe order is revealed only after the shoe ends");
        return new ShoeReveal(salt, shoe);
    }

    static int total(List<Card> cards) {
        int sum = cards.stream().mapToInt(Card::points).sum();
        long softAces = cards.stream().filter(card -> card.rank().equals("A")).count();
        while (sum > 21 && softAces-- > 0) sum -= 10;
        return sum;
    }

    public synchronized PublicState publicState() {
        var players = seats.stream().map(id -> new Hand(id, List.copyOf(hands.get(id)), total(hands.get(id)),
            statuses.get(id), outcomes.get(id), tallies.get(id))).toList();
        var shown = handOver || dealer.isEmpty() ? List.copyOf(dealer) : List.of(dealer.getFirst());
        return new PublicState(handNumber, players, shown, handOver || dealer.isEmpty() ? 0 : 1, total(shown), currentPlayer,
            handOver, shoeOver, shoe.size() - position, shoe.size(), burned, handStart, commitment);
    }

    public synchronized void apply(String actor, Action action) {
        if (!hands.containsKey(actor)) throw new IllegalArgumentException("Unknown player");
        if (handOver) throw new IllegalStateException("Hand is finished");
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
        if (handOver || !actor.equals(currentPlayer)) throw new IllegalArgumentException("No active turn");
        return Action.STAND;
    }

    /** Rule-based agent move: it reads only its own hand and copies the dealer rule. */
    public synchronized Action npcMoveFor(String actor) {
        if (handOver || !actor.equals(currentPlayer)) throw new IllegalArgumentException("No active turn");
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
            var outcome = status == Status.BLACKJACK ? dealerNatural ? Outcome.PUSH : Outcome.BLACKJACK
                : status == Status.BUST || dealerNatural ? Outcome.LOSE
                : dealerTotal > 21 || total > dealerTotal ? Outcome.WIN
                : total == dealerTotal ? Outcome.PUSH : Outcome.LOSE;
            outcomes.put(id, outcome);
            var t = tallies.get(id);
            tallies.put(id, new Tally(t.wins() + (outcome == Outcome.WIN || outcome == Outcome.BLACKJACK ? 1 : 0),
                t.losses() + (outcome == Outcome.LOSE ? 1 : 0), t.pushes() + (outcome == Outcome.PUSH ? 1 : 0),
                t.blackjacks() + (outcome == Outcome.BLACKJACK ? 1 : 0)));
        }
        currentPlayer = null;
        handOver = true;
        shoeOver = shoe.size() - position <= cutCardRemaining; // The cut card came out during this hand.
    }
}
