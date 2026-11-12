import { useEffect } from 'react';
import type { GameConnection } from '../services/useGameConnection';
import type { Wallet } from '../wallet/useWallet';
import { formatTrash } from '../wallet/trash';
import { TxLink } from './WalletPanel';

const fundingText: Record<string, string> = {
  CREATING: 'Taking stakes from casino balances on NEAR Testnet…',
  CANCELLING: 'Cancelling and refunding stakes…',
  CANCELLED: 'Cancelled. Every stake went back to its casino balance.',
  FAILED: 'The paid game could not start.',
};
const settlementText: Record<string, string> = {
  PENDING: 'Paying out on NEAR Testnet…',
  CONFIRMED: 'Paid out on-chain.',
  FAILED: 'Payout failed.',
};

/**
 * Paid-room status. Stakes come from casino balances without wallet popups, so this only
 * reports progress: opening the game, payouts (per match in Liar's Dice, per hand in Blackjack).
 * `inline` renders it inside the match heading, under the result, instead of as its own floating panel.
 */
export function FundingPanel({ connection: c, wallet, inline = false }: { connection: GameConnection; wallet: Wallet; inline?: boolean }) {
  const room = c.room;
  const economy = room?.economy;
  // Balances change without the player signing anything: refresh when the chain confirms.
  useEffect(() => { if (economy?.settlementTxHash || economy?.funding === 'FUNDED') void wallet.refresh(); },
    [economy?.settlementTxHash, economy?.funding, economy?.gameId]);
  if (!room || !economy) return null;

  const blackjack = room.game === 'BLACKJACK';
  const stake = formatTrash(economy.buyIn);
  const seat = (playerId: string) => room.participants.find((p) => p.playerId === playerId);
  const starting = room.phase === 'FUNDING'
    || ((economy.funding === 'CANCELLED' || economy.funding === 'FAILED') && room.phase !== 'IN_PROGRESS');
  const header = <header><strong>{blackjack ? 'Blackjack for TRASH' : 'Liar’s Dice for TRASH'}</strong>
    <span>{blackjack ? `Bet ${stake} TRASH per hand` : `Buy-in ${stake} TRASH`}</span></header>;

  if (starting) return <section className={'funding-panel' + (inline ? ' inline' : '')} aria-live="polite" aria-label="Paid game status">
    {header}
    <p>{fundingText[economy.funding] ?? ''}</p>
    {economy.message && <p className="room-error">{economy.message}</p>}
  </section>;

  if (blackjack && (room.phase === 'IN_PROGRESS' || room.phase === 'FINISHED')) {
    const mine = economy.payouts.find((p) => p.playerId === room.youId);
    return <section className={'funding-panel compact' + (inline ? ' inline' : '')} aria-live="polite" aria-label="Paid hand status">
      {header}
      {mine && economy.settlement !== 'NOT_STARTED' && <p>Last hand: {mine.amount === '0' ? 'lost the bet'
        : `${formatTrash(mine.amount)} TRASH back`} · {settlementText[economy.settlement]} <TxLink wallet={wallet} hash={economy.settlementTxHash} /></p>}
      {economy.message && <p className="room-error">{economy.message}</p>}
    </section>;
  }

  if (room.phase === 'FINISHED' && economy.funding === 'FUNDED' && economy.settlement !== 'NOT_STARTED') {
    return <section className={'funding-panel' + (inline ? ' inline' : '')} aria-live="polite" aria-label="Paid game status">
      {header}
      <p>{settlementText[economy.settlement] ?? ''}</p>
      {economy.payouts.map((p) => <p key={p.playerId}>{seat(p.playerId)?.displayName ?? 'Player'} wins {formatTrash(p.amount)} TRASH
        {seat(p.playerId)?.npc ? ' for the house' : ' into their casino balance'}.</p>)}
      <TxLink wallet={wallet} hash={economy.settlementTxHash} />
      {economy.message && <p className="room-error">{economy.message}</p>}
    </section>;
  }
  return null;
}
