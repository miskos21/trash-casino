package com.raccoonroyale.games;

import static org.junit.jupiter.api.Assertions.*;
import com.raccoonroyale.games.BlackjackGame.Action;
import com.raccoonroyale.games.BlackjackGame.Card;
import com.raccoonroyale.games.BlackjackGame.Outcome;
import com.raccoonroyale.games.BlackjackGame.Status;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

class BlackjackGameTest {
    // Deal order: each player, then the dealer, twice. Later cards are hits and dealer draws.
    static List<Card> shoe(String... ranks) { return Arrays.stream(ranks).map(rank -> new Card(rank, "S")).toList(); }
    static BlackjackGame.Hand hand(BlackjackGame game, String id) {
        return game.publicState().players().stream().filter(h -> h.playerId().equals(id)).findFirst().orElseThrow();
    }

    @Test void acesCountSoftUntilTheyWouldBust() {
        assertEquals(21, BlackjackGame.total(shoe("A", "K")));
        assertEquals(21, BlackjackGame.total(shoe("A", "A", "9")));
        assertEquals(16, BlackjackGame.total(shoe("A", "5", "K")));
        assertEquals(12, BlackjackGame.total(shoe("A", "A", "K")));
    }

    @Test void holeCardStaysHiddenUntilTheDealerPlays() {
        var game = new BlackjackGame(List.of("p1"), shoe("10", "9", "7", "K", "5"));
        var state = game.publicState();
        assertEquals(List.of(new Card("9", "S")), state.dealerCards());
        assertEquals(1, state.hiddenCards());
        assertEquals(9, state.dealerTotal());
        assertFalse(state.dealerCards().contains(new Card("K", "S")), "Hole card must not be public");
        game.apply("p1", Action.STAND);
        state = game.publicState();
        assertTrue(state.finished());
        assertEquals(0, state.hiddenCards());
        assertEquals(19, state.dealerTotal());
        assertEquals(Outcome.LOSE, hand(game, "p1").outcome()); // 17 against 19.
    }

    @Test void turnsAdvanceInSeatOrderAndRejectOutOfTurnMoves() {
        var game = new BlackjackGame(List.of("p1", "p2"), shoe("10", "9", "6", "6", "8", "K", "2", "10", "5"));
        assertEquals("p1", game.publicState().currentPlayerId());
        assertThrows(IllegalArgumentException.class, () -> game.apply("p2", Action.HIT));
        assertThrows(IllegalArgumentException.class, () -> game.apply("stranger", Action.STAND));
        game.apply("p1", Action.HIT); // 16 + 2 = 18, still playing.
        assertEquals(Status.PLAYING, hand(game, "p1").status());
        game.apply("p1", Action.STAND);
        assertEquals("p2", game.publicState().currentPlayerId());
        game.apply("p2", Action.HIT); // 17 + 10 busts.
        assertEquals(Status.BUST, hand(game, "p2").status());
        var state = game.publicState();
        assertTrue(state.finished());
        assertEquals(21, state.dealerTotal()); // 6 + K is below 17, so the dealer draws the 5.
        assertEquals(Outcome.LOSE, hand(game, "p1").outcome());
        assertEquals(Outcome.LOSE, hand(game, "p2").outcome());
    }

    @Test void dealerDrawsToSeventeenAndBustingPaysStandingPlayers() {
        var game = new BlackjackGame(List.of("p1", "p2"), shoe("10", "10", "6", "8", "5", "K", "9"));
        game.apply("p1", Action.STAND); // 18
        game.apply("p2", Action.STAND); // 15
        var state = game.publicState();
        assertTrue(state.finished());
        assertEquals(25, state.dealerTotal()); // 6 + K + 9 busts.
        assertEquals(Outcome.WIN, hand(game, "p1").outcome());
        assertEquals(Outcome.WIN, hand(game, "p2").outcome());
    }

    @Test void equalTotalsPushAndTwentyOneStopsAutomatically() {
        var game = new BlackjackGame(List.of("p1"), shoe("10", "10", "7", "K", "4"));
        game.apply("p1", Action.HIT); // 17 + 4 = 21 ends the turn.
        assertEquals(Status.STOOD, hand(game, "p1").status());
        assertEquals(Outcome.WIN, hand(game, "p1").outcome()); // Dealer stands on 20.
        var push = new BlackjackGame(List.of("p1"), shoe("10", "10", "K", "K"));
        push.apply("p1", Action.STAND);
        assertEquals(Outcome.PUSH, hand(push, "p1").outcome());
    }

    @Test void naturalsSkipTheTurnAndADealerNaturalEndsTheHand() {
        var game = new BlackjackGame(List.of("p1", "p2"), shoe("A", "10", "9", "K", "8", "7", "2"));
        assertEquals(Status.BLACKJACK, hand(game, "p1").status());
        assertEquals("p2", game.publicState().currentPlayerId());
        game.apply("p2", Action.STAND); // 18 against 16 + 2.
        assertEquals(Outcome.BLACKJACK, hand(game, "p1").outcome());
        assertEquals(Outcome.PUSH, hand(game, "p2").outcome());

        var dealerNatural = new BlackjackGame(List.of("p1", "p2"), shoe("A", "10", "A", "K", "9", "K"));
        var state = dealerNatural.publicState();
        assertTrue(state.finished());
        assertNull(state.currentPlayerId());
        assertEquals(Outcome.PUSH, hand(dealerNatural, "p1").outcome());
        assertEquals(Outcome.LOSE, hand(dealerNatural, "p2").outcome());
        assertEquals(Status.STOOD, hand(dealerNatural, "p2").status());
        assertThrows(IllegalStateException.class, () -> dealerNatural.apply("p2", Action.HIT));
    }

    @Test void dealerDoesNotDrawWhenEveryPlayerBusted() {
        var game = new BlackjackGame(List.of("p1"), shoe("10", "6", "6", "5", "K"));
        game.apply("p1", Action.HIT);
        var state = game.publicState();
        assertTrue(state.finished());
        assertEquals(2, state.dealerCards().size());
        assertEquals(Outcome.LOSE, hand(game, "p1").outcome());
    }

    @Test void fallbackIsAlwaysALegalStand() {
        var game = new BlackjackGame(List.of("p1", "p2"));
        while (!game.publicState().finished()) {
            String actor = game.publicState().currentPlayerId();
            assertEquals(Action.STAND, game.fallbackFor(actor));
            game.apply(actor, game.fallbackFor(actor));
        }
        assertTrue(game.publicState().players().stream().allMatch(h -> h.outcome() != null));
        assertThrows(IllegalArgumentException.class, () -> new BlackjackGame(List.of("a", "b", "c", "d", "e")));
        assertThrows(IllegalArgumentException.class, () -> new BlackjackGame(List.of()));
    }

    @Test void agentHitsBelowSeventeenAndOnlyOnItsTurn() {
        var game = new BlackjackGame(List.of("agent", "p2"), shoe("10", "9", "8", "5", "9", "K", "4", "3", "7"));
        assertThrows(IllegalArgumentException.class, () -> game.npcMoveFor("p2"));
        assertEquals(Action.HIT, game.npcMoveFor("agent")); // 15
        game.apply("agent", Action.HIT); // 19
        assertEquals(Action.STAND, game.npcMoveFor("agent"));
        game.apply("agent", Action.STAND);
        assertEquals("p2", game.publicState().currentPlayerId());
    }
}
