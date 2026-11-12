import { useState } from 'react';
import type { Wallet } from '../wallet/useWallet';
import { formatTrash, parseTrash } from '../wallet/trash';

export function TxLink({ wallet, hash }: { wallet: Wallet; hash?: string | null }) {
  if (!hash || !wallet.config) return null;
  return <a className="tx-link" href={wallet.config.explorerUrl + '/txns/' + hash} target="_blank" rel="noreferrer">View transaction</a>;
}

export function WalletMessageLine({ wallet }: { wallet: Wallet }) {
  if (wallet.busy) return <p className="wallet-message" role="status">{wallet.busy}</p>;
  if (!wallet.message) return null;
  return <p className={'wallet-message ' + wallet.message.kind} role={wallet.message.kind === 'error' ? 'alert' : 'status'}>
    {wallet.message.text} <TxLink wallet={wallet} hash={wallet.message.txHash} />
  </p>;
}

function AmountAction({ label, disabled, onSubmit }: { label: string; disabled: boolean; onSubmit: (yocto: string) => Promise<boolean> }) {
  const [value, setValue] = useState('');
  const amount = parseTrash(value);
  return <form className="wallet-amount" onSubmit={async (event) => {
    event.preventDefault();
    if (amount && await onSubmit(amount)) setValue('');
  }}>
    <input aria-label={label + ' amount in TRASH'} inputMode="decimal" placeholder="TRASH" value={value}
      onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ''))} />
    <button className="secondary-button" disabled={disabled || !amount}>{label}</button>
  </form>;
}

/** Wallet connection, test faucet, deposit, and withdrawal. NEAR Testnet only. */
export function WalletPanel({ wallet, onConnect = wallet.connect }: { wallet: Wallet; onConnect?: () => void }) {
  if (!wallet.config) return null;
  if (!wallet.enabled) return <section className="wallet-panel">
    <h2>Wallet · NEAR Testnet</h2>
    <p className="free-play-note">Playing for TRASH is not configured on this server. Free play works as usual.</p>
  </section>;
  const busy = !!wallet.busy;
  const b = wallet.balances;
  return <section className="wallet-panel" aria-label="Wallet">
    <h2>Wallet · NEAR Testnet</h2>
    {!wallet.session ? <>
      <p className="free-play-note">Connect a NEAR testnet wallet and sign a login message to play Liar’s Dice for TRASH.
        Signing the message costs nothing and moves no funds.</p>
      <button className="resume-button" disabled={busy} onClick={onConnect}>Connect wallet</button>
    </> : <>
      <div className="wallet-account"><span>{wallet.accountId}</span>
        <button className="link-button" onClick={wallet.disconnect}>Disconnect</button></div>
      <div className="wallet-balances">
        <div><small>In wallet</small><strong>{b ? formatTrash(b.wallet) : '…'} TRASH</strong></div>
        <div><small>In casino</small><strong>{b ? formatTrash(b.casino) : '…'} TRASH</strong></div>
      </div>
      <button className="secondary-button" disabled={busy} onClick={wallet.faucet}>Get free test TRASH</button>
      <p className="wallet-fine-print">The test faucet mints TRASH to your wallet, at most once a minute. The first claim
        attaches 0.00125 NEAR for token storage; it is refunded if you are already registered.</p>
      <AmountAction label="Deposit" disabled={busy} onSubmit={wallet.deposit} />
      <AmountAction label="Withdraw" disabled={busy} onSubmit={wallet.withdraw} />
      <p className="wallet-fine-print">You play from your casino balance. Withdraw it back to your wallet at any time.</p>
    </>}
    <WalletMessageLine wallet={wallet} />
    <p className="wallet-fine-print">TRASH has no real-world value. It cannot be bought or cashed out.</p>
  </section>;
}
