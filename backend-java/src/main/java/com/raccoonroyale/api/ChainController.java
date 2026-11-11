package com.raccoonroyale.api;

import com.raccoonroyale.auth.WalletAuthService;
import com.raccoonroyale.chain.ChainGateway;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** Public chain configuration, NEP-413 wallet login, and on-chain balances. NEAR Testnet only. */
@RestController
@RequestMapping("/api")
public class ChainController {
    private final ChainGateway chain;
    private final WalletAuthService wallets;

    public ChainController(ChainGateway chain, WalletAuthService wallets) {
        this.chain = chain;
        this.wallets = wallets;
    }

    public record ChainConfigResponse(boolean enabled, String network, String tokenId, String casinoId,
        String explorerUrl, String buyIn, int decimals, String symbol) {}
    public record AuthVerifyRequest(String accountId, String publicKey, String signature, String nonce) {}
    public record BalanceResponse(String accountId, String wallet, String casino, int decimals, String symbol, String network) {}

    private static ResponseEntity<Object> error(HttpStatus status, String code, String message) {
        return ResponseEntity.status(status).body(Map.of("code", code, "message", message));
    }

    @GetMapping("/chain")
    public ChainConfigResponse config() {
        return new ChainConfigResponse(chain.enabled(), chain.network(), chain.tokenId(), chain.casinoId(),
            chain.explorerUrl(), chain.buyIn().toString(), 24, "TRASH");
    }

    @PostMapping("/auth/nonce")
    public ResponseEntity<Object> nonce() {
        if (!chain.enabled()) return error(HttpStatus.SERVICE_UNAVAILABLE, "CHAIN_DISABLED", "Wallet login is not configured.");
        return ResponseEntity.ok(wallets.challenge());
    }

    @PostMapping("/auth/verify")
    public CompletableFuture<ResponseEntity<Object>> verify(@RequestBody AuthVerifyRequest request) {
        if (!chain.enabled()) {
            return CompletableFuture.completedFuture(error(HttpStatus.SERVICE_UNAVAILABLE, "CHAIN_DISABLED", "Wallet login is not configured."));
        }
        return wallets.verify(request.accountId(), request.publicKey(), request.signature(), request.nonce())
            .thenApply(session -> session.<ResponseEntity<Object>>map(ResponseEntity::ok)
                .orElseGet(() -> error(HttpStatus.UNAUTHORIZED, "INVALID_SIGNATURE",
                    "Signature, nonce, or full-access key check failed. Request a new nonce and sign again.")));
    }

    @GetMapping("/wallet/balance")
    public CompletableFuture<ResponseEntity<Object>> balance(@RequestHeader(value = "Authorization", required = false) String authorization) {
        String token = authorization != null && authorization.startsWith("Bearer ") ? authorization.substring(7) : null;
        var account = wallets.accountFor(token);
        if (account.isEmpty()) {
            return CompletableFuture.completedFuture(error(HttpStatus.UNAUTHORIZED, "INVALID_SESSION", "Connect your wallet again."));
        }
        return chain.balances(account.get())
            .thenApply(b -> ResponseEntity.<Object>ok(new BalanceResponse(account.get(), b.wallet().toString(),
                b.casino().toString(), 24, "TRASH", chain.network())))
            .exceptionally(e -> error(HttpStatus.BAD_GATEWAY, "CHAIN_UNAVAILABLE", "Could not read balances from NEAR Testnet."));
    }
}
