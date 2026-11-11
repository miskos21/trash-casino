// Internal HTTP API for the Java backend. Not for browsers: every request needs the
// shared bearer token, and the default bind address is 127.0.0.1.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import type { Chain, TxResult } from "./chain.ts";
import * as v from "./validate.ts";

export interface ServerInfo {
  token: string;
  network: string;
  tokenId: string;
  casinoId: string;
  settlerId: string;
  agents: Record<string, string>;
}

const MAX_BODY = 16 * 1024;
const MAX_TIMEOUT_SECONDS = 7 * 24 * 3600;

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(text);
}

function authorized(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization ?? "";
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, "Body too large");
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Body is not valid JSON");
  }
}

/** Structured log line. Never includes keys, tokens, or signatures. */
function log(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ time: new Date().toISOString(), event, ...data }));
}

function txResponse(res: ServerResponse, operation: string, details: Record<string, unknown>, result: TxResult): void {
  log("tx", { operation, ...details, ok: result.ok, txHash: result.txHash, error: result.ok ? undefined : result.error });
  send(res, result.ok ? 200 : 422, result);
}

export function createBridgeServer(chain: Chain, info: ServerInfo): Server {
  return createServer((req, res) => {
    handle(chain, info, req, res).catch((error: unknown) => {
      if (error instanceof v.ValidationError) return send(res, 400, { error: error.message });
      if (error instanceof HttpError) return send(res, error.status, { error: error.message });
      log("error", { path: req.url, message: error instanceof Error ? error.message : String(error) });
      send(res, 502, { error: "Chain request failed" });
    });
  });
}

async function handle(chain: Chain, info: ServerInfo, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!authorized(req, info.token)) return send(res, 401, { error: "Unauthorized" });
  const url = new URL(req.url ?? "/", "http://bridge.invalid");
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const method = req.method ?? "GET";
  // "/games/g-1/settle" -> "/games/:/settle"; "/auth/verify" stays as is.
  const route = parts.length < 2 || parts[0] === "auth"
    ? `${method} /${parts.join("/")}`
    : `${method} /${[parts[0], ":", ...parts.slice(2)].join("/")}`;

  switch (route) {
    case "GET /health":
      return send(res, 200, {
        status: "UP",
        network: info.network,
        tokenId: info.tokenId,
        casinoId: info.casinoId,
        settlerId: info.settlerId,
        agents: info.agents,
      });

    case "POST /games": {
      const body = v.object(await readJson(req), ["gameId", "buyIn", "players", "houseStake", "timeoutSeconds"],
        ["gameId", "buyIn", "players", "timeoutSeconds"]);
      if (!Array.isArray(body.players) || body.players.length < 1 || body.players.length > 4) {
        v.fail("players must list 1-4 accounts");
      }
      const input = {
        gameId: v.gameId(body.gameId),
        buyIn: v.amount(body.buyIn, "buyIn"),
        players: body.players.map((p) => v.accountId(p, "players[]")),
        houseStake: body.houseStake === undefined ? undefined : v.amount(body.houseStake, "houseStake"),
        timeoutSeconds: v.integer(body.timeoutSeconds, "timeoutSeconds", 1, MAX_TIMEOUT_SECONDS),
      };
      return txResponse(res, "create_game", { gameId: input.gameId, players: input.players, buyIn: input.buyIn },
        await chain.createGame(input));
    }

    case "GET /games/:": {
      const game = await chain.getGame(v.gameId(parts[1]));
      return game === null || game === undefined ? send(res, 404, { error: "Unknown game" }) : send(res, 200, game);
    }

    case "POST /games/:/settle": {
      const gameId = v.gameId(parts[1]);
      const body = v.object(await readJson(req), ["payouts"]);
      if (!Array.isArray(body.payouts) || body.payouts.length > 4) v.fail("payouts must list 0-4 entries");
      const payouts = body.payouts.map((p) => {
        const entry = v.object(p, ["accountId", "amount"]);
        return { accountId: v.accountId(entry.accountId), amount: v.amount(entry.amount) };
      });
      return txResponse(res, "settle_game", { gameId, payouts }, await chain.settleGame(gameId, payouts));
    }

    case "POST /games/:/cancel": {
      const gameId = v.gameId(parts[1]);
      v.object(await readJson(req), []);
      return txResponse(res, "cancel_game", { gameId }, await chain.cancelGame(gameId));
    }

    case "POST /agents/:/pay": {
      const agent = parts[1];
      if (!(agent in info.agents)) return send(res, 404, { error: "Unknown agent" });
      const body = v.object(await readJson(req), ["receiverId", "amount", "memo"], ["receiverId", "amount"]);
      const receiverId = v.accountId(body.receiverId, "receiverId");
      const amount = v.amount(body.amount);
      const memo = body.memo === undefined ? undefined : v.text(body.memo, "memo", 128);
      return txResponse(res, "agent_pay", { agent, receiverId, amount }, await chain.agentPay(agent, receiverId, amount, memo));
    }

    case "GET /accounts/:/balances": {
      const accountId = v.accountId(parts[1]);
      return send(res, 200, { accountId, ...(await chain.balances(accountId)) });
    }

    case "POST /auth/verify": {
      const body = v.object(await readJson(req), ["accountId", "publicKey", "signature", "message", "recipient", "nonce"]);
      const nonce = v.base64Bytes(body.nonce, "nonce", 32);
      if (nonce.length !== 32) v.fail("nonce must be 32 bytes");
      const ok = await chain.verifyNep413({
        accountId: v.accountId(body.accountId),
        publicKey: v.text(body.publicKey, "publicKey", 128),
        signature: v.base64Bytes(body.signature, "signature", 128),
        message: v.text(body.message, "message", 200),
        recipient: v.text(body.recipient, "recipient", 64),
        nonce,
      });
      log("auth_verify", { accountId: body.accountId, ok });
      return send(res, 200, { valid: ok });
    }

    default:
      return send(res, 404, { error: "Not found" });
  }
}
