package com.raccoonroyale.rooms;

import com.fasterxml.jackson.databind.JsonNode;
import com.raccoonroyale.games.LiarsDiceGame;
import com.raccoonroyale.websocket.Protocol;
import java.io.IOException;
import java.security.SecureRandom;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

/** Bounded in-memory free-play rooms. A guest session never proves wallet ownership. */
@Service
public class RoomService {
    private final Protocol protocol;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Peer> peers = new HashMap<>();
    private final Map<String, Room> rooms = new LinkedHashMap<>();
    private final long turnMillis, npcMillis, revealMillis;
    public RoomService(Protocol protocol,
        @Value("$" + "{app.game.turn-timeout-ms:30000}") long turnMillis,
        @Value("$" + "{app.game.npc-delay-ms:1100}") long npcMillis,
        @Value("$" + "{app.game.reveal-ms:4000}") long revealMillis) {
        this.protocol = protocol; this.turnMillis = turnMillis; this.npcMillis = npcMillis; this.revealMillis = revealMillis;
    }
    private static class Peer {
        final WebSocketSession socket;
        final Map<String,String> requests = new LinkedHashMap<>();
        String roomId, playerId;
        long rateStart;
        int count;
        Peer(WebSocketSession socket) { this.socket = socket; }
    }
    private static class Seat {
        final String id, name, avatar, token;
        final boolean npc;
        boolean ready, abandoned;
        WebSocketSession socket;
        long disconnectedAt;
        Seat(String id, String name, String avatar, String token, boolean npc, WebSocketSession socket) {
            this.id=id; this.name=name; this.avatar=avatar; this.token=token;
            this.npc=npc; this.socket=socket; this.ready=npc;
        }
    }
    private static class Room {
        final String id=UUID.randomUUID().toString(), code;
        final List<Seat> seats=new ArrayList<>();
        String hostId, matchId;
        LiarsDiceGame game;
        LiarsDiceGame.RoundResult reveal;
        long revision, deadline, npcAt, resumeAt, lastActivity;
        Room(String code) { this.code=code; this.lastActivity=System.currentTimeMillis(); }
        LiarsDiceGame.PublicState state() { return game.viewFor(seats.getFirst().id).publicState(); }
        String phase() { return game==null ? "LOBBY" : state().winnerId()==null ? "IN_PROGRESS" : "FINISHED"; }
    }
    public record RoomSeat(String playerId,String displayName,String avatar,boolean npc,boolean ready,boolean connected) {}
    public record RoomState(String roomId,String roomCode,String phase,String hostId,String youId,List<RoomSeat> participants) {}
    public record Participant(String playerId,String displayName,String avatar,boolean npc,int diceCount) {}
    public record PublicState(String matchId,String phase,int round,List<Participant> participants,
        String currentPlayerId,LiarsDiceGame.Bid lastBid,String lastBidderId,String winnerId,
        long revision,long deadlineEpochMillis,long resumeAtEpochMillis) {}
    public record PlayerState(PublicState publicState,List<Integer> ownDice) {}
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
            if(now-peer.rateStart>10_000) {peer.count=0;peer.rateStart=now;}
            require(++peer.count<=120,"RATE_LIMITED","Too many commands. Try again shortly.");
            if(type.equals("PING")) {send(socket,"PONG",requestId,Map.of());return;}
            require(requestId!=null && requestId.isTextual(),"INVALID_MESSAGE","Commands require a request ID.");
            String key=requestId.asText(), previous=peer.requests.get(key);
            if(previous!=null) {
                require(previous.equals(message.toString()),"INVALID_MESSAGE","Request ID was already used.");
                if(peer.roomId!=null && rooms.containsKey(peer.roomId)) snapshot(rooms.get(peer.roomId),seat(rooms.get(peer.roomId),peer.playerId));
                return;
            }
            JsonNode payload=message.get("payload");
            switch(type) {
                case "ROOM_CREATE" -> create(peer,payload);
                case "ROOM_JOIN" -> join(peer,payload);
                case "PLAYER_RECONNECT" -> reconnect(peer,payload);
                case "ROOM_LEAVE" -> leave(peer,payload);
                case "ROOM_READY" -> ready(peer,payload);
                case "ROOM_START" -> start(peer,payload);
                case "PLAYER_BID","CALL_BLUFF" -> action(peer,type,payload);
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
        Room room=new Room(code);
        Seat human=human(payload,peer.socket);
        room.hostId=human.id;room.seats.add(human);
        room.seats.add(new Seat("don-"+UUID.randomUUID(),"Don Raccoone","RACCOON",null,true,null));
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
        require(room.game==null,"ROOM_STARTED","This room has already started.");
        require(room.seats.size()<4,"ROOM_FULL","Table is full (three humans and one NPC).");
        Seat human=human(payload,peer.socket);
        room.seats.add(room.seats.size()-1,human);attach(peer,room,human);publish(room);
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
        room.matchId=UUID.randomUUID().toString();
        room.game=new LiarsDiceGame(room.seats.stream().map(s->s.id).toList());
        room.reveal=null;room.revision=0;room.resumeAt=0;scheduleTurn(room);
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
        apply(room,peer.playerId,action);
    }
    private void apply(Room room,String actor,LiarsDiceGame.Action action) {
        var reveal=room.game.apply(actor,action);
        room.revision++;room.lastActivity=System.currentTimeMillis();
        if(reveal!=null) {
            room.reveal=reveal;room.resumeAt=System.currentTimeMillis()+revealMillis;
            for(Seat s:room.seats) if(s.socket!=null) sendReveal(room,s.socket);
        }
        if(room.state().winnerId()!=null) {
            room.deadline=0;room.seats.forEach(s->s.ready=s.npc);
            for(Seat s:room.seats) if(s.socket!=null) result(room,s.socket);
        } else scheduleTurn(room);
        publish(room);
    }
    private void scheduleTurn(Room room) {
        long base=Math.max(System.currentTimeMillis(),room.resumeAt);
        room.deadline=base+turnMillis;room.npcAt=base+npcMillis;
    }
    private void leave(Peer peer,JsonNode payload) {
        Room room=room(peer);assertRoom(room,payload);
        Seat seat=seat(room,peer.playerId);
        seat.socket=null;seat.abandoned=true;seat.ready=false;
        peer.roomId=null;peer.playerId=null;
        if(!room.phase().equals("IN_PROGRESS")) room.seats.remove(seat);
        if(seat.id.equals(room.hostId)) room.hostId=room.seats.stream().filter(s->!s.npc&&!s.abandoned).map(s->s.id).findFirst().orElse(seat.id);
        if(room.seats.stream().noneMatch(s->!s.npc&&!s.abandoned)) rooms.remove(room.id);else publish(room);
    }
    private void snapshot(Room room,Seat recipient) {
        if(recipient.socket==null||!recipient.socket.isOpen()) return;
        var seats=room.seats.stream().map(s->new RoomSeat(s.id,s.name,s.avatar,s.npc,s.ready,s.npc||s.socket!=null&&s.socket.isOpen())).toList();
        send(recipient.socket,"ROOM_STATE",null,new RoomState(room.id,room.code,room.phase(),room.hostId,recipient.id,seats));
        if(room.game==null) return;
        var view=room.game.viewFor(recipient.id);var state=view.publicState();
        var participants=room.seats.stream().map(s->new Participant(s.id,s.name,s.avatar,s.npc,state.diceCounts().get(s.id))).toList();
        send(recipient.socket,"GAME_STATE",null,new PlayerState(new PublicState(room.matchId,room.phase(),state.round(),participants,
            state.currentPlayerId(),state.lastBid(),state.lastBidderId(),state.winnerId(),room.revision,room.deadline,room.resumeAt),view.ownDice()));
    }
    private void publish(Room room) {for(Seat s:room.seats) if(!s.npc) snapshot(room,s);}
    private void sendReveal(Room room,WebSocketSession socket) {
        var r=room.reveal;
        var dice=r.revealedDice().entrySet().stream().map(e->Map.<String,Object>of("playerId",e.getKey(),"dice",e.getValue())).toList();
        send(socket,"DICE_REVEAL",null,Map.of("matchId",room.matchId,"round",r.round(),"dice",dice,"loserId",r.loserId(),
            "bidderId",r.bidderId(),"callerId",r.callerId(),"bid",r.bid(),"actualCount",r.actualCount()));
    }
    private void result(Room room,WebSocketSession socket) {
        send(socket,"GAME_RESULT",null,Map.of("matchId",room.matchId,"winnerId",room.state().winnerId(),"settlement","NOT_STARTED"));
    }
    /** Humans, deterministic NPCs, and timeouts all use the same validated engine actions. */
    @Scheduled(fixedDelay=200)
    public synchronized void tick() {
        long now=System.currentTimeMillis();
        var iterator=rooms.values().iterator();
        while(iterator.hasNext()) {
            Room room=iterator.next();
            if(now-room.lastActivity>3_600_000||room.seats.stream().noneMatch(s->!s.npc&&!s.abandoned
                &&(s.socket!=null||now-s.disconnectedAt<120_000))) {iterator.remove();continue;}
            boolean changed=false;
            for(Seat s:room.seats) if(!s.npc&&!s.abandoned&&s.socket==null&&now-s.disconnectedAt>=120_000) {
                s.abandoned=true;s.ready=false;changed=true;
            }
            if(!room.phase().equals("IN_PROGRESS")) changed|=room.seats.removeIf(s->s.abandoned);
            if(changed) {
                if(room.seats.stream().noneMatch(s->s.id.equals(room.hostId)&&!s.abandoned))
                    room.hostId=room.seats.stream().filter(s->!s.npc&&!s.abandoned).map(s->s.id).findFirst().orElse(room.hostId);
                publish(room);
            }
            if(!room.phase().equals("IN_PROGRESS")) continue;
            String actor=room.state().currentPlayerId();Seat seat=seat(room,actor);
            if((seat.npc||seat.abandoned)?now>=room.npcAt:now>=room.deadline) apply(room,actor,room.game.fallbackFor(actor));
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
