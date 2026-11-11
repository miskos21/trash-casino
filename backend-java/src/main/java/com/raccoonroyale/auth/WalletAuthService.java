package com.raccoonroyale.auth;

import com.raccoonroyale.chain.ChainGateway;
import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * NEP-413 wallet login. The server issues a single-use nonce; the wallet signs
 * {message, recipient, nonce}; near-bridge checks the signature and that the key is
 * a FullAccess key of the claimed account. Only then is a session issued. An
 * account ID sent by the client proves nothing on its own.
 */
@Service
public class WalletAuthService {
    public static final String MESSAGE = "Sign in to Trashnino on NEAR Testnet. TRASH has no real-world value.";
    public static final Pattern ACCOUNT_ID = Pattern.compile("^(([a-z\\d]+[-_])*[a-z\\d]+\\.)*([a-z\\d]+[-_])*[a-z\\d]+$");
    private static final Pattern PUBLIC_KEY = Pattern.compile("^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$");
    private static final Pattern NONCE = Pattern.compile("^[A-Za-z0-9+/]{43}=$");
    private static final long NONCE_TTL = 5 * 60_000, SESSION_TTL = 12 * 3_600_000;
    private static final int MAX_NONCES = 10_000, MAX_SESSIONS = 10_000;

    private final ChainGateway chain;
    private final String recipient;
    private final SecureRandom random = new SecureRandom();
    private final LinkedHashMap<String, Long> nonces = new LinkedHashMap<>();
    private final LinkedHashMap<String, Session> sessions = new LinkedHashMap<>();

    private record Session(String accountId, long expiresAt) {}
    public record Challenge(String message, String recipient, String nonce, long expiresAtEpochMillis) {}
    public record SessionInfo(String accountId, String sessionToken, long expiresAtEpochMillis) {}

    @Autowired
    public WalletAuthService(ChainGateway chain, @Value("${app.chain.auth-recipient:trashnino}") String recipient) {
        this.chain = chain;
        this.recipient = recipient;
    }

    public synchronized Challenge challenge() {
        long now = System.currentTimeMillis();
        nonces.values().removeIf(expiry -> expiry < now);
        while (nonces.size() >= MAX_NONCES) nonces.remove(nonces.keySet().iterator().next());
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String nonce = Base64.getEncoder().encodeToString(bytes);
        nonces.put(nonce, now + NONCE_TTL);
        return new Challenge(MESSAGE, recipient, nonce, now + NONCE_TTL);
    }

    public static boolean validAccountId(String accountId) {
        return accountId != null && accountId.length() >= 2 && accountId.length() <= 64
            && ACCOUNT_ID.matcher(accountId).matches();
    }

    /** Resolves to a session only for a valid, unexpired, unused nonce and a verified signature. */
    public CompletableFuture<Optional<SessionInfo>> verify(String accountId, String publicKey, String signature, String nonce) {
        if (!validAccountId(accountId) || publicKey == null || !PUBLIC_KEY.matcher(publicKey).matches()
            || nonce == null || !NONCE.matcher(nonce).matches() || signature == null || signature.isEmpty() || signature.length() > 200) {
            return CompletableFuture.completedFuture(Optional.empty());
        }
        synchronized (this) {
            Long expiry = nonces.remove(nonce); // Single use, even if verification fails.
            if (expiry == null || expiry < System.currentTimeMillis()) return CompletableFuture.completedFuture(Optional.empty());
        }
        return chain.verifyNep413(accountId, publicKey, signature, MESSAGE, recipient, nonce)
            .exceptionally(e -> false)
            .thenApply(valid -> valid ? Optional.of(createSession(accountId)) : Optional.empty());
    }

    private synchronized SessionInfo createSession(String accountId) {
        long now = System.currentTimeMillis();
        sessions.values().removeIf(s -> s.expiresAt() < now);
        while (sessions.size() >= MAX_SESSIONS) sessions.remove(sessions.keySet().iterator().next());
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        sessions.put(token, new Session(accountId, now + SESSION_TTL));
        return new SessionInfo(accountId, token, now + SESSION_TTL);
    }

    /** The NEAR account proven by a session token, if the session is still valid. */
    public synchronized Optional<String> accountFor(String sessionToken) {
        if (sessionToken == null) return Optional.empty();
        Session session = sessions.get(sessionToken);
        if (session == null || session.expiresAt() < System.currentTimeMillis()) return Optional.empty();
        return Optional.of(session.accountId());
    }
}
