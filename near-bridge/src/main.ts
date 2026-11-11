// near-bridge entry point. NEAR Testnet only; TRASH has no real-world value.
import { loadConfig } from "./config.ts";
import { NearChain } from "./chain.ts";
import { createBridgeServer } from "./server.ts";

const config = loadConfig();
const chain = new NearChain(config);
const server = createBridgeServer(chain, {
  token: config.token,
  network: config.network,
  tokenId: config.tokenId,
  casinoId: config.casinoId,
  settlerId: config.settler.accountId,
  agents: Object.fromEntries(Object.entries(config.agents).map(([name, a]) => [name, a.accountId])),
});

server.listen(config.port, config.host, () => {
  console.log(JSON.stringify({
    event: "listening", host: config.host, port: config.port, network: config.network,
    rpcUrl: config.rpcUrl, casinoId: config.casinoId, agents: Object.keys(config.agents),
  }));
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
