// Signs and submits trash-casino transactions with restricted function-call keys,
// and reads chain state. A transaction counts as successful only when its final
// execution outcome says so; submission alone never counts.

import { Account, JsonRpcProvider, KeyPairSigner, actions } from "near-api-js";
import { verifyMessage } from "near-api-js/nep413";
import type { BridgeConfig } from "./config.ts";

export type TxResult =
  | { ok: true; txHash: string }
  | { ok: false; txHash: string | null; error: string };

export interface PayoutInput {
  accountId: string;
  amount: string;
}

export interface CreateGameInput {
  gameId: string;
  buyIn: string;
  players: string[];
  houseStake?: string;
  timeoutSeconds: number;
}

export interface Nep413Input {
  accountId: string;
  publicKey: string;
  signature: Uint8Array;
  message: string;
  recipient: string;
  nonce: Uint8Array;
}

/** Everything the HTTP layer needs. Tests substitute a recording test double. */
export interface Chain {
  createGame(input: CreateGameInput): Promise<TxResult>;
  settleGame(gameId: string, payouts: PayoutInput[]): Promise<TxResult>;
  cancelGame(gameId: string): Promise<TxResult>;
  agentPay(agent: string, receiverId: string, amount: string, memo?: string): Promise<TxResult>;
  getGame(gameId: string): Promise<unknown>;
  balances(accountId: string): Promise<{ wallet: string; casino: string }>;
  verifyNep413(input: Nep413Input): Promise<boolean>;
}

const GAS = 50n * 10n ** 12n; // 50 Tgas: plenty for the casino's synchronous methods

type Status = unknown;

function isFailure(status: Status): boolean {
  return typeof status === "object" && status !== null && "Failure" in status;
}

/** Interprets a final transaction outcome. Exported for tests. */
export function interpretOutcome(response: unknown): TxResult {
  const r = response as {
    status?: Status;
    transaction?: { hash?: string };
    transaction_outcome?: { id?: string };
    receipts_outcome?: Array<{ outcome?: { status?: Status } }>;
  };
  const txHash = r.transaction?.hash ?? r.transaction_outcome?.id ?? null;
  const status = r.status;
  if (typeof status === "object" && status !== null && "SuccessValue" in status) {
    const failedReceipt = (r.receipts_outcome ?? []).find((receipt) => isFailure(receipt.outcome?.status));
    if (failedReceipt) {
      return { ok: false, txHash, error: describe(failedReceipt.outcome?.status) };
    }
    if (!txHash) return { ok: false, txHash: null, error: "Outcome has no transaction hash" };
    return { ok: true, txHash };
  }
  return { ok: false, txHash, error: describe(status) };
}

function describe(status: Status): string {
  if (status === undefined) return "No execution status";
  const text = JSON.stringify(status);
  // Surface the contract's panic message when there is one.
  const panic = /"ExecutionError":"([^"]+)"/.exec(text) ?? /Smart contract panicked: ([^"\\]+)/.exec(text);
  return (panic ? panic[1] : text).slice(0, 400);
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 400);
}

export class NearChain implements Chain {
  private readonly provider: JsonRpcProvider;
  private readonly settler: Account;
  private readonly agents = new Map<string, Account>();
  private readonly config: BridgeConfig;

  constructor(config: BridgeConfig) {
    this.config = config;
    this.provider = new JsonRpcProvider({ url: config.rpcUrl });
    this.settler = new Account(
      config.settler.accountId,
      this.provider,
      KeyPairSigner.fromSecretKey(config.settler.privateKey as `ed25519:${string}`),
    );
    for (const [name, agent] of Object.entries(config.agents)) {
      this.agents.set(
        name,
        new Account(agent.accountId, this.provider, KeyPairSigner.fromSecretKey(agent.privateKey as `ed25519:${string}`)),
      );
    }
  }

  private async call(signer: Account, methodName: string, args: Record<string, unknown>): Promise<TxResult> {
    try {
      const response = await signer.signAndSendTransaction({
        receiverId: this.config.casinoId,
        actions: [actions.functionCall(methodName, args, GAS, 0n)],
        waitUntil: "FINAL",
        throwOnFailure: false,
      });
      return interpretOutcome(response);
    } catch (error) {
      // Rejected before execution (bad key, RPC down, ...). Nothing happened on-chain
      // that we know of; the caller must re-check state before retrying.
      return { ok: false, txHash: null, error: errorMessage(error) };
    }
  }

  private async view<T>(contractId: string, method: string, args: Record<string, unknown>): Promise<T> {
    return (await this.provider.callFunction({ contractId, method, args, blockQuery: { finality: "final" } })) as T;
  }

  createGame(input: CreateGameInput): Promise<TxResult> {
    return this.call(this.settler, "create_game", {
      game_id: input.gameId,
      buy_in: input.buyIn,
      players: input.players,
      house_stake: input.houseStake ?? null,
      timeout_seconds: input.timeoutSeconds,
    });
  }

  settleGame(gameId: string, payouts: PayoutInput[]): Promise<TxResult> {
    return this.call(this.settler, "settle_game", {
      game_id: gameId,
      payouts: payouts.map((p) => ({ account_id: p.accountId, amount: p.amount })),
    });
  }

  cancelGame(gameId: string): Promise<TxResult> {
    return this.call(this.settler, "cancel_game", { game_id: gameId });
  }

  agentPay(agent: string, receiverId: string, amount: string, memo?: string): Promise<TxResult> {
    const signer = this.agents.get(agent);
    if (!signer) return Promise.resolve({ ok: false, txHash: null, error: `Unknown agent: ${agent}` });
    return this.call(signer, "agent_pay", { receiver_id: receiverId, amount, memo: memo ?? null });
  }

  getGame(gameId: string): Promise<unknown> {
    return this.view(this.config.casinoId, "get_game_status", { game_id: gameId });
  }

  async balances(accountId: string): Promise<{ wallet: string; casino: string }> {
    const [wallet, casino] = await Promise.all([
      this.view<string>(this.config.tokenId, "ft_balance_of", { account_id: accountId }),
      this.view<string>(this.config.casinoId, "get_balance", { account_id: accountId }),
    ]);
    return { wallet: String(wallet ?? "0"), casino: String(casino ?? "0") };
  }

  /** NEP-413 signature check plus a FullAccess-key check against the chain. */
  async verifyNep413(input: Nep413Input): Promise<boolean> {
    try {
      await verifyMessage({
        signerAccountId: input.accountId,
        signerPublicKey: input.publicKey,
        payload: { message: input.message, recipient: input.recipient, nonce: input.nonce },
        signature: input.signature,
        provider: this.provider,
      });
      return true;
    } catch {
      return false;
    }
  }
}
