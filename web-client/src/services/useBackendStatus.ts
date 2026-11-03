import { useEffect, useState } from 'react';
import { checkHealth, createPing, parseTransport } from './backend';

type Status = 'checking' | 'online' | 'offline';
export function useBackendStatus() {
  const [attempt, setAttempt] = useState(0);
  const [health, setHealth] = useState<Status>('checking');
  const [socket, setSocket] = useState<Status>('checking');

  useEffect(() => {
    let active = true;
    let answered = false;
    const abort = new AbortController();
    setHealth('checking');
    setSocket('checking');
    checkHealth(abort.signal).then(() => { if (active) setHealth('online'); })
      .catch(() => { if (active) setHealth('offline'); });
    const endpoint = new URL('/ws', window.location.href);
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
    const connection = new WebSocket(endpoint);
    const requestId = crypto.randomUUID();
    connection.onmessage = (event: MessageEvent<string>) => {
      try {
        const message = parseTransport(event.data);
        if (message.type === 'CONNECTED') connection.send(JSON.stringify(createPing(requestId)));
        if (message.type === 'PONG' && message.requestId === requestId) {
          answered = true;
          if (active) setSocket('online');
        }
      } catch {
        if (active) setSocket('offline');
        connection.close();
      }
    };
    connection.onerror = connection.onclose = () => { if (active) setSocket('offline'); };
    const deadline = window.setTimeout(() => {
      abort.abort();
      if (!answered) { setSocket('offline'); connection.close(); }
    }, 5000);
    return () => { active = false; abort.abort(); window.clearTimeout(deadline); connection.close(); };
  }, [attempt]);

  return { health, socket, retry: () => setAttempt((value) => value + 1) };
}
