// Exact TRASH amounts. 24 decimals, BigInt only, never floating point.
export const TRASH_DECIMALS = 24;
const ONE = 10n ** BigInt(TRASH_DECIMALS);
const U128_MAX = (1n << 128n) - 1n;

/** yoctoTRASH string -> human text with up to `fraction` decimals, e.g. "12.5". */
export function formatTrash(yocto: string, fraction = 2): string {
  if (!/^\d+$/.test(yocto)) return '0';
  const value = BigInt(yocto);
  const whole = value / ONE;
  const rest = value % ONE;
  const digits = rest.toString().padStart(TRASH_DECIMALS, '0').slice(0, fraction).replace(/0+$/, '');
  return whole.toLocaleString('en-US') + (digits ? '.' + digits : '');
}

/** "12" or "12.5" (whole TRASH) -> yoctoTRASH string; null if invalid or not positive. */
export function parseTrash(input: string): string | null {
  const text = input.trim();
  const match = /^(\d{1,15})(?:\.(\d{1,24}))?$/.exec(text);
  if (!match) return null;
  const value = BigInt(match[1]) * ONE + BigInt((match[2] ?? '').padEnd(TRASH_DECIMALS, '0') || '0');
  return value > 0n && value <= U128_MAX ? value.toString() : null;
}

export function isAtLeast(yocto: string | undefined, required: string): boolean {
  return !!yocto && /^\d+$/.test(yocto) && BigInt(yocto) >= BigInt(required);
}

/** Wallet transaction outcome, as returned by near-connect (FinalExecutionOutcome). */
export interface Outcome {
  status?: unknown;
  transaction?: { hash?: string };
  transaction_outcome?: { id?: string };
  receipts_outcome?: Array<{ outcome?: { status?: unknown } }>;
}

export type TxCheck = { ok: true; txHash: string; value: unknown } | { ok: false; txHash?: string; error: string };

const hasKey = (value: unknown, key: string): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && key in value;

/** Success means the final execution outcome succeeded, not that the wallet submitted it. */
export function checkOutcome(outcome: Outcome | undefined): TxCheck {
  const txHash = outcome?.transaction?.hash ?? outcome?.transaction_outcome?.id;
  const status = outcome?.status;
  if (!outcome || !hasKey(status, 'SuccessValue')) {
    const text = JSON.stringify(status ?? 'No outcome');
    const panic = /Smart contract panicked: ([^"\\]+)/.exec(text);
    return { ok: false, txHash, error: panic ? panic[1] : 'The transaction failed on-chain.' };
  }
  if ((outcome.receipts_outcome ?? []).some((r) => hasKey(r.outcome?.status, 'Failure'))) {
    return { ok: false, txHash, error: 'Part of the transaction failed on-chain.' };
  }
  let value: unknown = null;
  const raw = status.SuccessValue;
  if (typeof raw === 'string' && raw) {
    try { value = JSON.parse(atob(raw)); } catch { value = null; }
  }
  return txHash ? { ok: true, txHash, value } : { ok: false, error: 'The wallet returned no transaction hash.' };
}
