package com.raccoonroyale.rooms;

import com.fasterxml.jackson.databind.JsonNode;
import com.raccoonroyale.auth.WalletAuthService;
import com.raccoonroyale.chain.ChainGateway;
import com.raccoonroyale.games.BlackjackGame;
import com.raccoonroyale.games.LiarsDiceGame;
import com.raccoonroyale.websocket.Protocol;
import java.io.IOException;
import java.math.BigInteger;
import java.security.SecureRandom;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

/**
 * Bounded in-memory rooms. A guest session never proves wallet ownership: paid
 * Liar's Dice rooms require a NEP-413 wallet session for every human seat, and every
 * money movement goes through the casino contract with a confirmed final outcome.
 */
@Service
public class RoomService {
    private static final Logger log = LoggerFactory.getLogger(RoomService.class);
    /** On-chain game deadline: after it, any player can claim a refund if the server vanished. */
    static final long CHAIN_GAME_TIMEOUT_SECONDS = 2 * 3600;
    private final Protocol protocol;
    private final ChainGateway chain;
    private final WalletAuthService wallets;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Peer> peers = new HashMap<>();
    private final Map<String, Room> rooms = new LinkedHashMap<>();
    private final long turnMillis, npcMillis, revealMillis, fundingMillis, pollMillis;
    @Autowired
    public RoomService(Protocol protocol, ChainGateway chain, WalletAuthService wallets,
        @Value("$" + "{app.game.turn-timeout-ms:30000}") long turnMillis,
        @Value("$" + "{app.game.npc-delay-ms:1100}") long npcMillis,
        @Value("$" + "{app.game.reveal-ms:4000}") long revealMillis,
        @Value("$" + "{app.chain.funding-timeout-ms:180000}") long fundingMillis,
        @Value("$" + "{app.chain.poll-ms:2500}") long pollMillis) {
        this.protocol = protocol; this.chain = chain; this.wallets = wallets;
        this.turnMillis = turnMillis; this.npcMillis = npcMillis; this.revealMillis = revealMillis;
        this.fundingMillis = fundingMillis; this.pollMillis = pollMillis;
    }
    /** Free-play only (chain disabled). Used by tests. */
    public RoomService(Protocol protocol, long turnMillis, long npcMillis, long revealMillis) {
        this(protocol, ChainGateway.disabled(), new WalletAuthService(ChainGateway.disabled(), "trashnino"),
            turnMillis, npcMillis, revealMillis, 180_000, 2_500);
    }
    private static class Peer {
        final WebSocketSession socket;
        final Map<String,String> requests = new LinkedHashMap<>();
        String roomId, playerId;
        long rateStart;
        int count;
        long lastSeen=System.currentTimeMillis();
        Peer(WebSocketSession socket) { this.socket = socket; }
    }
    private static class Seat {
        final String id, name, avatar, token;
        final boolean npc;
        /** Verified NEAR account (paid rooms only): a NEP-413 session or a configured NPC account. */
        String accountId;
        boolean ready, abandoned;
        WebSocketSession socket;
        long disconnectedAt;
        Seat(String id, String name, String avatar, String token, boolean npc, WebSocketSession socket) {
            this.id=id; this.name=name; this.avatar=avatar; this.token=token;
            this.npc=npc; this.socket=socket; this.ready=npc;
        }
    }
    /** Paid-room state. Changes only after confirmed final execution outcomes. */
    private static class Economy {
        String gameId, funding="NOT_STARTED", settlement="NOT_STARTED", txHash, message;
        long deadline, nextPoll;
        boolean inFlight, cancelSent;
        BigInteger pot=BigInteger.ZERO;
        final Set<String> paid=new LinkedHashSet<>();
        List<RoomPayout> payouts=List.of();
        boolean active() { return funding.equals("CREATING")||funding.equals("AWAITING_PAYMENTS")||funding.equals("CANCELLING"); }
    }
    private static class Room {
        final String id=UUID.randomUUID().toString(), code, gameType;
        final List<Seat> seats=new ArrayList<>();
        final List<PublicGameEvent> history=new ArrayList<>();
        String hostId, matchId;
        LiarsDiceGame game;
        BlackjackGame blackjack;
        Economy economy; // null for free rooms
        Map<String,Seat> dealt=Map.of(); // Hands outlive seats that leave after the hand ends.
        LiarsDiceGame.RoundResult reveal;
        long revision, deadline, npcAt, resumeAt, lastActivity, eventSequence;
        Room(String code,String gameType) { this.code=code; this.gameType=gameType; this.lastActivity=System.currentTimeMillis(); }
        LiarsDiceGame.PublicState state() { return game.viewFor(seats.getFirst().id).publicState(); }
        String phase() {
            if(blackjack!=null) return blackjack.publicState().shoeOver() ? "FINISHED" : "IN_PROGRESS";
            if(economy!=null&&economy.active()) return "FUNDING";
            return game==null ? "LOBBY" : state().winnerId()==null ? "IN_PROGRESS" : "FINISHED";
        }
    }
    public record RoomSeat(String playerId,String displayName,String avatar,boolean npc,boolean ready,boolean connected,String presence,String accountId) {}
    public record RoomPayout(String playerId,String accountId,String amount) {}
    public record RoomEconomy(String mode,String buyIn,String casinoId,String gameId,String funding,long fundingDeadlineEpochMillis,
        List<String> paidPlayerIds,String settlement,String settlementTxHash,List<RoomPayout> payouts,String message) {}
    public record RoomState(String roomId,String roomCode,String game,String phase,String hostId,String youId,List<RoomSeat> participants,RoomEconomy economy) {}
    public record Participant(String playerId,String displayName,String avatar,boolean npc,int diceCount) {}
    public record PublicGameEvent(String id,int round,String type,String actorId,LiarsDiceGame.Bid bid,
        String loserId,Integer actualCount,String cause) {}
    public record PublicState(String matchId,String phase,int round,List<Participant> participants,
        String currentPlayerId,LiarsDiceGame.Bid lastBid,String lastBidderId,String winnerId,
        long revision,long deadlineEpochMillis,long resumeAtEpochMillis,List<PublicGameEvent> history) {}
    public record PlayerState(PublicState publicState,List<Integer> ownDice) {}
    public record BlackjackHand(String playerId,String displayName,String avatar,boolean npc,List<BlackjackGame.Card> cards,int total,
        BlackjackGame.Status status,BlackjackGame.Outcome outcome,BlackjackGame.Tally tally) {}
    public record BlackjackDealer(List<BlackjackGame.Card> cards,int hiddenCards,int total) {}
    public record BlackjackShoe(int decks,int size,int burned,int handStart,String commitment,BlackjackGame.ShoeReveal reveal) {}
    public record BlackjackState(String matchId,String phase,int hand,String handPhase,int cardsRemaining,long nextHandAtEpochMillis,
        List<BlackjackHand> players,BlackjackDealer dealer,String currentPlayerId,long revision,long deadlineEpochMillis,BlackjackShoe shoe) {}
    private static class Rejected extends RuntimeException {
        final String code;
        Rejected(String code,String text) { super(text);this.code=code; }
    }
    private static void require(boolean condition,String code,String text) {
        if(!condition) throw new Rejected(code,text);
    }
    public synchronized void connected(WebSocketSession socket) throws IOException {
        if(peers.size()>=512) {socket.close(CloseStatus.POLICY_VIOLATION);return;}
        peers.put(socket.getId(),new Peer(socket));
        send(socket,"CONNECTED",null,Map.of("service","raccoon-royale-backend"));
    }
    public synchronized void disconnected(WebSocketSession socket) {
        Peer peer=peers.remove(socket.getId());
        if(peer==null || peer.roomId==null) return;
        Room room=rooms.get(peer.roomId);
        if(room==null) return;
        Seat seat=seat(room,peer.playerId);
        if(seat.socket!=socket) return; // An old connection cannot detach a replacement.
        seat.socket=null; seat.disconnectedAt=System.currentTimeMillis();
        publish(room);
    }
    public synchronized void handle(WebSocketSession socket,JsonNode message) {
        Peer peer=peers.get(socket.getId());
        if(peer==null) return;
        JsonNode requestId=message.get("requestId");
        String type=message.path("type").asText();
        try {
            long now=System.currentTimeMillis();
            peer.lastSeen=now;
            if(now-peer.rateStart>10_000) {peer.count=0;peer.rateStart=now;}
            require(++peer.count<=120,"RATE_LIMITED","Too many commands. Try again shortly.");
            if(type.equals("PING")) {send(socket,"PONG",requestId,Map.of());return;}
            require(requestId!=null && requestId.isTextual(),"INVALID_MESSAGE","Commands require a request ID.");
            String key=requestId.asText(), previous=peer.requests.get(key);
            if(previous!=null) {
                require(previous.equals(message.toString()),"INVALID_MESSAGE","Request ID was already used.");
                if(type.equals("ROOM_LEAVE")) send(socket,"ROOM_LEFT",requestId,Map.of("roomId",message.path("payload").path("roomId").asText()));
                if(peer.roomId!=null && rooms.containsKey(peer.roomId)) snapshot(rooms.get(peer.roomId),seat(rooms.get(peer.roomId),peer.playerId));
                return;
            }
            JsonNode payload=message.get("payload");
            switch(type) {
                case "ROOM_CREATE" -> create(peer,payload);
                case "ROOM_JOIN" -> join(peer,payload);
                case "PLAYER_RECONNECT" -> reconnect(peer,payload);
                case "ROOM_LEAVE" -> {
                    leave(peer,payload);
                    send(socket,"ROOM_LEFT",requestId,Map.of("roomId",payload.path("roomId").asText()));
                }
                case "ROOM_READY" -> ready(peer,payload);
                case "ROOM_START" -> start(peer,payload);
                case "PLAYER_BID","CALL_BLUFF" -> action(peer,type,payload);
                case "BLACKJACK_HIT","BLACKJACK_STAND" -> blackjackAction(peer,type,payload);
                default -> throw new Rejected("NOT_IMPLEMENTED","This feature is not connected yet.");
            }
            peer.requests.put(key,message.toString());
            if(peer.requests.size()>256) peer.requests.remove(peer.requests.keySet().iterator().next());
        } catch(Rejected rejection) {error(socket,requestId,rejection.code,rejection.getMessage());}
        catch(IllegalArgumentException|IllegalStateException invalid) {error(socket,requestId,"ILLEGAL_ACTION",invalid.getMessage());}
    }
    private String token() {
        byte[] bytes=new byte[32]; random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
    private void create(Peer peer,JsonNode payload) {
        require(peer.roomId==null,"ALREADY_IN_ROOM","Leave your current room first.");
        require(rooms.size()<200,"ROOM_FULL","No room capacity. Try again later.");
        String code;
        do {
            StringBuilder value=new StringBuilder();
            String alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            for(int i=0;i<6;i++) value.append(alphabet.charAt(random.nextInt(alphabet.length())));
            code=value.toString();
        } while(findCode(code)!=null);
        Room room=new Room(code,payload.has("game") ? payload.get("game").asText() : "LIARS_DICE");
        boolean paid=payload.path("paid").asBoolean(false);
        int agents=payload.has("agents") ? payload.get("agents").asInt() : 1;
        Seat human=human(payload,peer.socket);
        Seat don=agents>=1?new Seat("don-"+UUID.randomUUID(),"Don Raccoone","RACCOON",null,true,null):null;
        Seat foxy=agents>=2?new Seat("foxy-"+UUID.randomUUID(),"Foxy","FOX",null,true,null):null;
        if(paid) {
            require(chain.enabled(),"CHAIN_DISABLED","Paid rooms are not configured on this server. Play free instead.");
            require(room.gameType.equals("LIARS_DICE"),"INVALID_MESSAGE","Paid rooms are Liar’s Dice only.");
            human.accountId=walletAccount(payload);
            if(don!=null) don.accountId=chain.agentAccount("don").orElseThrow(()->new Rejected("CHAIN_DISABLED","Don has no NEAR account on this server."));
            if(foxy!=null) foxy.accountId=chain.agentAccount("foxy").orElseThrow(()->new Rejected("CHAIN_DISABLED","Foxy has no NEAR account on this server."));
            room.economy=new Economy();
        }
        room.hostId=human.id;room.seats.add(human);
        if(don!=null) room.seats.add(don);
        if(foxy!=null) room.seats.add(foxy);
        rooms.put(room.id,room);attach(peer,room,human);publish(room);
    }
    private Seat human(JsonNode payload,WebSocketSession socket) {
        String name=payload.path("displayName").asText().strip();
        require(!name.isBlank(),"INVALID_MESSAGE","Enter a player name.");
        return new Seat(UUID.randomUUID().toString(),name,payload.path("avatar").asText(),token(),false,socket);
    }
    /** The NEAR account proven by the payload's NEP-413 session. A bare account ID proves nothing. */
    private String walletAccount(JsonNode payload) {
        return wallets.accountFor(payload.path("sessionToken").asText(null))
            .orElseThrow(()->new Rejected("WALLET_REQUIRED","Connect and verify your NEAR wallet to play for TRASH."));
    }
    private Room findCode(String code) {return rooms.values().stream().filter(r->r.code.equals(code)).findFirst().orElse(null);}
    private void join(Peer peer,JsonNode payload) {
        require(peer.roomId==null,"ALREADY_IN_ROOM","Leave your current room first.");
        Room room=findCode(payload.path("roomCode").asText());
        require(room!=null,"ROOM_NOT_FOUND","Room code not found.");
        require(room.matchId==null&&room.phase().equals("LOBBY"),"ROOM_STARTED","This room has already started.");
        require(room.seats.size()<4,"ROOM_FULL","Table is full (four seats including agents).");
        Seat human=human(payload,peer.socket);
        if(room.economy!=null) {
            human.accountId=walletAccount(payload);
            require(room.seats.stream().noneMatch(s->human.accountId.equals(s.accountId)),"ALREADY_IN_ROOM","This wallet already has a seat at this table.");
        }
        room.seats.add((int)room.seats.stream().filter(s->!s.npc).count(),human); // Humans sit before agents.
        attach(peer,room,human);publish(room);
    }
    private void attach(Peer peer,Room room,Seat seat) {
        peer.roomId=room.id;peer.playerId=seat.id;seat.socket=peer.socket;seat.disconnectedAt=0;
        room.lastActivity=System.currentTimeMillis();
        send(peer.socket,"ROOM_SESSION",null,Map.of("roomId",room.id,"roomCode",room.code,"playerId",seat.id,"resumeToken",seat.token));
    }
    private void reconnect(Peer peer,JsonNode payload) {
        require(peer.roomId==null,"ALREADY_IN_ROOM","Already in a room.");
        Room room=rooms.get(payload.path("roomId").asText());
        require(room!=null,"INVALID_SESSION","Room expired. Create or join another room.");
        String supplied=payload.path("resumeToken").asText();
        Seat found=room.seats.stream().filter(s->!s.npc&&!s.abandoned&&supplied.equals(s.token)).findFirst().orElse(null);
        require(found!=null,"INVALID_SESSION","Cannot resume this guest session.");
        WebSocketSession old=found.socket;
        attach(peer,room,found);
        if(old!=null&&old!=peer.socket) {
            Peer previous=peers.get(old.getId());
            if(previous!=null) {previous.roomId=null;previous.playerId=null;}
            try {old.close(CloseStatus.POLICY_VIOLATION);}catch(IOException ignored) {}
        }
        publish(room);
        if(room.reveal!=null) sendReveal(room,found.socket);
        if(room.game!=null&&room.state().winnerId()!=null) result(room,found.socket);
    }
    private Room room(Peer peer) {
        Room room=rooms.get(peer.roomId);
        require(room!=null,"INVALID_SESSION","Join a room first.");return room;
    }
    private Seat seat(Room room,String id) {
        return room.seats.stream().filter(s->s.id.equals(id)).findFirst().orElseThrow(()->new Rejected("INVALID_SESSION","Unknown seat."));
    }
    private void assertRoom(Room room,JsonNode payload) {
        require(room.id.equals(payload.path("roomId").asText()),"INVALID_SESSION","You do not belong to this room.");
    }
    private void ready(Peer peer,JsonNode payload) {
        Room room=room(peer);assertRoom(room,payload);
        require(!room.phase().equals("IN_PROGRESS")&&!room.phase().equals("FUNDING"),"ROOM_STARTED","Match already started.");
        seat(room,peer.playerId).ready=payload.path("ready").asBoolean();
        room.lastActivity=System.currentTimeMillis();publish(room);
    }
    private void start(Peer peer,JsonNode payload) {
        Room room=room(peer);assertRoom(room,payload);
        require(peer.playerId.equals(room.hostId),"NOT_HOST","Only the host can start.");
        require(!room.phase().equals("IN_PROGRESS")&&!room.phase().equals("FUNDING"),"ROOM_STARTED","Match already started.");
        room.seats.removeIf(s->s.abandoned);
        require(room.seats.stream().filter(s->!s.npc).allMatch(s->s.ready&&s.socket!=null&&s.socket.isOpen()),
            "NOT_READY","All human players must be connected and ready.");
        require(room.gameType.equals("BLACKJACK")||room.seats.size()>=2,"NOT_READY",
            "Liar’s Dice needs at least two players. Add an agent or invite a friend.");
        if(room.economy!=null) beginFunding(room);
        else beginMatch(room);
    }
    /**
     * Paid rooms: open the game on-chain first. Agents are seated with house money by
     * the contract; every human pays the buy-in with their own wallet (join_game).
     * The match starts only after the chain shows every seat paid.
     */
    private void beginFunding(Room room) {
        var e=room.economy;
        e.gameId="ld-"+UUID.randomUUID();
        e.funding="CREATING";e.settlement="NOT_STARTED";e.txHash=null;e.message=null;e.payouts=List.of();
        e.paid.clear();e.inFlight=true;e.cancelSent=false;
        e.deadline=System.currentTimeMillis()+fundingMillis;
        e.pot=chain.buyIn().multiply(BigInteger.valueOf(room.seats.size()));
        room.lastActivity=System.currentTimeMillis();
        List<String> accounts=room.seats.stream().map(s->s.accountId).toList();
        String roomId=room.id, gameId=e.gameId;
        log.info("paid_room_funding room={} game={} players={}",room.code,gameId,accounts);
        chain.createGame(gameId,chain.buyIn(),accounts,CHAIN_GAME_TIMEOUT_SECONDS)
            .whenComplete((result,error)->onGameCreated(roomId,gameId,result,error));
        publish(room);
    }
    private Economy currentEconomy(String roomId,String gameId) {
        Room room=rooms.get(roomId);
        return room==null||room.economy==null||!gameId.equals(room.economy.gameId) ? null : room.economy;
    }
    synchronized void onGameCreated(String roomId,String gameId,ChainGateway.TxResult result,Throwable error) {
        boolean ok=error==null&&result!=null&&result.ok();
        Economy e=currentEconomy(roomId,gameId);
        if(e==null) { // The room vanished while the transaction ran: refund everyone.
            if(ok) chain.cancelGame(gameId);
            return;
        }
        e.inFlight=false;
        Room room=rooms.get(roomId);
        if(!ok) {
            e.funding="FAILED";
            e.message="Could not open the game on NEAR Testnet: "+(error!=null?"bridge unavailable":result.error());
            room.seats.forEach(s->s.ready=s.npc);
        } else if(e.funding.equals("CREATING")) {
            e.funding="AWAITING_PAYMENTS";e.nextPoll=0;
        } // CANCELLING: tick() sends the cancellation now that the game exists.
        publish(room);
    }
    synchronized void onGameStatus(String roomId,String gameId,Optional<ChainGateway.ChainGame> game,Throwable error) {
        Economy e=currentEconomy(roomId,gameId);
        if(e==null) return;
        e.inFlight=false;
        if(!e.funding.equals("AWAITING_PAYMENTS")) return;
        e.nextPoll=System.currentTimeMillis()+pollMillis;
        if(error!=null||game.isEmpty()) return; // Transient: poll again.
        Room room=rooms.get(roomId);
        if(!game.get().state().equals("OPEN")) {
            e.funding="FAILED";e.message="The on-chain game is "+game.get().state()+".";
            room.seats.forEach(s->s.ready=s.npc);publish(room);return;
        }
        int before=e.paid.size();
        for(Seat s:room.seats) if(Boolean.TRUE.equals(game.get().deposited().get(s.accountId))) e.paid.add(s.id);
        if(room.seats.stream().allMatch(s->e.paid.contains(s.id))) {
            e.funding="FUNDED";
            log.info("paid_room_funded room={} game={}",room.code,gameId);
            beginMatch(room);
        } else if(e.paid.size()!=before) publish(room);
    }
    synchronized void onGameCancelled(String roomId,String gameId,ChainGateway.TxResult result,Throwable error) {
        Economy e=currentEconomy(roomId,gameId);
        if(e==null) return;
        e.inFlight=false;
        Room room=rooms.get(roomId);
        if(error==null&&result!=null&&result.ok()) {
            e.funding="CANCELLED";
        } else {
            e.funding="FAILED";
            e.message=(e.message==null?"":e.message+" ")+"Cancelling failed; after the on-chain deadline any player can call claim_refund.";
        }
        room.seats.forEach(s->s.ready=s.npc);
        publish(room);
    }
    /** Starts cancelling an unfunded paid game. tick() sends the transaction. */
    private void cancelFunding(Room room,String reason) {
        var e=room.economy;
        if(e==null||!e.active()||e.funding.equals("CANCELLING")) return;
        e.funding="CANCELLING";e.message=reason;
    }
    private void settleIfPaid(Room room) {
        var e=room.economy;
        if(e==null||!e.funding.equals("FUNDED")||!e.settlement.equals("NOT_STARTED")) return;
        Seat winner=seat(room,room.state().winnerId());
        e.payouts=List.of(new RoomPayout(winner.id,winner.accountId,e.pot.toString()));
        e.settlement="PENDING";
        String roomId=room.id, gameId=e.gameId;
        log.info("paid_room_settle room={} game={} winner={} pot={}",room.code,gameId,winner.accountId,e.pot);
        chain.settleGame(gameId,List.of(new ChainGateway.Payout(winner.accountId,e.pot)))
            .whenComplete((result,error)->onSettled(roomId,gameId,result,error));
    }
    synchronized void onSettled(String roomId,String gameId,ChainGateway.TxResult result,Throwable error) {
        Economy e=currentEconomy(roomId,gameId);
        if(e==null) return;
        Room room=rooms.get(roomId);
        if(error==null&&result!=null&&result.ok()) {
            e.settlement="CONFIRMED";e.txHash=result.txHash();e.message=null;
        } else {
            e.settlement="FAILED";
            e.txHash=result!=null?result.txHash():null;
            e.message="Settlement failed. After the on-chain deadline any player can call claim_refund to recover the buy-ins.";
        }
        publish(room);
        for(Seat s:room.seats) if(s.socket!=null&&room.game!=null&&room.state().winnerId()!=null) result(room,s.socket);
    }
    /** A paid room disappears: refund an open or unsettled on-chain game. */
    private void releaseChainGame(Room room) {
        var e=room.economy;
        if(e==null||e.gameId==null) return;
        // CREATING is handled by onGameCreated once the transaction finishes.
        boolean unsettled=e.funding.equals("AWAITING_PAYMENTS") || e.funding.equals("CANCELLING")&&!e.cancelSent
            || e.funding.equals("FUNDED")&&e.settlement.equals("NOT_STARTED");
        if(!unsettled) return;
        log.info("paid_room_released room={} game={}",room.code,e.gameId);
        chain.cancelGame(e.gameId);
    }
    private void beginMatch(Room room) {
        room.matchId=UUID.randomUUID().toString();
        room.reveal=null;room.revision=0;room.resumeAt=0;room.eventSequence=0;room.history.clear();
        if(room.gameType.equals("BLACKJACK")) {
            // The house deals without a seat; humans and agents each hold a hand.
            room.dealt=new LinkedHashMap<>();room.seats.forEach(s->room.dealt.put(s.id,s));
            room.blackjack=new BlackjackGame(room.seats.stream().map(s->s.id).toList());
            afterBlackjackMove(room);
        } else {
            room.game=new LiarsDiceGame(room.seats.stream().map(s->s.id).toList());
            event(room,"ROUND_START",room.state().round(),room.state().currentPlayerId(),null,null,null,null);
            scheduleTurn(room);
        }
        for(Seat s:room.seats) if(s.socket!=null) send(s.socket,"GAME_START",null,Map.of("matchId",room.matchId));
        publish(room);
    }
    private void action(Peer peer,String type,JsonNode payload) {
        Room room=room(peer);
        require(room.game!=null&&room.phase().equals("IN_PROGRESS"),"ILLEGAL_ACTION","No active match.");
        require(room.matchId.equals(payload.path("matchId").asText()),"STALE_STATE","Wrong match.");
        require(room.revision==payload.path("expectedRevision").asLong(),"STALE_STATE","The turn has changed. Use the latest state.");
        require(System.currentTimeMillis()>=room.resumeAt,"ILLEGAL_ACTION","Wait for the dice reveal to finish.");
        LiarsDiceGame.Action action=type.equals("CALL_BLUFF")?new LiarsDiceGame.CallBluff():
            new LiarsDiceGame.Bid(payload.path("bid").path("quantity").asInt(),payload.path("bid").path("face").asInt());
        apply(room,peer.playerId,action,"PLAYER");
    }
    private void blackjackAction(Peer peer,String type,JsonNode payload) {
        Room room=room(peer);
        require(room.blackjack!=null&&!room.blackjack.publicState().handOver(),"ILLEGAL_ACTION","No active hand.");
        require(room.matchId.equals(payload.path("matchId").asText()),"STALE_STATE","Wrong match.");
        require(room.revision==payload.path("expectedRevision").asLong(),"STALE_STATE","The turn has changed. Use the latest state.");
        room.blackjack.apply(peer.playerId,type.equals("BLACKJACK_HIT")?BlackjackGame.Action.HIT:BlackjackGame.Action.STAND);
        room.revision++;room.lastActivity=System.currentTimeMillis();
        afterBlackjackMove(room);publish(room);
    }
    private void afterBlackjackMove(Room room) {
        var state=room.blackjack.publicState();
        if(state.shoeOver()) {room.deadline=0;room.resumeAt=0;room.seats.forEach(s->s.ready=s.npc);}
        else if(state.handOver()) {room.deadline=0;room.resumeAt=System.currentTimeMillis()+revealMillis;} // Show the result first.
        else scheduleTurn(room);
    }
    private void event(Room room,String type,int round,String actor,LiarsDiceGame.Bid bid,String loser,Integer count,String cause) {
        room.history.add(new PublicGameEvent(room.matchId+"-"+(++room.eventSequence),round,type,actor,bid,loser,count,cause));
        if(room.history.size()>60) room.history.removeFirst();
    }
    private void apply(Room room,String actor,LiarsDiceGame.Action action,String cause) {
        var before=room.state();
        var reveal=room.game.apply(actor,action);
        room.revision++;room.lastActivity=System.currentTimeMillis();
        event(room,action instanceof LiarsDiceGame.Bid?"BID":"CALL_BLUFF",before.round(),actor,
            action instanceof LiarsDiceGame.Bid bid?bid:before.lastBid(),null,null,cause);
        if(reveal!=null) {
            room.reveal=reveal;room.resumeAt=System.currentTimeMillis()+revealMillis;
            event(room,"ROUND_RESULT",reveal.round(),actor,reveal.bid(),reveal.loserId(),reveal.actualCount(),cause);
            for(Seat s:room.seats) if(s.socket!=null) sendReveal(room,s.socket);
        }
        if(room.state().winnerId()!=null) {
            room.deadline=0;room.seats.forEach(s->s.ready=s.npc);
            event(room,"GAME_OVER",before.round(),room.state().winnerId(),null,null,null,null);
            settleIfPaid(room);
            for(Seat s:room.seats) if(s.socket!=null) result(room,s.socket);
        } else {
            if(reveal!=null) event(room,"ROUND_START",room.state().round(),room.state().currentPlayerId(),null,null,null,null);
            scheduleTurn(room);
        }
        publish(room);
    }
    private void scheduleTurn(Room room) {
        long base=Math.max(System.currentTimeMillis(),room.resumeAt);
        room.deadline=base+turnMillis;room.npcAt=base+npcMillis;
    }
    private void leave(Peer peer,JsonNode payload) {
        Room room=room(peer);assertRoom(room,payload);
        Seat seat=seat(room,peer.playerId);
        seat.socket=null;seat.ready=false;
        if(room.phase().equals("FUNDING")) cancelFunding(room,seat.name+" left before the match started. Buy-ins go back to casino balances.");
        boolean inProgress=room.phase().equals("IN_PROGRESS")||room.phase().equals("FUNDING");
        abandon(room,seat);
        peer.roomId=null;peer.playerId=null;
        if(!inProgress) room.seats.remove(seat);
        if(seat.id.equals(room.hostId)) room.hostId=room.seats.stream().filter(s->!s.npc&&!s.abandoned).map(s->s.id).findFirst().orElse(seat.id);
        if(room.seats.stream().noneMatch(s->!s.npc&&!s.abandoned)) rooms.remove(room.id);else publish(room);
    }
    private void abandon(Room room,Seat seat) {
        if(seat.abandoned) return;
        seat.abandoned=true;seat.ready=false;
        if(!room.phase().equals("IN_PROGRESS")) return;
        room.revision++;
        if(room.blackjack!=null) {
            var before=room.blackjack.publicState();
            room.blackjack.leave(seat.id);
            var after=room.blackjack.publicState();
            if(!Objects.equals(before.currentPlayerId(),after.currentPlayerId()) || before.handOver()!=after.handOver()) afterBlackjackMove(room);
        } else {
            boolean active=room.state().diceCounts().get(seat.id)>0;
            room.game.forfeit(seat.id);
            event(room,"PLAYER_LEFT",room.state().round(),seat.id,null,null,null,null);
            if(!active) return;
            room.reveal=null;room.resumeAt=0;
            if(room.state().winnerId()!=null) {
                room.deadline=0;room.seats.forEach(s->s.ready=s.npc);
                event(room,"GAME_OVER",room.state().round(),room.state().winnerId(),null,null,null,null);
                settleIfPaid(room);
                for(Seat s:room.seats) if(s.socket!=null) result(room,s.socket);
            } else {
                event(room,"ROUND_START",room.state().round(),room.state().currentPlayerId(),null,null,null,null);
                scheduleTurn(room);
            }
        }
    }
    private void snapshot(Room room,Seat recipient) {
        if(recipient.socket==null||!recipient.socket.isOpen()) return;
        var seats=room.seats.stream().map(s->{
            boolean connected=s.npc||s.socket!=null&&s.socket.isOpen();
            return new RoomSeat(s.id,s.name,s.avatar,s.npc,s.ready,connected,s.abandoned?"LEFT":connected?"ONLINE":"DISCONNECTED",s.accountId);
        }).toList();
        RoomEconomy economy=null;
        if(room.economy!=null) {
            var e=room.economy;
            economy=new RoomEconomy("PAID",chain.buyIn().toString(),chain.casinoId(),e.gameId,e.funding,e.deadline,
                List.copyOf(e.paid),e.settlement,e.txHash,e.payouts,e.message);
        }
        send(recipient.socket,"ROOM_STATE",null,new RoomState(room.id,room.code,room.gameType,room.phase(),room.hostId,recipient.id,seats,economy));
        if(room.blackjack!=null) {
            var state=room.blackjack.publicState();
            var hands=state.players().stream().map(h->{Seat s=room.dealt.get(h.playerId());
                return new BlackjackHand(h.playerId(),s.name,s.avatar,s.npc,h.cards(),h.total(),h.status(),h.outcome(),h.tally());}).toList();
            send(recipient.socket,"BLACKJACK_STATE",null,new BlackjackState(room.matchId,room.phase(),state.handNumber(),
                state.handNumber()==0?"SHUFFLING":state.handOver()?"RESULT":"PLAYING",state.cardsRemaining(),
                state.handOver()&&!state.shoeOver()?room.resumeAt:0,hands,
                new BlackjackDealer(state.dealerCards(),state.hiddenCards(),state.dealerTotal()),
                state.currentPlayerId(),room.revision,room.deadline,new BlackjackShoe(BlackjackGame.DECKS,state.shoeSize(),
                    state.burned(),state.handStart(),state.commitment(),state.shoeOver()?room.blackjack.reveal():null)));
            return;
        }
        if(room.game==null) return;
        var view=room.game.viewFor(recipient.id);var state=view.publicState();
        var participants=room.seats.stream().map(s->new Participant(s.id,s.name,s.avatar,s.npc,state.diceCounts().get(s.id))).toList();
        send(recipient.socket,"GAME_STATE",null,new PlayerState(new PublicState(room.matchId,room.phase(),state.round(),participants,
            state.currentPlayerId(),state.lastBid(),state.lastBidderId(),state.winnerId(),room.revision,room.deadline,room.resumeAt,
            List.copyOf(room.history)),view.ownDice()));
    }
    private void publish(Room room) {for(Seat s:room.seats) if(!s.npc) snapshot(room,s);}
    private void sendReveal(Room room,WebSocketSession socket) {
        var r=room.reveal;
        var dice=r.revealedDice().entrySet().stream().map(e->Map.<String,Object>of("playerId",e.getKey(),"dice",e.getValue())).toList();
        send(socket,"DICE_REVEAL",null,Map.of("matchId",room.matchId,"round",r.round(),"dice",dice,"loserId",r.loserId(),
            "bidderId",r.bidderId(),"callerId",r.callerId(),"bid",r.bid(),"actualCount",r.actualCount()));
    }
    private void result(Room room,WebSocketSession socket) {
        String settlement=room.economy==null?"NOT_STARTED":room.economy.settlement;
        send(socket,"GAME_RESULT",null,Map.of("matchId",room.matchId,"winnerId",room.state().winnerId(),"settlement",settlement));
    }
    /** Humans, deterministic NPCs, and timeouts all use the same validated engine actions. */
    @Scheduled(fixedDelay=200)
    public synchronized void tick() {
        long now=System.currentTimeMillis();
        expireConnections(now);
        var iterator=rooms.values().iterator();
        while(iterator.hasNext()) {
            Room room=iterator.next();
            if(now-room.lastActivity>3_600_000||room.seats.stream().noneMatch(s->!s.npc&&!s.abandoned
                &&(s.socket!=null||now-s.disconnectedAt<120_000))) {releaseChainGame(room);iterator.remove();continue;}
            if(room.economy!=null) fundingTick(room,now);
            boolean changed=false;
            for(Seat s:room.seats) if(!s.npc&&!s.abandoned&&s.socket==null&&now-s.disconnectedAt>=120_000) {
                abandon(room,s);changed=true;
            }
            if(!room.phase().equals("IN_PROGRESS")) changed|=room.seats.removeIf(s->s.abandoned);
            if(changed) {
                if(room.seats.stream().noneMatch(s->s.id.equals(room.hostId)&&!s.abandoned))
                    room.hostId=room.seats.stream().filter(s->!s.npc&&!s.abandoned).map(s->s.id).findFirst().orElse(room.hostId);
                publish(room);
            }
            if(!room.phase().equals("IN_PROGRESS")) continue;
            if(room.blackjack!=null) {
                if(room.blackjack.publicState().handOver()) {
                    if(now>=room.resumeAt) {room.blackjack.nextHand();room.revision++;afterBlackjackMove(room);publish(room);}
                    continue;
                }
                String actor=room.blackjack.publicState().currentPlayerId();Seat seat=seat(room,actor);
                if((seat.npc||seat.abandoned)?now>=room.npcAt:now>=room.deadline) {
                    room.blackjack.apply(actor,seat.npc?room.blackjack.npcMoveFor(actor):room.blackjack.fallbackFor(actor));
                    room.revision++;afterBlackjackMove(room);publish(room);
                }
                continue;
            }
            String actor=room.state().currentPlayerId();Seat seat=seat(room,actor);
            if((seat.npc||seat.abandoned)?now>=room.npcAt:now>=room.deadline)
                apply(room,actor,room.game.fallbackFor(actor),seat.npc?"NPC":seat.abandoned?"UNAVAILABLE":"TIMEOUT");
        }
    }
    /** Drives paid-room funding: one chain request at a time per room. */
    private void fundingTick(Room room,long now) {
        var e=room.economy;
        if(e.inFlight) return;
        String roomId=room.id, gameId=e.gameId;
        switch(e.funding) {
            case "AWAITING_PAYMENTS" -> {
                if(now>e.deadline) {
                    cancelFunding(room,"Not every player paid the buy-in in time. Buy-ins go back to casino balances.");
                    publish(room);
                    return;
                }
                if(now<e.nextPoll) return;
                e.inFlight=true;
                chain.game(gameId).whenComplete((game,error)->onGameStatus(roomId,gameId,game,error));
            }
            case "CANCELLING" -> {
                if(e.cancelSent) return;
                e.cancelSent=true;e.inFlight=true;
                log.info("paid_room_cancel room={} game={} reason={}",room.code,gameId,e.message);
                chain.cancelGame(gameId).whenComplete((result,error)->onGameCancelled(roomId,gameId,result,error));
            }
            default -> {}
        }
    }
    /** Application heartbeat also detects half-open sockets after network loss. */
    synchronized void expireConnections(long now) {
        for(Peer peer:new ArrayList<>(peers.values())) if(now-peer.lastSeen>45_000) {
            disconnected(peer.socket);
            try {peer.socket.close(CloseStatus.SESSION_NOT_RELIABLE);}catch(IOException ignored) {}
        }
    }
    public synchronized void invalid(WebSocketSession socket) {error(socket,null,"INVALID_MESSAGE","Message does not match protocol v1.");}
    private void error(WebSocketSession socket,JsonNode requestId,String code,String detail) {
        try {if(socket.isOpen()) socket.sendMessage(new TextMessage(protocol.error(code,requestId,detail)));}
        catch(IOException ignored) {}
    }
    private void send(WebSocketSession socket,String type,JsonNode requestId,Object payload) {
        try {if(socket.isOpen()) socket.sendMessage(new TextMessage(protocol.message(type,requestId,payload)));}
        catch(IOException ignored) { /* No private payload logging. Close callback detaches the peer. */ }
    }
}
