package com.raccoonroyale.games;

import static org.junit.jupiter.api.Assertions.*;
import java.security.SecureRandom;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class LiarsDiceGameTest {
    private LiarsDiceGame game() { return new LiarsDiceGame(List.of("human", "npc"), () -> 2); }
    private static int totalChips(LiarsDiceGame game, String viewer) {
        return game.viewFor(viewer).publicState().chips().values().stream().mapToInt(Integer::intValue).sum();
    }

    @Test void departureKeepsChipsCancelsTheOpenClaimAndCannotTakeAnotherTurn() {
        var game = new LiarsDiceGame(List.of("a", "b", "c"), () -> 2);
        game.apply("a", new LiarsDiceGame.Bid(15, 6));
        game.leave("a");
        var state = game.viewFor("b").publicState();
        assertEquals(0, state.diceCounts().get("a"));
        assertEquals(5, state.chips().get("a")); // Leaving cashes out; nothing is forfeited.
        assertNull(state.lastBid());
        assertNull(state.lastBidderId());
        assertEquals("b", state.currentPlayerId());
        assertEquals(2, state.round());
        assertThrows(IllegalArgumentException.class, () -> game.apply("a", new LiarsDiceGame.Bid(1, 1)));
        game.leave("c");
        state = game.viewFor("b").publicState();
        assertTrue(state.finished());
        assertNull(state.winnerId(), "Equal chips is a tie");
        game.leave("c"); // A repeated departure cannot change the result.
        assertTrue(game.viewFor("b").publicState().finished());
        assertThrows(IllegalArgumentException.class, () -> game.leave("intruder"));
    }

    @Test void initialStateAndPrivateViewsAreImmutableAndIsolated() {
        var rolls = new AtomicInteger();
        var game = new LiarsDiceGame(List.of("human", "npc"), () -> rolls.getAndIncrement() < 5 ? 1 : 6);
        var human = game.viewFor("human");
        assertEquals(List.of(1, 1, 1, 1, 1), human.ownDice());
        assertEquals(List.of(6, 6, 6, 6, 6), game.viewFor("npc").ownDice());
        assertEquals(5, human.publicState().diceCounts().get("npc"));
        assertEquals(5, human.publicState().chips().get("npc"));
        assertThrows(UnsupportedOperationException.class, () -> human.ownDice().set(0, 6));
        assertThrows(UnsupportedOperationException.class, () -> human.publicState().diceCounts().put("npc", 0));
        assertThrows(UnsupportedOperationException.class, () -> human.publicState().chips().put("npc", 99));
        assertThrows(IllegalArgumentException.class, () -> game.viewFor("intruder"));
    }

    @Test void validatesTurnsBoundsAndIncreasingBidsWithoutMutatingOnRejection() {
        var game = game();
        assertThrows(IllegalArgumentException.class, () -> game.apply("npc", new LiarsDiceGame.Bid(1, 1)));
        assertThrows(IllegalArgumentException.class, () -> game.apply("human", new LiarsDiceGame.CallBluff()));
        assertThrows(IllegalArgumentException.class, () -> game.apply("human", new LiarsDiceGame.Bid(11, 1)));
        assertThrows(IllegalArgumentException.class, () -> new LiarsDiceGame.Bid(1, 7));
        assertThrows(IllegalArgumentException.class, () -> new LiarsDiceGame.Bid(0, 1));
        game.apply("human", new LiarsDiceGame.Bid(2, 3));
        var before = game.viewFor("npc");
        for (var bid : List.of(new LiarsDiceGame.Bid(2, 3), new LiarsDiceGame.Bid(2, 2), new LiarsDiceGame.Bid(1, 6))) {
            assertThrows(IllegalArgumentException.class, () -> game.apply("npc", bid));
            assertEquals(before, game.viewFor("npc"));
        }
        game.apply("npc", new LiarsDiceGame.Bid(2, 4));
        game.apply("human", new LiarsDiceGame.Bid(3, 1));
        assertEquals("npc", game.viewFor("human").publicState().currentPlayerId());
    }

    @Test void metBidMakesTheCallerPayOneChipAndNobodyLosesDice() {
        var game = game();
        game.apply("human", new LiarsDiceGame.Bid(10, 2));
        var reveal = game.apply("npc", new LiarsDiceGame.CallBluff());
        assertEquals(10, reveal.actualCount());
        assertEquals("npc", reveal.loserId());
        assertEquals("human", reveal.winnerId());
        var state = game.viewFor("npc").publicState();
        assertEquals(4, state.chips().get("npc"));
        assertEquals(6, state.chips().get("human"));
        assertEquals(5, game.viewFor("npc").ownDice().size(), "Dice are never lost");
        assertEquals("npc", state.currentPlayerId());
        assertEquals(2, state.round());
        assertNull(state.lastBid());
    }

    @Test void unmetBidMakesTheBidderPayAndOnesAreNotWild() {
        var game = new LiarsDiceGame(List.of("human", "npc"), () -> 1);
        game.apply("human", new LiarsDiceGame.Bid(1, 6));
        var reveal = game.apply("npc", new LiarsDiceGame.CallBluff());
        assertEquals(0, reveal.actualCount());
        assertEquals("human", reveal.loserId());
        assertEquals("npc", reveal.winnerId());
        assertEquals(4, game.viewFor("human").publicState().chips().get("human"));
        assertEquals("human", game.viewFor("human").publicState().currentPlayerId());
    }

    @Test void aPlayerWithoutChipsIsOutAndTheHostCanEndWithFinalStandings() {
        var game = new LiarsDiceGame(List.of("a", "b", "c"), () -> 2);
        for (int i = 0; i < 5; i++) {
            game.apply("a", new LiarsDiceGame.Bid(1, 6));
            game.apply("b", new LiarsDiceGame.CallBluff());
        }
        var state = game.viewFor("b").publicState();
        assertEquals(0, state.chips().get("a"));
        assertEquals(10, state.chips().get("b"));
        assertTrue(game.viewFor("a").ownDice().isEmpty());
        assertEquals("b", state.currentPlayerId());
        assertFalse(state.finished());
        game.apply("b", new LiarsDiceGame.Bid(1, 6));
        game.apply("c", new LiarsDiceGame.CallBluff());
        assertEquals(15, totalChips(game, "c"));
        game.end();
        state = game.viewFor("c").publicState();
        assertTrue(state.finished());
        assertEquals("b", state.winnerId());
        assertNull(state.currentPlayerId());
        assertThrows(IllegalStateException.class, () -> game.apply("b", new LiarsDiceGame.Bid(1, 2)));
        assertThrows(IllegalStateException.class, game::end);
    }

    @Test void lastPlayerWithChipsWins() {
        var game = new LiarsDiceGame(List.of("human", "npc"), () -> 2, 2);
        for (int i = 0; i < 2; i++) {
            game.apply("human", new LiarsDiceGame.Bid(1, 6));
            game.apply("npc", new LiarsDiceGame.CallBluff());
        }
        var state = game.viewFor("npc").publicState();
        assertTrue(state.finished());
        assertEquals("npc", state.winnerId());
        assertEquals(4, state.chips().get("npc"));
    }

    @Test void chipsAreConservedThroughARandomMatchPlayedWithLegalFallbacks() {
        var random = new SecureRandom();
        var game = new LiarsDiceGame(List.of("a", "b", "c", "d"), () -> random.nextInt(6) + 1);
        // Fallback play can pass chips around for a long time; the host ends such a match. Conservation must hold throughout.
        for (int turn = 0; turn < 500 && !game.viewFor("a").publicState().finished(); turn++) {
            String actor = game.viewFor("a").publicState().currentPlayerId();
            game.apply(actor, game.fallbackFor(actor));
            assertEquals(20, totalChips(game, "a"), "Chips only move between players");
            assertTrue(game.viewFor("a").publicState().chips().values().stream().allMatch(c -> c >= 0));
        }
        if (!game.viewFor("a").publicState().finished()) game.end();
        assertEquals(20, totalChips(game, "a"));
        assertThrows(IllegalArgumentException.class, () -> game.fallbackFor("a"));
    }

    @Test void participantAndServerRollerValidation() {
        for (var ids : List.of(List.of("a"), List.of("a", "a"), List.of("a", "b", "c", "d", "e"))) {
            assertThrows(IllegalArgumentException.class, () -> new LiarsDiceGame(ids));
        }
        assertThrows(IllegalStateException.class, () -> new LiarsDiceGame(List.of("a", "b"), () -> 7));
        assertThrows(IllegalArgumentException.class, () -> new LiarsDiceGame(List.of("a", "b"), () -> 2, 0));
        var game = new LiarsDiceGame(List.of("a", "b", "c", "d"));
        for (String id : List.of("a", "b", "c", "d")) {
            assertEquals(5, game.viewFor(id).ownDice().size());
            assertTrue(game.viewFor(id).ownDice().stream().allMatch(value -> value >= 1 && value <= 6));
        }
    }
}
