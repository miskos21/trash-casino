import assert from 'node:assert/strict';

// Real transport smoke test, not a gameplay or chain simulation. Requires Node 22.12+.
const base = new URL(process.env.BACKEND_URL ?? 'http://localhost:8080');
const health = await fetch(new URL('/api/health', base), { signal: AbortSignal.timeout(5000) });
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), {
  status: 'UP', service: 'raccoon-royale-backend', network: 'testnet', protocolVersion: 1,
});

const endpoint = new URL('/ws', base);
endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
await new Promise((resolve, reject) => {
  const socket = new WebSocket(endpoint);
  const timer = setTimeout(() => { socket.close(); reject(new Error('WebSocket timed out')); }, 5000);
  socket.onerror = () => { clearTimeout(timer); reject(new Error('WebSocket failed')); };
  socket.onclose = () => { clearTimeout(timer); reject(new Error('WebSocket closed before PONG')); };
  socket.onmessage = ({ data }) => {
    try {
      const value = JSON.parse(data);
      assert.equal(value.protocolVersion, 1);
      if (value.type === 'CONNECTED') {
        socket.send(JSON.stringify({ protocolVersion: 1, type: 'PING', requestId: 'headless-check', payload: {} }));
      } else {
        assert.equal(value.type, 'PONG');
        assert.equal(value.requestId, 'headless-check');
        assert.deepEqual(value.payload, {});
        clearTimeout(timer);
        socket.onclose = null;
        socket.close();
        resolve();
      }
    } catch (error) { clearTimeout(timer); socket.close(); reject(error); }
  };
});
console.log('PASS: real backend health and WebSocket PING/PONG. Gameplay and chain operations are not exercised.');
