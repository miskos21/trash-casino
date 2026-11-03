import { useCallback, useEffect, useRef, useState } from 'react';
import type { BlackjackState, ClientMessage, PlayerGameState, RoomState, ROOM_SESSION, DICE_REVEAL } from '@raccoon-royale/shared-schemas/types';
import { checkHealth, parseServer } from './backend';

type Status = 'checking' | 'online' | 'offline';
const storageKey = 'raccoon-guest-session';
type Session = ROOM_SESSION['payload'];
function savedSession(): Session | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
    return value && typeof value.roomId === 'string' && typeof value.resumeToken === 'string'
      && /^[A-Za-z0-9_-]{43}$/.test(value.resumeToken) ? value as Session : null;
  } catch { return null; }
}
function requestId() {
  return Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(16)).join('-');
}
export function useGameConnection() {
  const [attempt, setAttempt] = useState(0);
  const [health, setHealth] = useState<Status>('checking');
  const [socket, setSocket] = useState<Status>('checking');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [game, setGame] = useState<PlayerGameState | null>(null);
  const [blackjack, setBlackjack] = useState<BlackjackState | null>(null);
  const [reveal, setReveal] = useState<DICE_REVEAL['payload'] | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const connection = useRef<WebSocket | null>(null);
  const resume = useRef<Session | null>(savedSession());

  useEffect(() => {
    let active = true;
    let answered = false;
    let reconnectTimer: number | undefined;
    const abort = new AbortController();
    setHealth('checking'); setSocket('checking'); setPending(false);
    checkHealth(abort.signal).then(() => { if (active) setHealth('online'); })
      .catch(() => { if (active) setHealth('offline'); });
    // Deferral avoids creating then aborting a socket during React StrictMode's initial probe.
    const start = window.setTimeout(() => {
      if (!active) return;
      const url = new URL('/ws', location.href);
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(url);
      connection.current = ws;
      const pingId = requestId();
      ws.onmessage = ({ data }: MessageEvent<string>) => {
        if (!active) return;
        try {
          const message = parseServer(data);
          switch (message.type) {
            case 'CONNECTED':
              ws.send(JSON.stringify({ protocolVersion: 1, type: 'PING', requestId: pingId, payload: {} }));
              if (resume.current) ws.send(JSON.stringify({ protocolVersion: 1, type: 'PLAYER_RECONNECT',
                requestId: requestId(), payload: { roomId: resume.current.roomId, resumeToken: resume.current.resumeToken } }));
              break;
            case 'PONG': if (message.requestId === pingId) { answered = true; setSocket('online'); } break;
            case 'ROOM_SESSION':
              resume.current = message.payload;
              try { sessionStorage.setItem(storageKey, JSON.stringify(message.payload)); } catch { /* Reload recovery unavailable. */ }
              break;
            case 'ROOM_STATE': setRoom(message.payload); setPending(false); break;
            case 'GAME_START': setReveal(null); setGame(null); setBlackjack(null); break;
            case 'GAME_STATE': setGame(message.payload); setPending(false); break;
            case 'BLACKJACK_STATE': setBlackjack(message.payload); setPending(false); break;
            case 'DICE_REVEAL': setReveal(message.payload); break;
            case 'ERROR':
              setError(message.payload.message); setPending(false);
              if (message.payload.code === 'INVALID_SESSION') {
                resume.current = null; setRoom(null); setGame(null); setBlackjack(null); setReveal(null);
                try { sessionStorage.removeItem(storageKey); } catch { /* No storage. */ }
              }
              break;
          }
        } catch { setError('Server message does not match the game protocol.'); ws.close(); }
      };
      ws.onclose = () => {
        if (!active) return;
        setSocket('offline'); setPending(false);
        reconnectTimer = window.setTimeout(() => setAttempt((n) => n + 1), 1500);
      };
      ws.onerror = () => { if (active) setSocket('offline'); };
    }, 0);
    const deadline = window.setTimeout(() => {
      abort.abort();
      if (active && !answered) { setSocket('offline'); connection.current?.close(); }
    }, 5000);
    return () => {
      active = false; abort.abort(); clearTimeout(start); clearTimeout(deadline); clearTimeout(reconnectTimer);
      connection.current?.close(); connection.current = null;
    };
  }, [attempt]);

  const send = useCallback((command: ClientMessage) => {
    const ws = connection.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || socket !== 'online') { setError('Wait for the server connection.'); return; }
    setError(''); setPending(true);
    ws.send(JSON.stringify({ ...command, requestId: requestId() }));
  }, [socket]);

  const leave = useCallback(() => {
    if (!room) return;
    send({ protocolVersion: 1, type: 'ROOM_LEAVE', requestId: null, payload: { roomId: room.roomId } });
    resume.current = null;
    try { sessionStorage.removeItem(storageKey); } catch { /* No storage. */ }
    setRoom(null); setGame(null); setBlackjack(null); setReveal(null); setPending(false);
  }, [room, send]);
  return { health, socket, room, game, blackjack, reveal, error, pending, send, leave,
    retry: () => setAttempt((n) => n + 1), clearError: () => setError('') };
}
export type GameConnection = ReturnType<typeof useGameConnection>;
