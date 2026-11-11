package com.raccoonroyale.games;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.IntSupplier;

/**
 * In-memory authoritative rules. No transport, wallet, persistence, or LLM access.
 *
 * Chip variant: every active player always rolls five dice. Each player starts with the same chips; the loser of a
 * bluff call pays one chip to the other player in that challenge. Chips only move between players, so their total
 * never changes, which lets a later escrow pay out {@code chips × chip value} and always match the buy-ins exactly.
 * A player with no chips is out. The match ends when one player is left with chips, or when the host ends it.
 */
public final class LiarsDiceGame {
    public static final int DICE_PER_PLAYER = 5, STARTING_CHIPS = 5;
    public sealed interface Action permits Bid, CallBluff {}
    public record Bid(int quantity, int face) implements Action {
        public Bid {
            if (quantity < 1 || face < 1 || face > 6) throw new IllegalArgumentException("Invalid bid");
        }
    }
    public record CallBluff() implements Action {}
    /** {@code winnerId} is the single player with the most chips when the match ends, or null on a tie. */
    public record PublicState(int round, Map<String, Integer> diceCounts, Map<String, Integer> chips, String currentPlayerId,
                              Bid lastBid, String lastBidderId, String winnerId, boolean finished) {}
    public record PlayerView(PublicState publicState, List<Integer> ownDice) {}
    /** The loser pays one chip to {@code winnerId}, the other player in the challenge. */
    public record RoundResult(int round, Bid bid, String bidderId, String callerId,
                              String loserId, String winnerId, int actualCount, Map<String, List<Integer>> revealedDice) {}

    private final List<String> seats;
    private final Map<String, List<Integer>> dice = new LinkedHashMap<>();
    private final Map<String, Integer> chips = new LinkedHashMap<>();
    private final Set<String> left = new HashSet<>();
    private final IntSupplier roller;
    private int round = 1;
    private String currentPlayer;
    private Bid lastBid;
    private String lastBidder;
    private String winner;
    private boolean finished;

    public LiarsDiceGame(List<String> playerIds) {
        this(playerIds, secureRoller(), STARTING_CHIPS);
    }

    // Package-private deterministic dice injection for rule tests only.
    LiarsDiceGame(List<String> playerIds, IntSupplier roller) {
        this(playerIds, roller, STARTING_CHIPS);
    }

    LiarsDiceGame(List<String> playerIds, IntSupplier roller, int startingChips) {
        if (playerIds == null || playerIds.size() < 2 || playerIds.size() > 4
            || playerIds.stream().anyMatch(id -> id == null || !id.matches("[a-zA-Z0-9_-]{1,64}"))
            || playerIds.stream().distinct().count() != playerIds.size()) {
            throw new IllegalArgumentException("Require 2–4 unique participant IDs");
        }
        if (startingChips < 1) throw new IllegalArgumentException("Players need chips");
        seats = List.copyOf(playerIds);
        this.roller = roller;
        for (var id : seats) {
            dice.put(id, roll(DICE_PER_PLAYER));
            chips.put(id, startingChips);
        }
        currentPlayer = seats.getFirst();
    }

    private static IntSupplier secureRoller() {
        var random = new SecureRandom();
        return () -> random.nextInt(6) + 1;
    }

    private List<Integer> roll(int count) {
        var result = new ArrayList<Integer>(count);
        for (int i = 0; i < count; i++) {
            int value = roller.getAsInt();
            if (value < 1 || value > 6) throw new IllegalStateException("Invalid server dice roller");
            result.add(value);
        }
        return List.copyOf(result);
    }

    private boolean active(String id) {
        return !left.contains(id) && chips.get(id) > 0;
    }

    public synchronized PlayerView viewFor(String playerId) {
        requireParticipant(playerId);
        var counts = new LinkedHashMap<String, Integer>();
        dice.forEach((id, values) -> counts.put(id, values.size()));
        return new PlayerView(new PublicState(round, Collections.unmodifiableMap(counts),
            Collections.unmodifiableMap(new LinkedHashMap<>(chips)), currentPlayer, lastBid, lastBidder, winner, finished),
            dice.get(playerId));
    }

    /** Returns a reveal only for CALL_BLUFF. Broadcast this result after resolution. */
    public synchronized RoundResult apply(String actor, Action action) {
        requireParticipant(actor);
        if (finished) throw new IllegalStateException("Match is finished");
        if (!actor.equals(currentPlayer)) throw new IllegalArgumentException("Not this player's turn");
        if (action instanceof Bid bid) {
            int total = dice.values().stream().mapToInt(List::size).sum();
            if (bid.quantity() > total || (lastBid != null &&
                (bid.quantity() < lastBid.quantity() ||
                    (bid.quantity() == lastBid.quantity() && bid.face() <= lastBid.face())))) {
                throw new IllegalArgumentException("Bid must increase and fit the dice on the table");
            }
            lastBid = bid;
            lastBidder = actor;
            currentPlayer = nextActive(actor);
            return null;
        }
        if (!(action instanceof CallBluff)) throw new IllegalArgumentException("Unknown action");
        if (lastBid == null) throw new IllegalArgumentException("Cannot call bluff before a bid");

        int actual = Math.toIntExact(dice.values().stream().flatMap(List::stream)
            .filter(value -> value == lastBid.face()).count()); // Ones are not wild.
        String loser = actual >= lastBid.quantity() ? actor : lastBidder;
        String gainer = loser.equals(actor) ? lastBidder : actor;
        var revealed = Collections.unmodifiableMap(new LinkedHashMap<>(dice));
        var result = new RoundResult(round, lastBid, lastBidder, actor, loser, gainer, actual, revealed);
        chips.merge(loser, -1, Integer::sum);
        chips.merge(gainer, 1, Integer::sum);
        if (!active(loser)) dice.put(loser, List.of()); // Out of chips: out of the match.
        if (seats.stream().filter(this::active).count() <= 1) {
            finish();
        } else {
            currentPlayer = active(loser) ? loser : nextActive(loser);
            newRound();
        }
        return result;
    }

    /** The host ends the match between turns. Chips stay as they are; the standings are final. */
    public synchronized void end() {
        if (finished) throw new IllegalStateException("Match is finished");
        finish();
    }

    /** Timeout/LLM fallback is legal for the current turn and never reads private dice. */
    public synchronized Action fallbackFor(String actor) {
        requireParticipant(actor);
        if (finished || !actor.equals(currentPlayer)) throw new IllegalArgumentException("No active turn");
        return lastBid == null ? new Bid(1, 1) : new CallBluff();
    }

    /**
     * Departure: the player stops playing and keeps their chips (they cash out at the end). Cancel the open claim
     * and roll a new round for the remaining seats.
     */
    public synchronized void leave(String actor) {
        requireParticipant(actor);
        if (finished || left.contains(actor)) return;
        boolean wasActive = active(actor);
        left.add(actor);
        dice.put(actor, List.of());
        if (!wasActive) return;
        lastBid = null;
        lastBidder = null;
        if (seats.stream().filter(this::active).count() <= 1) {
            finish();
        } else {
            currentPlayer = nextActive(actor);
            newRound();
        }
    }

    private void newRound() {
        round++;
        lastBid = null;
        lastBidder = null;
        for (var id : seats) dice.put(id, active(id) ? roll(DICE_PER_PLAYER) : List.of());
    }

    private void finish() {
        finished = true;
        currentPlayer = null;
        int best = chips.values().stream().mapToInt(Integer::intValue).max().orElse(0);
        var leaders = seats.stream().filter(id -> chips.get(id) == best).toList();
        winner = leaders.size() == 1 ? leaders.getFirst() : null;
    }

    private void requireParticipant(String id) {
        if (!dice.containsKey(id)) throw new IllegalArgumentException("Unknown participant");
    }

    private String nextActive(String after) {
        int index = seats.indexOf(after);
        for (int step = 1; step <= seats.size(); step++) {
            var id = seats.get((index + step) % seats.size());
            if (active(id)) return id;
        }
        throw new IllegalStateException("No active participants");
    }
}
