// Bridge configuration from environment variables. NEAR Testnet (or a local
// sandbox rehearsal) only: anything that looks like mainnet is refused.

export interface KeyedAccount {
  accountId: string;
  privateKey: string;
}

export interface BridgeConfig {
  host: string;
  port: number;
  /** Shared secret the Java backend sends as `Authorization: Bearer <token>`. */
  token: string;
  network: "testnet" | "sandbox";
  rpcUrl: string;
  tokenId: string;
  casinoId: string;
  settler: KeyedAccount;
  /** NPC agents by short name ("don", "foxy"). Keys are restricted to `agent_pay`. */
  agents: Record<string, KeyedAccount>;
}

const ACCOUNT_ID = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const PRIVATE_KEY = /^ed25519:[1-9A-HJ-NP-Za-km-z]{32,100}$/;

export class ConfigError extends Error {}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new ConfigError(`Missing ${name}`);
  return value;
}

function account(env: NodeJS.ProcessEnv, name: string): string {
  const value = required(env, name);
  if (!ACCOUNT_ID.test(value) || value.length < 2 || value.length > 64) {
    throw new ConfigError(`${name} is not a valid NEAR account ID`);
  }
  // Sandbox accounts are *.test.near; on testnet a .near account means mainnet.
  if (value.endsWith(".near") && (env.NEAR_NETWORK?.trim() || "testnet") === "testnet") {
    throw new ConfigError(`${name} looks like a mainnet account`);
  }
  return value;
}

function key(env: NodeJS.ProcessEnv, name: string): string {
  const value = required(env, name);
  if (!PRIVATE_KEY.test(value)) throw new ConfigError(`${name} must be an ed25519:... private key`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const network = env.NEAR_NETWORK?.trim() || "testnet";
  if (network !== "testnet" && network !== "sandbox") {
    throw new ConfigError(`Refusing NEAR_NETWORK=${network}: only testnet or sandbox are allowed`);
  }
  const rpcUrl = env.NEAR_RPC_URL?.trim() || "https://test.rpc.fastnear.com";
  if (/mainnet|rpc\.near\.org|\.near\.org\/?$/i.test(rpcUrl) && !/testnet/i.test(rpcUrl)) {
    throw new ConfigError(`Refusing NEAR_RPC_URL=${rpcUrl}: it does not look like a testnet endpoint`);
  }
  const token = required(env, "BRIDGE_TOKEN");
  if (token.length < 32) throw new ConfigError("BRIDGE_TOKEN must be at least 32 characters");

  const agents: Record<string, KeyedAccount> = {};
  for (const name of ["don", "foxy"]) {
    const upper = name.toUpperCase();
    if (!env[`NEAR_AGENT_${upper}_ACCOUNT_ID`]?.trim()) continue;
    agents[name] = {
      accountId: account(env, `NEAR_AGENT_${upper}_ACCOUNT_ID`),
      privateKey: key(env, `NEAR_AGENT_${upper}_PRIVATE_KEY`),
    };
  }

  return {
    host: env.BRIDGE_HOST?.trim() || "127.0.0.1",
    port: Number.parseInt(env.BRIDGE_PORT ?? "8090", 10),
    token,
    network,
    rpcUrl,
    tokenId: account(env, "TRASH_TOKEN_CONTRACT_ID"),
    casinoId: account(env, "TRASH_CASINO_CONTRACT_ID"),
    settler: {
      accountId: account(env, "NEAR_SETTLEMENT_ACCOUNT_ID"),
      privateKey: key(env, "NEAR_SETTLEMENT_PRIVATE_KEY"),
    },
    agents,
  };
}
