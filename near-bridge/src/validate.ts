// Strict request validation. Every body must have exactly the expected fields.

const ACCOUNT_ID = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const GAME_ID = /^[A-Za-z0-9._:-]{1,64}$/;
const AMOUNT = /^(0|[1-9][0-9]{0,38})$/;
const U128_MAX = (1n << 128n) - 1n;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export class ValidationError extends Error {}

export function fail(message: string): never {
  throw new ValidationError(message);
}

export function object(value: unknown, allowed: string[], requiredKeys: string[] = allowed): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("Body must be a JSON object");
  const record = value as Record<string, unknown>;
  for (const k of Object.keys(record)) if (!allowed.includes(k)) fail(`Unknown field: ${k}`);
  for (const k of requiredKeys) if (!(k in record)) fail(`Missing field: ${k}`);
  return record;
}

export function accountId(value: unknown, field = "accountId"): string {
  if (typeof value !== "string" || value.length < 2 || value.length > 64 || !ACCOUNT_ID.test(value)) {
    fail(`${field} must be a NEAR account ID`);
  }
  return value;
}

export function gameId(value: unknown): string {
  if (typeof value !== "string" || !GAME_ID.test(value)) fail("gameId must be 1-64 chars of [A-Za-z0-9._:-]");
  return value;
}

/** Positive yoctoTRASH amount as an exact decimal string within u128. */
export function amount(value: unknown, field = "amount", allowZero = false): string {
  if (typeof value !== "string" || !AMOUNT.test(value)) fail(`${field} must be an integer string`);
  const parsed = BigInt(value);
  if (parsed > U128_MAX) fail(`${field} exceeds u128`);
  if (!allowZero && parsed === 0n) fail(`${field} must be positive`);
  return value;
}

export function integer(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    fail(`${field} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) fail(`${field} must be 1-${max} characters`);
  return value;
}

export function base64Bytes(value: unknown, field: string, maxBytes: number): Uint8Array {
  if (typeof value !== "string" || !BASE64.test(value)) fail(`${field} must be base64`);
  const bytes = Buffer.from(value, "base64");
  if (bytes.length === 0 || bytes.length > maxBytes) fail(`${field} has an invalid length`);
  return new Uint8Array(bytes);
}
