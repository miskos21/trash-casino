package com.raccoonroyale.chain;

import java.math.BigInteger;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;

/**
 * Everything the backend does on NEAR Testnet goes through this interface. The
 * implementation talks to near-bridge, which signs with restricted keys and reports
 * only final execution outcomes. TRASH has no real-world value.
 */
public interface ChainGateway {
    BigInteger ONE_TRASH = BigInteger.TEN.pow(24);

    boolean enabled();
    String network();
    String tokenId();
    String casinoId();
    String explorerUrl();
    /** Fixed Liar's Dice buy-in in yoctoTRASH. */
    BigInteger buyIn();
    /** NEAR account of an NPC ("don", "foxy"), if configured. */
    Optional<String> agentAccount(String agent);

    CompletableFuture<TxResult> createGame(String gameId, BigInteger buyIn, List<String> players, long timeoutSeconds);
    /** Empty when the game does not exist on-chain. */
    CompletableFuture<Optional<ChainGame>> game(String gameId);
    CompletableFuture<TxResult> settleGame(String gameId, List<Payout> payouts);
    CompletableFuture<TxResult> cancelGame(String gameId);
    CompletableFuture<Balances> balances(String accountId);
    CompletableFuture<Boolean> verifyNep413(String accountId, String publicKey, String signatureBase64,
        String message, String recipient, String nonceBase64);

    /** Final execution outcome of one transaction. Submission alone is never {@code ok}. */
    record TxResult(boolean ok, String txHash, String error) {
        public static TxResult failed(String error) { return new TxResult(false, null, error); }
    }
    record Payout(String accountId, BigInteger amount) {}
    /** On-chain game state and which seated accounts have paid. */
    record ChainGame(String state, Map<String, Boolean> deposited) {}
    record Balances(BigInteger wallet, BigInteger casino) {}

    class ChainDisabledException extends RuntimeException {
        public ChainDisabledException() { super("Chain features are not configured on this server."); }
    }

    /** A gateway for servers without chain configuration: every operation fails. */
    static ChainGateway disabled() {
        return new ChainGateway() {
            public boolean enabled() { return false; }
            public String network() { return "testnet"; }
            public String tokenId() { return null; }
            public String casinoId() { return null; }
            public String explorerUrl() { return "https://testnet.nearblocks.io"; }
            public BigInteger buyIn() { return ONE_TRASH.multiply(BigInteger.TEN); }
            public Optional<String> agentAccount(String agent) { return Optional.empty(); }
            private <T> CompletableFuture<T> fail() { return CompletableFuture.failedFuture(new ChainDisabledException()); }
            public CompletableFuture<TxResult> createGame(String g, BigInteger b, List<String> p, long t) { return fail(); }
            public CompletableFuture<Optional<ChainGame>> game(String g) { return fail(); }
            public CompletableFuture<TxResult> settleGame(String g, List<Payout> p) { return fail(); }
            public CompletableFuture<TxResult> cancelGame(String g) { return fail(); }
            public CompletableFuture<Balances> balances(String a) { return fail(); }
            public CompletableFuture<Boolean> verifyNep413(String a, String k, String s, String m, String r, String n) { return fail(); }
        };
    }
}
