import { useRef } from 'react';
import type { GameType } from '@raccoon-royale/shared-schemas/types';

export function GameRules({ game = 'LIARS_DICE' }: { game?: GameType }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const blackjack = game === 'BLACKJACK';
  return <>
    <button className="rules-trigger" onClick={() => dialog.current?.showModal()}>How to play</button>
    <dialog ref={dialog} className="rules-dialog" aria-labelledby={'rules-heading-' + game}
      onClick={(event) => { if (event.target === dialog.current) dialog.current?.close(); }}>
      <div className="rules-content">
        <div className="rules-heading"><h2 id={'rules-heading-' + game}>{blackjack ? 'How Blackjack works' : 'How Liar’s Dice works'}</h2>
          <button aria-label="Close rules" onClick={() => dialog.current?.close()}>×</button></div>
        <p className="free-match-explainer"><strong>Free match</strong>No buy-in, no tokens at risk, no token reward. Winning is the result of this match only.</p>
        {blackjack ? <ol>
          <li>Every player, human or agent, plays their own hand against <strong>the house dealer</strong>. Players do not compete with each other.</li>
          <li>Number cards count their value, <strong>J, Q, K count 10</strong>, and an <strong>Ace counts 11 or 1</strong>, whichever helps.</li>
          <li>You and the dealer get two cards. One dealer card stays face down until every player has finished.</li>
          <li>On your turn, <strong>Hit</strong> to take a card or <strong>Stand</strong> to keep your total. Over 21 is a bust and loses.</li>
          <li>The dealer then reveals and draws until reaching 17 or more. Closer to 21 than the dealer wins; an equal total is a push.
            Ace plus a 10-value card as your first two cards is a <strong>Blackjack</strong>.</li>
        </ol> : <ol>
          <li>Everyone starts with <strong>5 dice</strong>. You see your own dice; other players’ dice stay hidden.</li>
          <li>A claim like <strong>“4 × ⚄”</strong> means: “Across everyone’s dice, at least four dice show five.” It is not a token bet.</li>
          <li>On your turn, raise the quantity, or keep the quantity and raise the face. <strong>Ones are not wild.</strong></li>
          <li><strong>Call bluff</strong> to reveal all dice. If the claim is met, the caller loses one die. Otherwise, the player who made the claim loses one.</li>
          <li>The round loser starts again, or the next active player if the loser is eliminated. With no dice you are out. <strong>The last player with dice wins.</strong></li>
        </ol>}
        <p>{blackjack ? 'If the turn timer runs out, you stand automatically. Agents hit below 17 and stand otherwise. The server shuffles two decks for every hand; this is not provably fair randomness.'
          : 'The turn timer uses a legal fallback if you run out of time. Agents (Don, Foxy) currently play rule-based moves.'}</p>
        <button className="resume-button" onClick={() => dialog.current?.close()}>Got it</button>
      </div>
    </dialog>
  </>;
}
