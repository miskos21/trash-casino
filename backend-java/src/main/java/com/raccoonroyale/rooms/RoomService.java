package com.raccoonroyale.rooms;

import com.fasterxml.jackson.databind.JsonNode;
import com.raccoonroyale.ai.AgentActionParser;
import com.raccoonroyale.ai.AgentBrain;
import com.raccoonroyale.ai.AgentContext;
import com.raccoonroyale.ai.MockAgentBrain;
import com.raccoonroyale.games.BlackjackGame;
import com.raccoonroyale.games.LiarsDiceGame;
import com.raccoonroyale.websocket.Protocol;
import java.io.IOException;
import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

/** Bounded in-memory free-play rooms. A guest session never proves wallet ownership. */
@Service
public class RoomService {
    private static final Logger log = LoggerFactory.getLogger(RoomService.class);
    static final int CHAT_BURST = 4;
    static final long CHAT_WINDOW_MS = 20_000;
    static final long AGENT_TALK_GAP_MS = 15_000; // Unprompted table talk after a move, per agent.
    private final Protocol protocol;
    private final AgentBrain brain;
    private final AgentActionParser parser;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Peer> peers = new HashMap<>();
    private final Map<String, Room> rooms = new LinkedHashMap<>();
    private final long turnMillis, npcMillis, revealMillis, agentTimeoutMillis;
    @Autowired
    public RoomService(Protocol protocol, AgentBrain brain, AgentActionParser parser,
        @Value("$" + "{app.game.turn-timeout-ms:30000}") long turnMillis,
        @Value("$" + "{app.game.npc-delay-ms:1100}") long npcMillis,
        @Value("$" + "{app.game.reveal-ms:4000}") long revealMillis,
        @Value("$" + "{app.llm.timeout-ms:5000}") long agentTimeoutMillis) {
        this.protocol = protocol; this.brain = brain; this.parser = parser;
        this.turnMillis = turnMillis; this.npcMillis = npcMillis; this.revealMillis = revealMillis;
        this.agentTimeoutMillis = agentTimeoutMillis;
    }
    /** Rule tests: the TEMPORARY MOCK brain answers synchronously, so ticks stay deterministic. */
    public RoomService(Protocol protocol, long turnMillis, long npcMillis, long revealMillis) {
        this(protocol, new MockAgentBrain(), new AgentActionParser(protocol), turnMillis, npcMillis, revealMillis, 5000);
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
        boolean ready, abandoned;
        WebSocketSession socket;
        long disconnectedAt;
        final ArrayDeque<Long> chatTimes=new ArrayDeque<>();
        Seat(String id, String name, String avatar, String token, boolean npc, WebSocketSession socket) {
            this.id=id; this.name=name; this.avatar=avatar; this.token=token;
            this.npc=npc; this.socket=socket; this.ready=npc;
        }
    }
    private static class Room {
        final String id=UUID.randomUUID().toString(), code, gameType;
        final List<Seat> seats=new ArrayList<>();
        final List<PublicGameEvent> history=new ArrayList<>();
        String hostId, matchId;
        LiarsDiceGame game;
        BlackjackGame blackjack;
        Map<String,Seat> dealt=Map.of(); // Hands outlive seats that leave after the hand ends.
        LiarsDiceGame.RoundResult reveal;
        long revision, deadline, npcAt, resumeAt, lastActivity, eventSequence, chatSequence;
        final List<ChatMessage> chat=new ArrayList<>();
        String pendingTurn; // matchId:revision of an agent turn awaiting its brain.
        final Set<String> replying=new HashSet<>(); // Agents with a chat reply in flight.
        Room(String code,String gameType) { this.code=code; this.gameType=gameType; this.lastActivity=System.currentTimeMillis(); }
        LiarsDiceGame.PublicState state() { return game.viewFor(seats.getFirst().id).publicState(); }
        String phase() {
            if(blackjack!=null) return blackjack.publicState().shoeOver() ? "FINISHED" : "IN_PROGRESS";
            return game==null ? "LOBBY" : state().finished() ? "FINISHED" : "IN_PROGRESS";
        }
    }
    public record RoomSeat(String playerId,String displayName,String avatar,boolean npc,boolean ready,boolean connected,String presence) {}
    public record RoomState(String roomId,String roomCode,String game,String phase,String hostId,String youId,List<RoomSeat> participants,
        String agentMode) {}
    public record ChatMessage(String matchId,String messageId,String senderId,String senderName,boolean agent,String text,long sentAtEpochMillis) {}
    public record Participant(String playerId,String displayName,String avatar,boolean npc,int diceCount,int chips) {}
    public record PublicGameEvent(String id,int round,String type,String actorId,LiarsDiceGame.Bid bid,
        String loserId,Integer actualCount,String cause,String winnerId) {}
    public record Standing(String playerId,int chips) {}
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
                case "PLAYER_CHAT" -> playerChat(peer,payload);
                case "MATCH_END" -> endMatch(peer,payload);
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
        Seat human=human(payload,peer.socket);
        room.hostId=human.id;room.seats.add(human);
        int agents=payload.has("agents") ? payload.get("agents").asInt() : 1;
        if(agents>=1) room.seats.add(new Seat("don-"+UUID.randomUUID(),"Don Raccoone","RACCOON",null,true,null));
        if(agents>=2) room.seats.add(new Seat("foxy-"+UUID.randomUUID(),"Foxy","FOX",null,true,null));
        rooms.put(room.id,room);attach(peer,room,human);publish(room);
    }
    private Seat human(JsonNode payload,WebSocketSession socket) {
        String name=payload.path("displayName").asText().strip();
        require(!name.isBlank(),"INVALID_MESSAGE","Enter a player name.");
        return new Seat(UUID.randomUUID().toString(),name,payload.path("avatar").asText(),token(),false,socket);
    }
    private Room findCode(String code) {return rooms.values().stream().filter(r->r.code.equals(code)).findFirst().orElse(null);}
    private void join(Peer peer,JsonNode payload) {
        require(peer.roomId==null,"ALREADY_IN_ROOM","Leave your current room first.");
        Room room=findCode(payload.path("roomCode").asText());
        require(room!=null,"ROOM_NOT_FOUND","Room code not found.");
        require(room.matchId==null,"ROOM_STARTED","This room has already started.");
        require(room.seats.size()<4,"ROOM_FULL","Table is full (four seats including agents).");
        Seat human=human(payload,peer.socket);
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
        for(var line:room.chat) send(found.socket,"CHAT_MESSAGE",null,line);
        if(room.reveal!=null) sendReveal(room,found.socket);
        if(room.game!=null&&room.state().finished()) result(room,found.socket);
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
        require(!room.phase().equals("IN_PROGRESS"),"ROOM_STARTED","Match already started.");
        seat(room,peer.playerId).ready=payload.path("ready").asBoolean();
        room.lastActivity=System.currentTimeMillis();publish(room);
    }
    private void start(Peer peer,JsonNode payload) {
        Room room=room(peer);assertRoom(room,payload);
        require(peer.playerId.equals(room.hostId),"NOT_HOST","Only the host can start.");
        require(!room.phase().equals("IN_PROGRESS"),"ROOM_STARTED","Match already started.");
        room.seats.removeIf(s->s.abandoned);
        require(room.seats.stream().filter(s->!s.npc).allMatch(s->s.ready&&s.socket!=null&&s.socket.isOpen()),
            "NOT_READY","All human players must be connected and ready.");
        require(room.gameType.equals("BLACKJACK")||room.seats.size()>=2,"NOT_READY",
            "Liar’s Dice needs at least two players. Add an agent or invite a friend.");
        room.matchId=UUID.randomUUID().toString();
        room.reveal=null;room.revision=0;room.resumeAt=0;room.eventSequence=0;room.history.clear();
        room.chat.clear();room.pendingTurn=null;room.replying.clear();
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
        event(room,type,round,actor,bid,loser,count,cause,null);
    }
    private void event(Room room,String type,int round,String actor,LiarsDiceGame.Bid bid,String loser,Integer count,String cause,String winner) {
        room.history.add(new PublicGameEvent(room.matchId+"-"+(++room.eventSequence),round,type,actor,bid,loser,count,cause,winner));
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
            event(room,"ROUND_RESULT",reveal.round(),actor,reveal.bid(),reveal.loserId(),reveal.actualCount(),cause,reveal.winnerId());
            for(Seat s:room.seats) if(s.socket!=null) sendReveal(room,s.socket);
        }
        if(room.state().finished()) {
            finishMatch(room,before.round());
        } else {
            if(reveal!=null) event(room,"ROUND_START",room.state().round(),room.state().currentPlayerId(),null,null,null,null);
            scheduleTurn(room);
        }
        publish(room);
    }
    private void finishMatch(Room room,int round) {
        room.deadline=0;room.seats.forEach(s->s.ready=s.npc);
        event(room,"GAME_OVER",round,room.state().winnerId(),null,null,null,null);
        for(Seat s:room.seats) if(s.socket!=null) result(room,s.socket);
    }
    /** Host only. Chips become the final standings; there is no other way to stop a running match early. */
    private void endMatch(Peer peer,JsonNode payload) {
        Room room=room(peer);assertRoom(room,payload);
        require(peer.playerId.equals(room.hostId),"NOT_HOST","Only the host can end the match.");
        require(room.game!=null&&room.phase().equals("IN_PROGRESS"),"ILLEGAL_ACTION","No running Liar’s Dice match.");
        require(room.matchId.equals(payload.path("matchId").asText()),"STALE_STATE","Wrong match.");
        room.game.end();
        room.revision++;room.pendingTurn=null;room.lastActivity=System.currentTimeMillis();
        finishMatch(room,room.state().round());
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
        boolean inProgress=room.phase().equals("IN_PROGRESS");
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
            room.game.leave(seat.id); // The leaver keeps their chips; they stop playing.
            event(room,"PLAYER_LEFT",room.state().round(),seat.id,null,null,null,null);
            if(!active) return;
            room.reveal=null;room.resumeAt=0;
            if(room.state().finished()) {
                finishMatch(room,room.state().round());
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
            return new RoomSeat(s.id,s.name,s.avatar,s.npc,s.ready,connected,s.abandoned?"LEFT":connected?"ONLINE":"DISCONNECTED");
        }).toList();
        send(recipient.socket,"ROOM_STATE",null,new RoomState(room.id,room.code,room.gameType,room.phase(),room.hostId,recipient.id,seats,brain.mode()));
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
        var participants=room.seats.stream().map(s->new Participant(s.id,s.name,s.avatar,s.npc,state.diceCounts().get(s.id),state.chips().get(s.id))).toList();
        send(recipient.socket,"GAME_STATE",null,new PlayerState(new PublicState(room.matchId,room.phase(),state.round(),participants,
            state.currentPlayerId(),state.lastBid(),state.lastBidderId(),state.winnerId(),room.revision,room.deadline,room.resumeAt,
            List.copyOf(room.history)),view.ownDice()));
    }
    private void publish(Room room) {for(Seat s:room.seats) if(!s.npc) snapshot(room,s);}
    private void sendReveal(Room room,WebSocketSession socket) {
        var r=room.reveal;
        var dice=r.revealedDice().entrySet().stream().map(e->Map.<String,Object>of("playerId",e.getKey(),"dice",e.getValue())).toList();
        send(socket,"DICE_REVEAL",null,Map.of("matchId",room.matchId,"round",r.round(),"dice",dice,"loserId",r.loserId(),
            "bidderId",r.bidderId(),"callerId",r.callerId(),"bid",r.bid(),"actualCount",r.actualCount(),"winnerId",r.winnerId()));
    }
    private void result(Room room,WebSocketSession socket) {
        var result=new LinkedHashMap<String,Object>(); // winnerId is null on a tie.
        result.put("matchId",room.matchId);result.put("winnerId",room.state().winnerId());
        result.put("standings",room.seats.stream().map(s->new Standing(s.id,room.state().chips().get(s.id))).toList());
        result.put("settlement","NOT_STARTED");
        send(socket,"GAME_RESULT",null,result);
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
                &&(s.socket!=null||now-s.disconnectedAt<120_000))) {iterator.remove();continue;}
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
            if(seat.npc) {if(now>=room.npcAt&&room.pendingTurn==null) askAgentTurn(room,seat);}
            else if(seat.abandoned?now>=room.npcAt:now>=room.deadline)
                apply(room,actor,room.game.fallbackFor(actor),seat.abandoned?"UNAVAILABLE":"TIMEOUT");
        }
    }
    /**
     * Asks the agent's brain for a Liar's Dice move without holding the room lock while it thinks. The reply is
     * applied only if the turn has not moved on; an invalid reply, an illegal move, a timeout, or an error all
     * fall back to the engine's deterministic legal move.
     */
    private void askAgentTurn(Room room,Seat agent) {
        String key=room.matchId+":"+room.revision;
        room.pendingTurn=key;
        var context=agentContext(room,agent,AgentContext.Task.TURN);
        brain.respond(context).orTimeout(agentTimeoutMillis,TimeUnit.MILLISECONDS)
            .whenComplete((reply,failure)->agentTurnResult(room.id,key,agent.id,context,reply,failure));
    }
    synchronized void agentTurnResult(String roomId,String key,String agentId,AgentContext context,String reply,Throwable failure) {
        Room room=rooms.get(roomId);
        if(room==null||!key.equals(room.pendingTurn)) return;
        room.pendingTurn=null;
        if(!key.equals(room.matchId+":"+room.revision)) return; // Stale: the turn changed while the agent was thinking.
        if(room.game==null||!room.phase().equals("IN_PROGRESS")||!agentId.equals(room.state().currentPlayerId())) return;
        String validation, applied;
        String talk="";
        try {
            if(failure!=null) throw new AgentActionParser.InvalidAgentOutput(failure instanceof java.util.concurrent.TimeoutException
                ||failure.getCause() instanceof java.util.concurrent.TimeoutException?"timeout":"brain error: "+failure.getClass().getSimpleName());
            var proposal=parser.parse(reply,AgentActionParser.TURN_ACTIONS);
            LiarsDiceGame.Action action=proposal.action().equals("CALL_BLUFF")?new LiarsDiceGame.CallBluff()
                :new LiarsDiceGame.Bid(proposal.bid().quantity(),proposal.bid().face());
            talk=proposal.message();
            apply(room,agentId,action,"NPC"); // The engine rejects illegal bids before changing anything.
            validation="VALID";applied=String.valueOf(action);
        } catch(AgentActionParser.InvalidAgentOutput|IllegalArgumentException|IllegalStateException rejected) {
            validation="REJECTED: "+rejected.getMessage();talk="";
            var fallback=room.game.fallbackFor(agentId);
            apply(room,agentId,fallback,"NPC_FALLBACK");
            applied=fallback+" (fallback)";
        }
        logAgent(context,reply,validation,applied);
        if(!talk.isEmpty()&&shouldTalk(room,agentId,talk)) postChat(room,agentId,seat(room,agentId).name,true,talk);
    }
    /**
     * Models repeat themselves and talk on every move. Unprompted table talk is posted only after a quiet gap and
     * only if it does not open like one of the agent's recent lines. Replies to players are always posted.
     */
    private boolean shouldTalk(Room room,String agentId,String talk) {
        long now=System.currentTimeMillis();
        var own=room.chat.stream().filter(c->c.senderId().equals(agentId)).toList();
        if(!own.isEmpty()&&now-own.getLast().sentAtEpochMillis()<AGENT_TALK_GAP_MS) return false;
        String opening=opening(talk);
        return own.subList(Math.max(0,own.size()-5),own.size()).stream().noneMatch(c->opening(c.text()).equals(opening));
    }
    private static String opening(String text) {
        var words=text.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9 ]"," ").trim().split("\\s+");
        return String.join(" ",Arrays.copyOf(words,Math.min(3,words.length)));
    }
    private void playerChat(Peer peer,JsonNode payload) {
        Room room=room(peer);
        require(room.matchId!=null&&room.matchId.equals(payload.path("matchId").asText()),"STALE_STATE","Chat belongs to the current match.");
        Seat seat=seat(room,peer.playerId);
        long now=System.currentTimeMillis();
        while(!seat.chatTimes.isEmpty()&&now-seat.chatTimes.peekFirst()>CHAT_WINDOW_MS) seat.chatTimes.pollFirst();
        require(seat.chatTimes.size()<CHAT_BURST,"RATE_LIMITED","Slow down: "+CHAT_BURST+" messages per "+CHAT_WINDOW_MS/1000+" seconds.");
        String text=payload.path("message").asText().strip();
        require(!text.isEmpty(),"INVALID_MESSAGE","Write a message first.");
        seat.chatTimes.addLast(now);
        postChat(room,seat.id,seat.name,false,text);
        Seat agent=addressedAgent(room,text);
        if(agent!=null&&room.replying.add(agent.id)) {
            var context=agentContext(room,agent,AgentContext.Task.CHAT_REPLY);
            String matchId=room.matchId;
            brain.respond(context).orTimeout(agentTimeoutMillis,TimeUnit.MILLISECONDS)
                .whenComplete((reply,failure)->agentChatResult(room.id,matchId,agent.id,context,reply,failure));
        }
    }
    /** An agent named in the message answers; otherwise the first agent at the table does. One reply in flight each. */
    private Seat addressedAgent(Room room,String text) {
        var agents=room.seats.stream().filter(s->s.npc).toList();
        String lower=text.toLowerCase(Locale.ROOT);
        return agents.stream().filter(a->lower.contains(a.name.split(" ")[0].toLowerCase(Locale.ROOT))).findFirst()
            .orElse(agents.isEmpty()?null:agents.getFirst());
    }
    synchronized void agentChatResult(String roomId,String matchId,String agentId,AgentContext context,String reply,Throwable failure) {
        Room room=rooms.get(roomId);
        if(room==null) return;
        room.replying.remove(agentId);
        if(!matchId.equals(room.matchId)) return;
        try {
            if(failure!=null) throw new AgentActionParser.InvalidAgentOutput("no reply: "+failure.getClass().getSimpleName());
            var proposal=parser.parse(reply,AgentActionParser.CHAT_ACTIONS);
            postChat(room,agentId,seat(room,agentId).name,true,proposal.message());
            logAgent(context,reply,"VALID","CHAT");
        } catch(AgentActionParser.InvalidAgentOutput|Rejected rejected) {
            logAgent(context,reply,"REJECTED: "+rejected.getMessage(),"no chat");
        }
    }
    private void postChat(Room room,String senderId,String senderName,boolean agent,String text) {
        var line=new ChatMessage(room.matchId,room.matchId+"-chat-"+(++room.chatSequence),senderId,senderName,agent,text,System.currentTimeMillis());
        room.chat.add(line);
        if(room.chat.size()>40) room.chat.removeFirst();
        room.lastActivity=System.currentTimeMillis();
        for(Seat s:room.seats) if(!s.npc&&s.socket!=null) send(s.socket,"CHAT_MESSAGE",null,line);
    }
    /** Builds only what this agent may know: its own engine view, public state, and recent public chat. */
    private AgentContext agentContext(Room room,Seat agent,AgentContext.Task task) {
        var chat=room.chat.subList(Math.max(0,room.chat.size()-8),room.chat.size()).stream()
            .map(c->new AgentContext.ChatLine(c.senderName(),c.agent(),c.text())).toList();
        Map<String,String> names=new HashMap<>();
        room.seats.forEach(s->names.put(s.id,s.name));
        AgentContext.LiarsDice dice=null;AgentContext.Blackjack cards=null;
        if(room.game!=null) {
            var view=room.game.viewFor(agent.id);var state=view.publicState();
            var counts=new LinkedHashMap<String,Integer>();
            state.diceCounts().forEach((id,count)->counts.put(names.getOrDefault(id,"Player"),count));
            var events=room.history.subList(Math.max(0,room.history.size()-8),room.history.size()).stream()
                .map(e->e.type()+" by "+names.getOrDefault(e.actorId(),"-")+(e.bid()==null?"":" "+e.bid().quantity()+"x"+e.bid().face())).toList();
            var last=state.lastBid();
            var chips=new LinkedHashMap<String,Integer>();
            state.chips().forEach((id,count)->chips.put(names.getOrDefault(id,"Player"),count));
            dice=new AgentContext.LiarsDice(state.round(),view.ownDice(),counts,chips,counts.values().stream().mapToInt(i->i).sum(),
                last==null?null:new AgentContext.Bid(last.quantity(),last.face()),last==null?null:names.get(state.lastBidderId()),events);
        } else if(room.blackjack!=null) {
            var state=room.blackjack.publicState();
            List<String> own=List.of();int total=0;var others=new LinkedHashMap<String,List<String>>();
            for(var hand:state.players()) {
                var shown=hand.cards().stream().map(c->c.rank()+c.suit()).toList();
                if(hand.playerId().equals(agent.id)) {own=shown;total=hand.total();}
                else others.put(names.getOrDefault(hand.playerId(),"Player"),shown);
            }
            String up=state.dealerCards().isEmpty()?null:state.dealerCards().getFirst().rank()+state.dealerCards().getFirst().suit();
            cards=new AgentContext.Blackjack(own,total,up,others);
        }
        return new AgentContext(room.matchId,agent.id,agent.name,AgentContext.Persona.forSeat(agent.id),task,room.gameType,dice,cards,chat);
    }
    /** One structured line per agent decision, by match. No API keys or resume tokens ever reach a context. */
    private void logAgent(AgentContext context,String reply,String validation,String applied) {
        log.atInfo().addKeyValue("matchId",context.matchId()).addKeyValue("agentId",context.agentId())
            .addKeyValue("task",context.task()).addKeyValue("brain",brain.mode())
            .addKeyValue("prompt",com.raccoonroyale.ai.AgentPrompt.user(context)).addKeyValue("response",reply)
            .addKeyValue("validation",validation).addKeyValue("result",applied).log("agent decision");
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
