package com.raccoonroyale.games;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.IntSupplier;

/** In-memory authoritative rules. No transport, wallet, persistence, or LLM access. */
public final class LiarsDiceGame {
    public sealed interface Action permits Bid, CallBluff {}
    public record Bid(int quantity, int face) implements Action {
        public Bid {
            if (quantity < 1 || face < 1 || face > 6) throw new IllegalArgumentException("Invalid bid");
        }
    }
    public record CallBluff() implements Action {}
    public record PublicState(int round, Map<String, Integer> diceCounts, String currentPlayerId,
                              Bid lastBid, String lastBidderId, String winnerId) {}
    public record PlayerView(PublicState publicState, List<Integer> ownDice) {}
    public record RoundResult(int round, Bid bid, String bidderId, String callerId,
                              String loserId, int actualCount, Map<String, List<Integer>> revealedDice) {}

    private final List<String> seats;
    private final Map<String, List<Integer>> dice = new LinkedHashMap<>();
    private final IntSupplier roller;
    private int round = 1;
    private String currentPlayer;
    private Bid lastBid;
    private String lastBidder;
    private String winner;

    public LiarsDiceGame(List<String> playerIds) {
        this(playerIds, secureRoller());
    }

    // Package-private deterministic dice injection for rule tests only.
    LiarsDiceGame(List<String> playerIds, IntSupplier roller) {
        if (playerIds == null || playerIds.size() < 2 || playerIds.size() > 4
            || playerIds.stream().anyMatch(id -> id == null || !id.matches("[a-zA-Z0-9_-]{1,64}"))
            || playerIds.stream().distinct().count() != playerIds.size()) {
            throw new IllegalArgumentException("Require 2–4 unique participant IDs");
        }
        seats = List.copyOf(playerIds);
        this.roller = roller;
        for (var id : seats) dice.put(id, roll(5));
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

    public synchronized PlayerView viewFor(String playerId) {
        requireParticipant(playerId);
        var counts = new LinkedHashMap<String, Integer>();
        dice.forEach((id, values) -> counts.put(id, values.size()));
        return new PlayerView(new PublicState(round, Collections.unmodifiableMap(counts),
            currentPlayer, lastBid, lastBidder, winner), dice.get(playerId));
    }

    /** Returns a reveal only for CALL_BLUFF. Broadcast this result after resolution. */
    public synchronized RoundResult apply(String actor, Action action) {
        requireParticipant(actor);
        if (winner != null) throw new IllegalStateException("Match is finished");
        if (!actor.equals(currentPlayer)) throw new IllegalArgumentException("Not this player's turn");
        if (action instanceof Bid bid) {
            int total = dice.values().stream().mapToInt(List::size).sum();
            if (bid.quantity() > total || (lastBid != null &&
                (bid.quantity() < lastBid.quantity() ||
                    (bid.quantity() == lastBid.quantity() && bid.face() <= lastBid.face())))) {
                throw new IllegalArgumentException("Bid must increase and fit remaining dice");
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
        var revealed = Collections.unmodifiableMap(new LinkedHashMap<>(dice));
        var result = new RoundResult(round, lastBid, lastBidder, actor, loser, actual, revealed);
        var old = dice.get(loser);
        dice.put(loser, List.copyOf(old.subList(0, old.size() - 1)));
        var active = seats.stream().filter(id -> !dice.get(id).isEmpty()).toList();
        if (active.size() == 1) {
            winner = active.getFirst();
            currentPlayer = null;
        } else {
            currentPlayer = dice.get(loser).isEmpty() ? nextActive(loser) : loser;
            round++;
            dice.replaceAll((id, values) -> roll(values.size()));
            lastBid = null;
            lastBidder = null;
        }
        return result;
    }

    /** Timeout/LLM fallback is legal for the current turn and never reads private dice. */
    public synchronized Action fallbackFor(String actor) {
        requireParticipant(actor);
        if (winner != null || !actor.equals(currentPlayer)) throw new IllegalArgumentException("No active turn");
        return lastBid == null ? new Bid(1, 1) : new CallBluff();
    }

    /** Explicit departure forfeits all dice. Cancel the open claim and roll a new round for the remaining seats. */
    public synchronized void forfeit(String actor) {
        requireParticipant(actor);
        if (winner != null || dice.get(actor).isEmpty()) return;
        dice.put(actor, List.of());
        lastBid = null;
        lastBidder = null;
        var active = seats.stream().filter(id -> !dice.get(id).isEmpty()).toList();
        if (active.size() == 1) {
            winner = active.getFirst();
            currentPlayer = null;
        } else {
            currentPlayer = nextActive(actor);
            round++;
            dice.replaceAll((id, values) -> roll(values.size()));
        }
    }

    private void requireParticipant(String id) {
        if (!dice.containsKey(id)) throw new IllegalArgumentException("Unknown participant");
    }

    private String nextActive(String after) {
        int index = seats.indexOf(after);
        for (int step = 1; step <= seats.size(); step++) {
            var id = seats.get((index + step) % seats.size());
            if (!dice.get(id).isEmpty()) return id;
        }
        throw new IllegalStateException("No active participants");
    }
}
