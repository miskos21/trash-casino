import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseHealth, parseTransport, createPing, checkHealth } from './backend';
import { useAvatarStore } from '../stores/avatarStore';

afterEach(() => vi.unstubAllGlobals());
describe('real backend transport', () => {
  it('accepts testnet health and rejects a guessed or mainnet response', () => {
    const value = { status: 'UP', network: 'testnet', service: 'raccoon-royale-backend', protocolVersion: 1 };
    expect(parseHealth(value)).toEqual(value);
    expect(() => parseHealth({ ...value, network: 'mainnet' })).toThrow();
    expect(() => parseHealth({ status: 'UP' })).toThrow();
  });
  it('does not turn an HTTP failure into online status', async () => {
    // TEMPORARY MOCK: isolated unit-test HTTP failure; never used by the application.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(checkHealth(new AbortController().signal)).rejects.toThrow('503');
  });
  it('checks transport messages before consuming them', () => {
    expect(createPing('r1')).toEqual({ protocolVersion: 1, type: 'PING', requestId: 'r1', payload: {} });
    expect(parseTransport(JSON.stringify({ protocolVersion: 1, type: 'PONG', requestId: 'r1', payload: {} })).type).toBe('PONG');
    for (const value of ['not json', 'null', '{}', JSON.stringify({ protocolVersion: 2, type: 'PONG', requestId: 'r1', payload: {} })]) {
      expect(() => parseTransport(value)).toThrow();
    }
  });
});

it('avatar choice changes only local presentation state', () => {
  useAvatarStore.getState().select('FOX');
  expect(useAvatarStore.getState().avatar).toBe('FOX');
  expect(Object.keys(useAvatarStore.getState()).sort()).toEqual(['avatar', 'select']);
});
