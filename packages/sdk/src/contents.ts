import type { ContentLine } from '@mosaec/domain';

/** Canonical order the contracts use: by token id, then amount. Rejects repeats and zero lines. */
export function canonicalContents(lines: readonly ContentLine[]): ContentLine[] {
  const sorted = [...lines].sort((a, b) =>
    a.token_id === b.token_id ? Number(a.amount - b.amount) : a.token_id < b.token_id ? -1 : 1,
  );
  sorted.forEach((line, i) => {
    if (line.amount <= 0n) {
      throw new RangeError(`zero amount for ${line.token_id}`);
    }
    if (i > 0 && sorted[i - 1]?.token_id === line.token_id) {
      throw new RangeError(`${line.token_id} listed twice`);
    }
  });
  return sorted;
}

const U128_MAX = 2n ** 128n - 1n;

function u32le(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function u128le(value: bigint): Uint8Array {
  if (value < 0n || value > U128_MAX) {
    throw new RangeError('amount outside u128');
  }
  const bytes = new Uint8Array(16);
  let rest = value;
  for (let i = 0; i < 16; i += 1) {
    bytes[i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return bytes;
}

/** The borsh encoding the contracts hash: count, then per line the token id and amount. */
export function encodeContents(lines: readonly ContentLine[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [u32le(lines.length)];
  for (const line of lines) {
    const id = encoder.encode(line.token_id);
    parts.push(u32le(id.length), id, u128le(line.amount));
  }
  const out = new Uint8Array(new ArrayBuffer(parts.reduce((n, p) => n + p.length, 0)));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Hex sha256 of the canonical contents, equal to `Contents::hash_hex` in Rust. */
export async function contentsHash(lines: readonly ContentLine[]): Promise<string> {
  const encoded = encodeContents(canonicalContents(lines));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
