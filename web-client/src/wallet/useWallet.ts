import { useCallback, useEffect, useRef, useState } from 'react';
import type { BalanceResponse, ChainConfigResponse } from '@raccoon-royale/shared-schemas/types';
import type { NearConnector, NearWalletBase } from '@hot-labs/near-connect';
import { base64ToBytes, chainApi } from './chainApi';
import { checkOutcome, type Outcome, type TxCheck } from './trash';

// NEAR Testnet only. TRASH has no real-world value. The wallet signs every
// transaction; the browser never holds keys or decides outcomes.
const SESSION_KEY = 'trashnino-wallet-session';
const STORAGE_DEPOSIT = '1250000000000000000000'; // 0.00125 NEAR, NEP-145 minimum; refunded if already registered
const TGAS = '000000000000';

type Session = { accountId: string; sessionToken: string; expiresAtEpochMillis: number };
export type WalletMessage = { kind: 'ok' | 'error'; text: string; txHash?: string };

function loadSession(): Session | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
    return value && typeof value.accountId === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value.sessionToken)
      && value.expiresAtEpochMillis > Date.now() ? value as Session : null;
  } catch { return null; }
}
function saveSession(session: Session | null) {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* The session lasts until reload. */ }
}
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 200);

export function useWallet() {
  const [config, setConfig] = useState<ChainConfigResponse | null>(null);
  const [session, setSession] = useState<Session | null>(loadSession);
  const [balances, setBalances] = useState<BalanceResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<WalletMessage | null>(null);
  const connector = useRef<NearConnector | null>(null);

  useEffect(() => {
    chainApi.config().then(setConfig).catch(() => setConfig(null));
  }, []);

  const getConnector = useCallback(async () => {
    if (!connector.current) {
      const { NearConnector } = await import('@hot-labs/near-connect');
      connector.current = new NearConnector({ network: 'testnet', features: { signMessage: true, testnet: true }, footerBranding: null });
    }
    return connector.current;
  }, []);

  const clear = useCallback(() => { saveSession(null); setSession(null); setBalances(null); }, []);

  const refresh = useCallback(async (current: Session | null = session) => {
    if (!current) return;
    try { setBalances(await chainApi.balance(current.sessionToken)); }
    catch (error) {
      if ((error as { expired?: boolean }).expired) clear();
      setMessage({ kind: 'error', text: errorText(error) });
    }
  }, [session, clear]);

  useEffect(() => { if (session && config?.enabled) void refresh(session); }, [session?.sessionToken, config?.enabled]);

  // Keep the casino balance visible and current: games take stakes and pay out without wallet popups.
  useEffect(() => {
    if (!session || !config?.enabled) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        chainApi.balance(session.sessionToken).then(setBalances).catch((error) => { if ((error as { expired?: boolean }).expired) clear(); });
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [session?.sessionToken, config?.enabled, clear]);

  /** Connect a wallet, then prove ownership with a NEP-413 signature over a server nonce. */
  const connect = useCallback(async () => {
    setBusy('Connecting wallet…'); setMessage(null);
    try {
      const c = await getConnector();
      const wallet = await c.connect();
      const accounts = await wallet.getAccounts({ network: 'testnet' });
      const accountId = accounts[0]?.accountId;
      if (!accountId) throw new Error('The wallet returned no account.');
      setBusy('Sign the login message in your wallet…');
      const challenge = await chainApi.nonce();
      const signed = await wallet.signMessage({ message: challenge.message, recipient: challenge.recipient,
        nonce: base64ToBytes(challenge.nonce), network: 'testnet', signerId: accountId });
      const verified = await chainApi.verify({ accountId: signed.accountId || accountId, publicKey: signed.publicKey,
        signature: signed.signature, nonce: challenge.nonce });
      saveSession(verified); setSession(verified);
      setMessage({ kind: 'ok', text: 'Wallet verified: ' + verified.accountId });
    } catch (error) {
      setMessage({ kind: 'error', text: errorText(error) });
    } finally { setBusy(null); }
  }, [getConnector]);

  const disconnect = useCallback(async () => {
    try { const c = await getConnector(); await c.disconnect(); } catch { /* Already disconnected. */ }
    clear(); setMessage(null);
  }, [getConnector, clear]);

  const call = useCallback(async (label: string, receiverId: string, methodName: string, args: object,
    deposit: string, gasTgas: number): Promise<TxCheck> => {
    if (!session) return { ok: false, error: 'Connect your wallet first.' };
    setBusy(label); setMessage(null);
    try {
      const c = await getConnector();
      let wallet: NearWalletBase;
      try { wallet = await c.wallet(); } catch { wallet = await c.connect(); }
      const outcome = await wallet.signAndSendTransaction({ network: 'testnet', signerId: session.accountId, receiverId,
        actions: [{ type: 'FunctionCall', params: { methodName, args, gas: gasTgas + TGAS, deposit } }] });
      return checkOutcome(outcome as unknown as Outcome);
    } catch (error) {
      return { ok: false, error: errorText(error) };
    } finally { setBusy(null); }
  }, [session, getConnector]);

  const report = useCallback(async (result: TxCheck, success: string) => {
    if (result.ok) setMessage({ kind: 'ok', text: success, txHash: result.txHash });
    else setMessage({ kind: 'error', text: result.error, txHash: result.txHash });
    await refresh();
    return result.ok;
  }, [refresh]);

  const faucet = useCallback(async () => {
    if (!config?.tokenId) return false;
    const result = await call('Claiming test TRASH…', config.tokenId, 'faucet', {}, STORAGE_DEPOSIT, 30);
    return report(result, 'Free test TRASH minted to your wallet.');
  }, [config, call, report]);

  const deposit = useCallback(async (amount: string) => {
    if (!config?.tokenId || !config.casinoId) return false;
    const result = await call('Depositing into the casino…', config.tokenId, 'ft_transfer_call',
      { receiver_id: config.casinoId, amount, msg: JSON.stringify({ type: 'deposit' }) }, '1', 100);
    // ft_transfer_call returns the amount the casino used; anything else was refunded.
    if (result.ok && result.value !== amount) return report({ ok: false, txHash: result.txHash, error: 'The casino refused the deposit; your TRASH was returned.' }, '');
    return report(result, 'Deposited into your casino balance.');
  }, [config, call, report]);

  const withdraw = useCallback(async (amount: string) => {
    if (!config?.casinoId) return false;
    const result = await call('Withdrawing to your wallet…', config.casinoId, 'withdraw', { amount }, '1', 50);
    if (result.ok && result.value !== true) return report({ ok: false, txHash: result.txHash, error: 'The token transfer failed; your casino balance was restored.' }, '');
    return report(result, 'Withdrawn to your wallet.');
  }, [config, call, report]);

  return { config, enabled: !!config?.enabled, session, accountId: session?.accountId ?? null, balances, busy, message,
    connect, disconnect, refresh: () => refresh(), faucet, deposit, withdraw, dismiss: () => setMessage(null) };
}
export type Wallet = ReturnType<typeof useWallet>;
