import type { HealthResponse, ServerMessage, ClientMessage } from '@raccoon-royale/shared-schemas/types';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseHealth(value: unknown): HealthResponse {
  if (!isObject(value) || value.status !== 'UP' || value.network !== 'testnet' ||
      value.service !== 'raccoon-royale-backend' || value.protocolVersion !== 1) {
    throw new Error('Unexpected backend health response');
  }
  return value as unknown as HealthResponse;
}

// Milestone 1 consumes only these transport messages. Gameplay gets a full decoder when connected.
type TransportMessage = Extract<ServerMessage, { type: 'CONNECTED' | 'PONG' }>;
export function parseTransport(text: string): TransportMessage {
  const value: unknown = JSON.parse(text);
  if (!isObject(value) || value.protocolVersion !== 1 || !isObject(value.payload) ||
      !(value.requestId === null || typeof value.requestId === 'string')) {
    throw new Error('Invalid transport message');
  }
  if (value.type === 'CONNECTED' && value.payload.service === 'raccoon-royale-backend') {
    return value as unknown as TransportMessage;
  }
  if (value.type === 'PONG' && Object.keys(value.payload).length === 0) {
    return value as unknown as TransportMessage;
  }
  throw new Error('Unexpected transport message');
}

export function createPing(requestId: string): ClientMessage {
  return { protocolVersion: 1, type: 'PING', requestId, payload: {} };
}

export async function checkHealth(signal: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/health', { signal });
  if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}`);
  return parseHealth(await response.json());
}
