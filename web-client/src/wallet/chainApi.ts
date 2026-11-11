import type { AuthNonceResponse, AuthSessionResponse, BalanceResponse, ChainConfigResponse } from '@raccoon-royale/shared-schemas/types';

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Server returned HTTP ${response.status}`;
    try { message = (await response.json()).message ?? message; } catch { /* Keep the status text. */ }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export const chainApi = {
  config: () => fetch('/api/chain').then((r) => json<ChainConfigResponse>(r)),
  nonce: () => fetch('/api/auth/nonce', { method: 'POST' }).then((r) => json<AuthNonceResponse>(r)),
  verify: (body: { accountId: string; publicKey: string; signature: string; nonce: string }) =>
    fetch('/api/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then((r) => json<AuthSessionResponse>(r)),
  balance: (sessionToken: string) =>
    fetch('/api/wallet/balance', { headers: { authorization: 'Bearer ' + sessionToken } }).then((r) => {
      if (r.status === 401) throw Object.assign(new Error('Wallet session expired. Connect again.'), { expired: true });
      return json<BalanceResponse>(r);
    }),
};

export function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
