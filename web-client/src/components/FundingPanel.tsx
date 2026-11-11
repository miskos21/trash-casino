import { useEffect, useState } from 'react';
import type { GameConnection } from '../services/useGameConnection';
import type { Wallet } from '../wallet/useWallet';
import { formatTrash, isAtLeast } from '../wallet/trash';
import { TxLink, WalletMessageLine } from './WalletPanel';

const fundingText: Record<string, string> = {
  CREATING: 'Opening the game on NEAR Testnet…',
  AWAITING_PAYMENTS: 'Waiting for every player to pay the buy-in.',
  CANCELLING: 'Cancelling and refunding buy-ins…',
  CANCELLED: 'Cancelled. Every buy-in went back to its casino balance.',
  FAILED: 'The paid game could not start.',
};
const settlementText: Record<string, string> = {
  PENDING: 'Paying out the pot on NEAR Testnet…',
  CONFIRMED: 'Pot paid out on-chain.',
  FAILED: 'Settlement failed.',
};

/** Paid-room status: buy-in payment before the match, settlement after it. */
export function FundingPanel({ connection: c, wallet }: { connection: GameConnection; wallet: Wallet }) {
  const room = c.room;
  const economy = room?.economy;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (room?.phase !== 'FUNDING') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [room?.phase]);
  if (!room || !economy) return null;

  const funding = room.phase === 'FUNDING'
    || ((economy.funding === 'CANCELLED' || economy.funding === 'FAILED') && room.phase !== 'IN_PROGRESS');
  const settled = room.phase === 'FINISHED' && economy.funding === 'FUNDED' && economy.settlement !== 'NOT_STARTED';
  if (!funding && !settled) return null;

  const iPaid = economy.paidPlayerIds.includes(room.youId);
  const canPay = economy.funding === 'AWAITING_PAYMENTS' && !iPaid && economy.gameId;
  const enough = isAtLeast(wallet.balances?.casino, economy.buyIn);
  const secondsLeft = Math.max(0, Math.round((economy.fundingDeadlineEpochMillis - now) / 1000));
  const seat = (playerId: string) => room.participants.find((p) => p.playerId === playerId);

  return <section className="funding-panel" aria-live="polite" aria-label="Paid game status">
    <header><strong>Paid Liar’s Dice</strong><span>Buy-in {formatTrash(economy.buyIn)} TRASH</span></header>
    {funding ? <>
      <p>{fundingText[economy.funding] ?? ''}{economy.funding === 'AWAITING_PAYMENTS' ? ` ${secondsLeft}s left.` : ''}</p>
      <ul>{room.participants.map((p) => <li key={p.playerId}>
        <span>{p.displayName}{p.playerId === room.youId ? ' (you)' : ''}</span>
        <small>{economy.paidPlayerIds.includes(p.playerId) ? (p.npc ? 'Seated by the house' : 'Paid') : 'Not paid'}</small>
      </li>)}</ul>
      {canPay && <>
        <button className="resume-button" disabled={!!wallet.busy || !enough || !wallet.session}
          onClick={() => wallet.joinGame(economy.gameId!)}>Pay {formatTrash(economy.buyIn)} TRASH buy-in</button>
        {!enough && <p className="room-error">Your casino balance is {formatTrash(wallet.balances?.casino ?? '0')} TRASH.
          Open the menu, get test TRASH, and deposit it first.</p>}
      </>}
      {iPaid && economy.funding === 'AWAITING_PAYMENTS' && <p>You paid. The match starts when everyone has paid.</p>}
    </> : <>
      <p>{settlementText[economy.settlement] ?? ''}</p>
      {economy.payouts.map((p) => <p key={p.playerId}>{seat(p.playerId)?.displayName ?? 'Player'} wins {formatTrash(p.amount)} TRASH
        {seat(p.playerId)?.npc ? ' for the house' : ' into their casino balance'}.</p>)}
      <TxLink wallet={wallet} hash={economy.settlementTxHash} />
    </>}
    {economy.message && <p className="room-error">{economy.message}</p>}
    <WalletMessageLine wallet={wallet} />
  </section>;
}
