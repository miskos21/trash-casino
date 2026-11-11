package com.raccoonroyale.chain;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigInteger;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** {@link ChainGateway} backed by the near-bridge HTTP service. */
@Component
public class BridgeChainGateway implements ChainGateway {
    private static final Logger log = LoggerFactory.getLogger(BridgeChainGateway.class);
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final ObjectMapper mapper;
    private final String bridgeUrl, bridgeToken, tokenId, casinoId, explorerUrl, network;
    private final BigInteger buyIn;
    private final Map<String, String> agents = new HashMap<>();

    public BridgeChainGateway(ObjectMapper mapper,
        @Value("${app.chain.bridge-url:}") String bridgeUrl,
        @Value("${app.chain.bridge-token:}") String bridgeToken,
        @Value("${app.chain.token-id:}") String tokenId,
        @Value("${app.chain.casino-id:}") String casinoId,
        @Value("${app.chain.explorer-url:https://testnet.nearblocks.io}") String explorerUrl,
        @Value("${app.chain.buy-in-trash:10}") long buyInTrash,
        @Value("${app.chain.agents.don:}") String don,
        @Value("${app.chain.agents.foxy:}") String foxy,
        @Value("${app.chain.network:testnet}") String network) {
        this.mapper = mapper;
        this.network = network.strip();
        if (!this.network.equals("testnet") && !this.network.equals("sandbox")) {
            throw new IllegalArgumentException("app.chain.network must be testnet or sandbox. Mainnet is never allowed.");
        }
        this.bridgeUrl = bridgeUrl.strip().replaceAll("/+$", "");
        this.bridgeToken = bridgeToken.strip();
        this.tokenId = tokenId.strip();
        this.casinoId = casinoId.strip();
        this.explorerUrl = explorerUrl.strip();
        if (buyInTrash < 1 || buyInTrash > 1_000) throw new IllegalArgumentException("app.chain.buy-in-trash must be 1-1000");
        this.buyIn = ONE_TRASH.multiply(BigInteger.valueOf(buyInTrash));
        if (!don.isBlank()) agents.put("don", don.strip());
        if (!foxy.isBlank()) agents.put("foxy", foxy.strip());
        // Sandbox accounts are *.test.near; on testnet a .near account means mainnet.
        if (this.network.equals("testnet") && (casinoId.endsWith(".near") || tokenId.endsWith(".near"))) {
            throw new IllegalArgumentException("Mainnet accounts are not allowed. NEAR Testnet only.");
        }
    }

    @Override public boolean enabled() {
        return !bridgeUrl.isEmpty() && !bridgeToken.isEmpty() && !tokenId.isEmpty() && !casinoId.isEmpty();
    }
    @Override public String network() { return network; }
    @Override public String tokenId() { return tokenId.isEmpty() ? null : tokenId; }
    @Override public String casinoId() { return casinoId.isEmpty() ? null : casinoId; }
    @Override public String explorerUrl() { return explorerUrl; }
    @Override public BigInteger buyIn() { return buyIn; }
    @Override public Optional<String> agentAccount(String agent) { return Optional.ofNullable(agents.get(agent)); }

    private static String path(String segment) { return URLEncoder.encode(segment, StandardCharsets.UTF_8); }

    private CompletableFuture<HttpResponse<String>> send(String method, String path, Object body) {
        if (!enabled()) return CompletableFuture.failedFuture(new ChainDisabledException());
        try {
            var builder = HttpRequest.newBuilder(URI.create(bridgeUrl + path))
                .timeout(Duration.ofSeconds(90))
                .header("Authorization", "Bearer " + bridgeToken)
                .header("Content-Type", "application/json");
            builder = body == null ? builder.method(method, HttpRequest.BodyPublishers.noBody())
                : builder.method(method, HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
            return http.sendAsync(builder.build(), HttpResponse.BodyHandlers.ofString());
        } catch (Exception e) {
            return CompletableFuture.failedFuture(e);
        }
    }

    private CompletableFuture<TxResult> tx(String operation, String path, Object body) {
        return send("POST", path, body).thenApply(res -> {
            TxResult result;
            try {
                JsonNode json = mapper.readTree(res.body());
                if (res.statusCode() == 200 && json.path("ok").asBoolean(false) && json.hasNonNull("txHash")) {
                    result = new TxResult(true, json.get("txHash").asText(), null);
                } else {
                    String hash = json.hasNonNull("txHash") ? json.get("txHash").asText() : null;
                    result = new TxResult(false, hash, json.path("error").asText("Bridge returned HTTP " + res.statusCode()));
                }
            } catch (Exception e) {
                result = TxResult.failed("Unreadable bridge response (HTTP " + res.statusCode() + ")");
            }
            log.info("chain_tx operation={} ok={} txHash={} error={}", operation, result.ok(), result.txHash(), result.error());
            return result;
        }).exceptionally(e -> {
            log.warn("chain_tx operation={} ok=false error={}", operation, e.getMessage());
            return TxResult.failed("Bridge unavailable");
        });
    }

    @Override
    public CompletableFuture<TxResult> createGame(String gameId, BigInteger buyIn, List<String> players, BigInteger houseStake,
        long timeoutSeconds) {
        var body = new LinkedHashMap<String, Object>(Map.of("gameId", gameId, "buyIn", buyIn.toString(),
            "players", players, "timeoutSeconds", timeoutSeconds));
        if (houseStake != null && houseStake.signum() > 0) body.put("houseStake", houseStake.toString());
        return tx("create_game:" + gameId, "/games", body);
    }

    @Override
    public CompletableFuture<Optional<ChainGame>> game(String gameId) {
        return send("GET", "/games/" + path(gameId), null).thenApply(res -> {
            if (res.statusCode() == 404) return Optional.<ChainGame>empty();
            if (res.statusCode() != 200) throw new IllegalStateException("Bridge returned HTTP " + res.statusCode());
            try {
                JsonNode json = mapper.readTree(res.body());
                Map<String, Boolean> deposited = new LinkedHashMap<>();
                for (JsonNode seat : json.path("seats")) deposited.put(seat.path("account_id").asText(), seat.path("deposited").asBoolean());
                return Optional.of(new ChainGame(json.path("state").asText(), deposited));
            } catch (Exception e) {
                throw new IllegalStateException("Unreadable game status", e);
            }
        });
    }

    @Override
    public CompletableFuture<TxResult> settleGame(String gameId, List<Payout> payouts) {
        var body = Map.of("payouts", payouts.stream()
            .map(p -> Map.of("accountId", p.accountId(), "amount", p.amount().toString())).toList());
        return tx("settle_game:" + gameId, "/games/" + path(gameId) + "/settle", body);
    }

    @Override
    public CompletableFuture<TxResult> cancelGame(String gameId) {
        return tx("cancel_game:" + gameId, "/games/" + path(gameId) + "/cancel", Map.of());
    }

    @Override
    public CompletableFuture<Balances> balances(String accountId) {
        return send("GET", "/accounts/" + path(accountId) + "/balances", null).thenApply(res -> {
            if (res.statusCode() != 200) throw new IllegalStateException("Bridge returned HTTP " + res.statusCode());
            try {
                JsonNode json = mapper.readTree(res.body());
                return new Balances(new BigInteger(json.path("wallet").asText()), new BigInteger(json.path("casino").asText()));
            } catch (Exception e) {
                throw new IllegalStateException("Unreadable balances", e);
            }
        });
    }

    @Override
    public CompletableFuture<Boolean> verifyNep413(String accountId, String publicKey, String signatureBase64,
        String message, String recipient, String nonceBase64) {
        var body = Map.of("accountId", accountId, "publicKey", publicKey, "signature", signatureBase64,
            "message", message, "recipient", recipient, "nonce", nonceBase64);
        return send("POST", "/auth/verify", body).thenApply(res -> {
            if (res.statusCode() != 200) return false;
            try {
                return mapper.readTree(res.body()).path("valid").asBoolean(false);
            } catch (Exception e) {
                return false;
            }
        });
    }
}
