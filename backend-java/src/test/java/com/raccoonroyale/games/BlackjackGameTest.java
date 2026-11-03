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
    @Test void departureSkipsTheTurnAndStopsFutureDealsWithoutReorderingTheShoe() {
        var order = shoe("10", "9", "10", "7", "8", "7", "10", "10", "8", "7", "4", "5", "6", "7");
        var game = new BlackjackGame(List.of("p1", "p2"), order, 0);
        game.nextHand();
        assertEquals("p1", game.publicState().currentPlayerId());
        var firstCards = hand(game, "p1").cards();
        game.leave("p1");
        assertEquals("p2", game.publicState().currentPlayerId());
        assertEquals(firstCards, hand(game, "p1").cards());
        assertThrows(IllegalArgumentException.class, () -> game.apply("p1", Action.HIT));
        game.apply("p2", Action.STAND);
        assertEquals(2, game.publicState().players().size()); // Complete history remains verifiable.
        int remaining = game.publicState().cardsRemaining();
        String commitment = game.publicState().commitment();
        game.nextHand();
        assertEquals(List.of("p2"), game.publicState().players().stream().map(BlackjackGame.Hand::playerId).toList());
        assertEquals(shoe("10", "8"), hand(game, "p2").cards());
        assertEquals(remaining - 4, game.publicState().cardsRemaining());
        assertEquals(commitment, game.publicState().commitment());
    }

    @Test void departureBeforeFirstDealDoesNotReceiveCards() {
        var game = new BlackjackGame(List.of("p1", "p2"));
        game.leave("p1");
        game.nextHand();
        assertEquals(List.of("p2"), game.publicState().players().stream().map(BlackjackGame.Hand::playerId).toList());
        assertEquals(307, game.publicState().cardsRemaining());
    }
    // Deal order: each player, then the dealer, twice. Later cards are hits and dealer draws.
    static List<Card> shoe(String... ranks) { return Arrays.stream(ranks).map(rank -> new Card(rank, "S")).toList(); }
    /** The shoe starts in the shuffle phase; deal hand 1 like the room does after the shuffle pause. */
    static BlackjackGame dealt(BlackjackGame game) { game.nextHand(); return game; }
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
        var game = dealt(new BlackjackGame(List.of("p1"), shoe("10", "9", "7", "K", "5")));
        var state = game.publicState();
        assertEquals(List.of(new Card("9", "S")), state.dealerCards());
        assertEquals(1, state.hiddenCards());
        assertEquals(9, state.dealerTotal());
        assertFalse(state.dealerCards().contains(new Card("K", "S")), "Hole card must not be public");
        game.apply("p1", Action.STAND);
        state = game.publicState();
        assertTrue(state.handOver());
        assertEquals(0, state.hiddenCards());
        assertEquals(19, state.dealerTotal());
        assertEquals(Outcome.LOSE, hand(game, "p1").outcome()); // 17 against 19.
    }

    @Test void turnsAdvanceInSeatOrderAndRejectOutOfTurnMoves() {
        var game = dealt(new BlackjackGame(List.of("p1", "p2"), shoe("10", "9", "6", "6", "8", "K", "2", "10", "5")));
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
        assertTrue(state.handOver());
        assertEquals(21, state.dealerTotal()); // 6 + K is below 17, so the dealer draws the 5.
        assertEquals(Outcome.LOSE, hand(game, "p1").outcome());
        assertEquals(Outcome.LOSE, hand(game, "p2").outcome());
    }

    @Test void dealerDrawsToSeventeenAndBustingPaysStandingPlayers() {
        var game = dealt(new BlackjackGame(List.of("p1", "p2"), shoe("10", "10", "6", "8", "5", "K", "9")));
        game.apply("p1", Action.STAND); // 18
        game.apply("p2", Action.STAND); // 15
        var state = game.publicState();
        assertTrue(state.handOver());
        assertEquals(25, state.dealerTotal()); // 6 + K + 9 busts.
        assertEquals(Outcome.WIN, hand(game, "p1").outcome());
        assertEquals(Outcome.WIN, hand(game, "p2").outcome());
    }

    @Test void equalTotalsPushAndTwentyOneStopsAutomatically() {
        var game = dealt(new BlackjackGame(List.of("p1"), shoe("10", "10", "7", "K", "4")));
        game.apply("p1", Action.HIT); // 17 + 4 = 21 ends the turn.
        assertEquals(Status.STOOD, hand(game, "p1").status());
        assertEquals(Outcome.WIN, hand(game, "p1").outcome()); // Dealer stands on 20.
        var push = dealt(new BlackjackGame(List.of("p1"), shoe("10", "10", "K", "K")));
        push.apply("p1", Action.STAND);
        assertEquals(Outcome.PUSH, hand(push, "p1").outcome());
    }

    @Test void naturalsSkipTheTurnAndADealerNaturalEndsTheHand() {
        var game = dealt(new BlackjackGame(List.of("p1", "p2"), shoe("A", "10", "9", "K", "8", "7", "2")));
        assertEquals(Status.BLACKJACK, hand(game, "p1").status());
        assertEquals("p2", game.publicState().currentPlayerId());
        game.apply("p2", Action.STAND); // 18 against 16 + 2.
        assertEquals(Outcome.BLACKJACK, hand(game, "p1").outcome());
        assertEquals(Outcome.PUSH, hand(game, "p2").outcome());

        var dealerNatural = dealt(new BlackjackGame(List.of("p1", "p2"), shoe("A", "10", "A", "K", "9", "K")));
        var state = dealerNatural.publicState();
        assertTrue(state.handOver());
        assertNull(state.currentPlayerId());
        assertEquals(Outcome.PUSH, hand(dealerNatural, "p1").outcome());
        assertEquals(Outcome.LOSE, hand(dealerNatural, "p2").outcome());
        assertEquals(Status.STOOD, hand(dealerNatural, "p2").status());
        assertThrows(IllegalStateException.class, () -> dealerNatural.apply("p2", Action.HIT));
    }

    @Test void dealerDoesNotDrawWhenEveryPlayerBusted() {
        var game = dealt(new BlackjackGame(List.of("p1"), shoe("10", "6", "6", "5", "K")));
        game.apply("p1", Action.HIT);
        var state = game.publicState();
        assertTrue(state.handOver());
        assertEquals(2, state.dealerCards().size());
        assertEquals(Outcome.LOSE, hand(game, "p1").outcome());
    }

    @Test void fallbackIsAlwaysALegalStand() {
        var game = dealt(new BlackjackGame(List.of("p1", "p2")));
        while (!game.publicState().handOver()) {
            String actor = game.publicState().currentPlayerId();
            assertEquals(Action.STAND, game.fallbackFor(actor));
            game.apply(actor, game.fallbackFor(actor));
        }
        assertTrue(game.publicState().players().stream().allMatch(h -> h.outcome() != null));
        assertThrows(IllegalArgumentException.class, () -> new BlackjackGame(List.of("a", "b", "c", "d", "e")));
        assertThrows(IllegalArgumentException.class, () -> new BlackjackGame(List.of()));
    }

    @Test void agentHitsBelowSeventeenAndOnlyOnItsTurn() {
        var game = dealt(new BlackjackGame(List.of("agent", "p2"), shoe("10", "9", "8", "5", "9", "K", "4", "3", "7")));
        assertThrows(IllegalArgumentException.class, () -> game.npcMoveFor("p2"));
        assertEquals(Action.HIT, game.npcMoveFor("agent")); // 15
        game.apply("agent", Action.HIT); // 19
        assertEquals(Action.STAND, game.npcMoveFor("agent"));
        game.apply("agent", Action.STAND);
        assertEquals("p2", game.publicState().currentPlayerId());
    }

    @Test void handsContinueFromOneShoeUntilTheCutCardThenTheShoeEnds() {
        // Hand 1: 17 vs 19 loses. Hand 2: 20 vs 20 pushes. The cut card sits one card from the end.
        var game = dealt(new BlackjackGame(List.of("p1"), shoe("10", "9", "7", "K", "10", "10", "K", "K", "5"), 1));
        assertThrows(IllegalStateException.class, game::nextHand); // Not while a hand is in play.
        game.apply("p1", Action.STAND);
        var state = game.publicState();
        assertTrue(state.handOver());
        assertFalse(state.shoeOver());
        assertEquals(5, state.cardsRemaining());
        assertEquals(new BlackjackGame.Tally(0, 1, 0, 0), hand(game, "p1").tally());
        game.nextHand();
        state = game.publicState();
        assertEquals(2, state.handNumber());
        assertFalse(state.handOver());
        assertEquals(1, state.hiddenCards());
        assertNull(hand(game, "p1").outcome());
        assertEquals(List.of(new Card("10", "S"), new Card("K", "S")), hand(game, "p1").cards());
        game.apply("p1", Action.STAND);
        state = game.publicState();
        assertTrue(state.shoeOver());
        assertEquals(new BlackjackGame.Tally(0, 1, 1, 0), hand(game, "p1").tally());
        assertThrows(IllegalStateException.class, game::nextHand);
    }

    @Test void productionShoeHasSixDecksAndPlaysManyHands() {
        var game = dealt(new BlackjackGame(List.of("p1", "p2", "p3", "p4")));
        int hands = 1;
        while (true) {
            while (!game.publicState().handOver()) {
                String actor = game.publicState().currentPlayerId();
                game.apply(actor, game.npcMoveFor(actor));
            }
            if (game.publicState().shoeOver()) break;
            game.nextHand();
            hands++;
        }
        var state = game.publicState();
        assertTrue(hands >= 10, "hands=" + hands);
        assertTrue(state.cardsRemaining() <= BlackjackGame.CUT_CARD_REMAINING && state.cardsRemaining() > 0);
        for (var h : state.players()) {
            var t = h.tally();
            assertEquals(hands, t.wins() + t.losses() + t.pushes());
        }
    }

    @Test void shuffleBurnsTheTopCardAndCommitsToTheWholeOrderBeforeDealing() {
        var order = shoe("2", "10", "9", "7", "K", "5");
        var game = new BlackjackGame(List.of("p1"), order, 1, 1, "ab".repeat(16)); // Cut card one from the end.
        var shuffle = game.publicState();
        assertEquals(0, shuffle.handNumber());
        assertTrue(shuffle.handOver());
        assertTrue(shuffle.dealerCards().isEmpty());
        assertEquals(5, shuffle.cardsRemaining()); // The burned 2 is out of play, face down.
        assertEquals(1, shuffle.burned());
        assertEquals(BlackjackGame.sha256("ab".repeat(16) + ":2S,10S,9S,7S,KS,5S"), shuffle.commitment());
        assertThrows(IllegalStateException.class, game::reveal);
        assertThrows(IllegalStateException.class, () -> game.apply("p1", Action.HIT)); // No moves while shuffling.
        game.nextHand();
        var state = game.publicState();
        assertEquals(1, state.handStart());
        assertEquals(List.of(new Card("10", "S"), new Card("7", "S")), hand(game, "p1").cards()); // Dealt from the top after the burn.
        game.apply("p1", Action.STAND);
        assertTrue(game.publicState().shoeOver());
        assertEquals(order, game.reveal().order());
        assertEquals(shuffle.commitment(), BlackjackGame.sha256(game.reveal().salt() + ":" + BlackjackGame.orderText(game.reveal().order())));
    }

    @Test void productionShoeIsSixCompleteDecksWithAUniqueCommitment() {
        var first = new BlackjackGame(List.of("p1"));
        var state = first.publicState();
        assertEquals(312, state.shoeSize());
        assertEquals(311, state.cardsRemaining());
        assertNotEquals(state.commitment(), new BlackjackGame(List.of("p1")).publicState().commitment());
        while (!first.publicState().shoeOver()) {
            first.nextHand();
            while (!first.publicState().handOver()) first.apply("p1", Action.STAND);
        }
        var counts = new java.util.HashMap<Card, Integer>();
        first.reveal().order().forEach(card -> counts.merge(card, 1, Integer::sum));
        assertEquals(52, counts.size());
        assertTrue(counts.values().stream().allMatch(count -> count == 6));
    }
}
