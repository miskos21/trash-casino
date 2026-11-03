package com.raccoonroyale.games;

import static org.junit.jupiter.api.Assertions.*;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class LiarsDiceGameTest {
    private LiarsDiceGame game() { return new LiarsDiceGame(List.of("human", "npc"), () -> 2); }

    @Test void initialStateAndPrivateViewsAreImmutableAndIsolated() {
        var rolls = new AtomicInteger();
        var game = new LiarsDiceGame(List.of("human", "npc"), () -> rolls.getAndIncrement() < 5 ? 1 : 6);
        var human = game.viewFor("human");
        assertEquals(List.of(1, 1, 1, 1, 1), human.ownDice());
        assertEquals(List.of(6, 6, 6, 6, 6), game.viewFor("npc").ownDice());
        assertEquals(5, human.publicState().diceCounts().get("npc"));
        assertThrows(UnsupportedOperationException.class, () -> human.ownDice().set(0, 6));
        assertThrows(UnsupportedOperationException.class, () -> human.publicState().diceCounts().put("npc", 0));
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

    @Test void metBidPunishesCallerAndLoserStartsNextRound() {
        var game = game();
        game.apply("human", new LiarsDiceGame.Bid(10, 2));
        var reveal = game.apply("npc", new LiarsDiceGame.CallBluff());
        assertEquals(10, reveal.actualCount());
        assertEquals("npc", reveal.loserId());
        assertEquals(5, reveal.revealedDice().get("npc").size());
        assertEquals(4, game.viewFor("npc").ownDice().size());
        assertEquals("npc", game.viewFor("npc").publicState().currentPlayerId());
        assertEquals(2, game.viewFor("npc").publicState().round());
        assertNull(game.viewFor("npc").publicState().lastBid());
    }

    @Test void unmetBidPunishesBidderAndOnesAreNotWild() {
        var game = new LiarsDiceGame(List.of("human", "npc"), () -> 1);
        game.apply("human", new LiarsDiceGame.Bid(1, 6));
        var reveal = game.apply("npc", new LiarsDiceGame.CallBluff());
        assertEquals(0, reveal.actualCount());
        assertEquals("human", reveal.loserId());
        assertEquals("human", game.viewFor("human").publicState().currentPlayerId());
    }

    @Test void eliminationSkipsSeatAndLastActivePlayerWins() {
        var game = new LiarsDiceGame(List.of("a", "b", "c"), () -> 2);
        for (int i = 0; i < 5; i++) {
            game.apply("a", new LiarsDiceGame.Bid(1, 6));
            game.apply("b", new LiarsDiceGame.CallBluff());
        }
        assertEquals("b", game.viewFor("b").publicState().currentPlayerId());
        assertTrue(game.viewFor("a").ownDice().isEmpty());
        for (int i = 0; i < 5; i++) {
            game.apply("b", new LiarsDiceGame.Bid(1, 6));
            game.apply("c", new LiarsDiceGame.CallBluff());
        }
        assertEquals("c", game.viewFor("c").publicState().winnerId());
        assertNull(game.viewFor("c").publicState().currentPlayerId());
        assertThrows(IllegalStateException.class, () -> game.apply("c", new LiarsDiceGame.Bid(1, 2)));
    }

    @Test void deterministicFallbackCompletesFullMatchWithLegalMoves() {
        var game = game();
        int turns = 0;
        while (game.viewFor("human").publicState().winnerId() == null && turns++ < 100) {
            String actor = game.viewFor("human").publicState().currentPlayerId();
            game.apply(actor, game.fallbackFor(actor));
        }
        assertNotNull(game.viewFor("human").publicState().winnerId());
        assertTrue(turns < 100);
        assertThrows(IllegalArgumentException.class, () -> game.fallbackFor("human"));
    }

    @Test void participantAndServerRollerValidation() {
        for (var ids : List.of(List.of("a"), List.of("a", "a"), List.of("a", "b", "c", "d", "e"))) {
            assertThrows(IllegalArgumentException.class, () -> new LiarsDiceGame(ids));
        }
        assertThrows(IllegalStateException.class, () -> new LiarsDiceGame(List.of("a", "b"), () -> 7));
        var game = new LiarsDiceGame(List.of("a", "b", "c", "d"));
        for (String id : List.of("a", "b", "c", "d")) {
            assertEquals(5, game.viewFor(id).ownDice().size());
            assertTrue(game.viewFor(id).ownDice().stream().allMatch(value -> value >= 1 && value <= 6));
        }
    }
}
