// Bridge unit tests. `RecordingChain` is a test double used only here; the running
// bridge always talks to the real NEAR RPC.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { KeyPair } from "near-api-js";
import { createBridgeServer } from "../src/server.ts";
import { interpretOutcome, type Chain, type CreateGameInput, type Nep413Input, type PayoutInput, type TxResult } from "../src/chain.ts";
import { loadConfig, ConfigError } from "../src/config.ts";

const TOKEN = "t".repeat(40);
const OK: TxResult = { ok: true, txHash: "4GZbrRrNQ3fWGbW6K7VWz9CP3PZ8nKcSvvkQKEeF9nQJ" };

class RecordingChain implements Chain {
  calls: Array<[string, unknown]> = [];
  result: TxResult = OK;
  async createGame(input: CreateGameInput) { this.calls.push(["createGame", input]); return this.result; }
  async settleGame(gameId: string, payouts: PayoutInput[]) { this.calls.push(["settleGame", { gameId, payouts }]); return this.result; }
  async cancelGame(gameId: string) { this.calls.push(["cancelGame", gameId]); return this.result; }
  async agentPay(agent: string, receiverId: string, amount: string, memo?: string) {
    this.calls.push(["agentPay", { agent, receiverId, amount, memo }]); return this.result;
  }
  async getGame(gameId: string) { return gameId === "known" ? { game_id: "known", state: "OPEN" } : null; }
  async balances() { return { wallet: "100", casino: "7" }; }
  async verifyNep413(input: Nep413Input) { this.calls.push(["verify", input.accountId]); return input.accountId === "alice.testnet"; }
}

async function withServer(fn: (call: (method: string, path: string, body?: unknown, auth?: string) => Promise<{ status: number; body: any }>, chain: RecordingChain) => Promise<void>) {
  const chain = new RecordingChain();
  const server = createBridgeServer(chain, {
    token: TOKEN, network: "testnet", tokenId: "token.x.testnet", casinoId: "casino.x.testnet",
    settlerId: "settler.x.testnet", agents: { don: "don.x.testnet" },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const call = async (method: string, path: string, body?: unknown, auth = `Bearer ${TOKEN}`) => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { authorization: auth, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  try {
    await fn(call, chain);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const TRASH = 10n ** 24n;

test("rejects requests without the shared token", async () => {
  await withServer(async (call) => {
    assert.equal((await call("GET", "/health", undefined, "")).status, 401);
    assert.equal((await call("GET", "/health", undefined, "Bearer wrong")).status, 401);
    const ok = await call("GET", "/health");
    assert.equal(ok.status, 200);
    assert.equal(ok.body.casinoId, "casino.x.testnet");
  });
});

test("create game validates input and forwards exact amounts", async () => {
  await withServer(async (call, chain) => {
    const body = { gameId: "ld-abc", buyIn: (10n * TRASH).toString(), players: ["alice.testnet", "don.x.testnet"], timeoutSeconds: 600 };
    const res = await call("POST", "/games", body);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, OK);
    assert.deepEqual(chain.calls[0], ["createGame", { ...body, houseStake: undefined }]);

    assert.equal((await call("POST", "/games", { ...body, extra: 1 })).status, 400, "unknown field");
    assert.equal((await call("POST", "/games", { ...body, buyIn: "1.5" })).status, 400, "decimal amount");
    assert.equal((await call("POST", "/games", { ...body, buyIn: "0" })).status, 400, "zero amount");
    assert.equal((await call("POST", "/games", { ...body, buyIn: (1n << 128n).toString() })).status, 400, "above u128");
    assert.equal((await call("POST", "/games", { ...body, players: ["Alice!"] })).status, 400, "bad account");
    assert.equal((await call("POST", "/games", { ...body, players: [] })).status, 400, "no players");
    assert.equal((await call("POST", "/games", { ...body, gameId: "x".repeat(65) })).status, 400, "long id");
    assert.equal(chain.calls.length, 1, "invalid requests never reach the chain");
  });
});

test("chain failures surface as 422 with the error", async () => {
  await withServer(async (call, chain) => {
    chain.result = { ok: false, txHash: "abc", error: "Payouts exceed the escrowed total" };
    const res = await call("POST", "/games/g1/settle", { payouts: [{ accountId: "alice.testnet", amount: "20" }] });
    assert.equal(res.status, 422);
    assert.equal(res.body.error, "Payouts exceed the escrowed total");
  });
});

test("settle, cancel, game view, balances", async () => {
  await withServer(async (call, chain) => {
    assert.equal((await call("POST", "/games/g1/settle", { payouts: [] })).status, 200);
    assert.equal((await call("POST", "/games/g1/settle", { payouts: [{ accountId: "a.testnet", amount: "-1" }] })).status, 400);
    assert.equal((await call("POST", "/games/g1/cancel", {})).status, 200);
    assert.deepEqual(chain.calls.map((c) => c[0]), ["settleGame", "cancelGame"]);
    assert.equal((await call("GET", "/games/known")).status, 200);
    assert.equal((await call("GET", "/games/unknown")).status, 404);
    const balances = await call("GET", "/accounts/alice.testnet/balances");
    assert.deepEqual(balances.body, { accountId: "alice.testnet", wallet: "100", casino: "7" });
  });
});

test("agent pay only for configured agents", async () => {
  await withServer(async (call, chain) => {
    assert.equal((await call("POST", "/agents/eve/pay", { receiverId: "alice.testnet", amount: "1" })).status, 404);
    assert.equal((await call("POST", "/agents/don/pay", { receiverId: "alice.testnet", amount: "5", memo: "tip" })).status, 200);
    assert.deepEqual(chain.calls[0], ["agentPay", { agent: "don", receiverId: "alice.testnet", amount: "5", memo: "tip" }]);
  });
});

test("auth verify passes decoded bytes to the chain check", async () => {
  await withServer(async (call) => {
    const body = {
      accountId: "alice.testnet", publicKey: "ed25519:11111111111111111111111111111111",
      signature: Buffer.alloc(64, 1).toString("base64"), message: "Sign in", recipient: "trashnino",
      nonce: Buffer.alloc(32, 2).toString("base64"),
    };
    assert.deepEqual((await call("POST", "/auth/verify", body)).body, { valid: true });
    assert.deepEqual((await call("POST", "/auth/verify", { ...body, accountId: "bob.testnet" })).body, { valid: false });
    assert.equal((await call("POST", "/auth/verify", { ...body, nonce: Buffer.alloc(31).toString("base64") })).status, 400);
  });
});

test("interprets final execution outcomes, not submissions", () => {
  const hash = "4GZbrRrNQ3fWGbW6K7VWz9CP3PZ8nKcSvvkQKEeF9nQJ";
  assert.deepEqual(interpretOutcome({ status: { SuccessValue: "" }, transaction: { hash }, receipts_outcome: [] }), { ok: true, txHash: hash });
  const failed = interpretOutcome({
    status: { Failure: { ActionError: { kind: { FunctionCallError: { ExecutionError: "Smart contract panicked: Game is not open" } } } } },
    transaction: { hash },
  });
  assert.equal(failed.ok, false);
  assert.match((failed as { error: string }).error, /Game is not open/);
  const receiptFailed = interpretOutcome({
    status: { SuccessValue: "" }, transaction: { hash },
    receipts_outcome: [{ outcome: { status: { Failure: { ActionError: {} } } } }],
  });
  assert.equal(receiptFailed.ok, false);
  assert.equal(interpretOutcome({ status: "Started", transaction: { hash } }).ok, false);
});

test("config refuses mainnet and weak tokens", () => {
  const key = KeyPair.fromRandom("ed25519").toString();
  const env = {
    BRIDGE_TOKEN: TOKEN, TRASH_TOKEN_CONTRACT_ID: "token.x.testnet", TRASH_CASINO_CONTRACT_ID: "casino.x.testnet",
    NEAR_SETTLEMENT_ACCOUNT_ID: "settler.x.testnet", NEAR_SETTLEMENT_PRIVATE_KEY: key,
    NEAR_AGENT_DON_ACCOUNT_ID: "don.x.testnet", NEAR_AGENT_DON_PRIVATE_KEY: key,
  };
  const config = loadConfig(env);
  assert.equal(config.network, "testnet");
  assert.deepEqual(Object.keys(config.agents), ["don"]);
  assert.throws(() => loadConfig({ ...env, NEAR_NETWORK: "mainnet" }), ConfigError);
  assert.throws(() => loadConfig({ ...env, NEAR_RPC_URL: "https://rpc.mainnet.near.org" }), ConfigError);
  assert.throws(() => loadConfig({ ...env, TRASH_CASINO_CONTRACT_ID: "casino.near" }), ConfigError);
  // A local sandbox rehearsal uses *.test.near accounts.
  assert.equal(loadConfig({ ...env, NEAR_NETWORK: "sandbox", TRASH_CASINO_CONTRACT_ID: "casino.test.near" }).casinoId, "casino.test.near");
  assert.throws(() => loadConfig({ ...env, BRIDGE_TOKEN: "short" }), ConfigError);
  assert.throws(() => loadConfig({ ...env, NEAR_SETTLEMENT_PRIVATE_KEY: "not-a-key" }), ConfigError);
});
