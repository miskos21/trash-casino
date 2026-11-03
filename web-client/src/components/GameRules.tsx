import { useRef } from 'react';

export function GameRules() {
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <button className="rules-trigger" onClick={() => dialog.current?.showModal()}>How to play</button>
    <dialog ref={dialog} className="rules-dialog" aria-labelledby="rules-heading"
      onClick={(event) => { if (event.target === dialog.current) dialog.current?.close(); }}>
      <div className="rules-content">
        <div className="rules-heading"><h2 id="rules-heading">How Liar’s Dice works</h2>
          <button aria-label="Close rules" onClick={() => dialog.current?.close()}>×</button></div>
        <p className="free-match-explainer"><strong>Free match</strong>No buy-in, no tokens at risk, no token reward. Winning is the result of this match only.</p>
        <ol>
          <li>Everyone starts with <strong>5 dice</strong>. You see your own dice; other players’ dice stay hidden.</li>
          <li>A claim like <strong>“4 × ⚄”</strong> means: “Across everyone’s dice, at least four dice show five.” It is not a token bet.</li>
          <li>On your turn, raise the quantity, or keep the quantity and raise the face. <strong>Ones are not wild.</strong></li>
          <li><strong>Call bluff</strong> to reveal all dice. If the claim is met, the caller loses one die. Otherwise, the player who made the claim loses one.</li>
          <li>The round loser starts again, or the next active player if the loser is eliminated. With no dice you are out. <strong>The last player with dice wins.</strong></li>
        </ol>
        <p>The turn timer uses a legal fallback if you run out of time. Don currently plays with rule-based moves.</p>
        <button className="resume-button" onClick={() => dialog.current?.close()}>Got it</button>
      </div>
    </dialog>
  </>;
}
