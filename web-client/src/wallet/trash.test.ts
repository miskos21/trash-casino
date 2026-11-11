import { describe, expect, it } from 'vitest';
import { checkOutcome, formatTrash, isAtLeast, parseTrash } from './trash';

const TRASH = 10n ** 24n;

describe('TRASH amounts', () => {
  it('parses whole and fractional TRASH exactly', () => {
    expect(parseTrash('10')).toBe((10n * TRASH).toString());
    expect(parseTrash('0.5')).toBe((TRASH / 2n).toString());
    expect(parseTrash('1.000000000000000000000001')).toBe((TRASH + 1n).toString());
  });
  it('rejects invalid, zero, and over-precise input', () => {
    for (const input of ['', '0', '-1', '1e3', '1.2.3', 'abc', '1.0000000000000000000000001', '1,5']) {
      expect(parseTrash(input)).toBeNull();
    }
  });
  it('formats yoctoTRASH without floating point', () => {
    expect(formatTrash((1234n * TRASH).toString())).toBe('1,234');
    expect(formatTrash((TRASH * 25n / 10n).toString())).toBe('2.5');
    expect(formatTrash('1')).toBe('0');
    expect(formatTrash('not a number')).toBe('0');
  });
  it('compares balances with BigInt', () => {
    expect(isAtLeast((10n * TRASH).toString(), (10n * TRASH).toString())).toBe(true);
    expect(isAtLeast((10n * TRASH - 1n).toString(), (10n * TRASH).toString())).toBe(false);
    expect(isAtLeast(undefined, '1')).toBe(false);
  });
});

describe('transaction outcomes', () => {
  const hash = '4GZbrRrNQ3fWGbW6K7VWz9CP3PZ8nKcSvvkQKEeF9nQJ';
  it('decodes a successful return value', () => {
    expect(checkOutcome({ status: { SuccessValue: btoa('true') }, transaction: { hash } })).toEqual({ ok: true, txHash: hash, value: true });
    expect(checkOutcome({ status: { SuccessValue: btoa('"0"') }, transaction: { hash } })).toEqual({ ok: true, txHash: hash, value: '0' });
  });
  it('reports contract panics and failed receipts as failures', () => {
    const failed = checkOutcome({ status: { Failure: { ActionError: { kind: { FunctionCallError: { ExecutionError: 'Smart contract panicked: Faucet cooldown: try again later' } } } } }, transaction: { hash } });
    expect(failed).toEqual({ ok: false, txHash: hash, error: 'Faucet cooldown: try again later' });
    expect(checkOutcome({ status: { SuccessValue: '' }, transaction: { hash }, receipts_outcome: [{ outcome: { status: { Failure: {} } } }] }).ok).toBe(false);
    expect(checkOutcome(undefined).ok).toBe(false);
  });
});
