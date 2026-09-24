// ══════════════════════════════════════════════════════════════
// Web Push sender — standard Web Push with VAPID, no dependencies
//
// Browsers hand the app a push "subscription" (an endpoint URL at
// their push service — Google's for Chrome/Android, Apple's for
// Safari/iPhone, Mozilla's for Firefox — plus two keys). To notify
// that device we POST an encrypted message to the endpoint:
//
//   - VAPID (RFC 8292): a short-lived ES256 JWT signed with our
//     private key, so the push service knows the message is from the
//     server the browser subscribed to.
//   - Encryption (RFC 8291, aes128gcm): only the subscribed browser
//     can read the payload — the push service can't.
//
// Uses only WebCrypto + fetch, so it runs the same in Deno edge
// functions and in Node (for tests). No imports on purpose.
// ══════════════════════════════════════════════════════════════

export interface PushTarget {
  endpoint: string
  /** Browser's public key (P-256, uncompressed), base64url. */
  p256dh: string
  /** Browser's 16-byte auth secret, base64url. */
  auth: string
}

export interface VapidKeys {
  /** Our P-256 public key, uncompressed (65 bytes), base64url. */
  publicKey: string
  /** Our P-256 private scalar d (32 bytes), base64url. */
  privateKey: string
  /** Contact for the push service: an https: URL or mailto:. */
  subject: string
}

export interface PushResult {
  status: number
  /** The subscription no longer exists (404/410) — delete it. */
  gone: boolean
  body?: string
}

const enc = new TextEncoder()

export function b64urlEncode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// TypeScript 5.7+ types Uint8Array by its buffer; WebCrypto/fetch want an
// ArrayBuffer-backed view. Ours always are — this just says so, in a way
// every TS version (and Deno's) accepts.
const bs = (u: Uint8Array) => u as unknown as BufferSource

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', bs(ikm), 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: bs(salt), info: bs(info) }, key, length * 8)
  return new Uint8Array(bits)
}

/** VAPID Authorization header value for an endpoint. */
export async function vapidAuthorization(endpoint: string, vapid: VapidKeys, expiresInSec = 12 * 3600): Promise<string> {
  const pub = b64urlDecode(vapid.publicKey)
  const jwk: JsonWebKey = {
    kty: 'EC', crv: 'P-256', ext: true,
    x: b64urlEncode(pub.slice(1, 33)),
    y: b64urlEncode(pub.slice(33, 65)),
    d: vapid.privateKey,
  }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64urlEncode(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + expiresInSec,
    sub: vapid.subject,
  })))
  // WebCrypto's ECDSA signature is already raw r||s, which is exactly JWS ES256
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)))
  return `vapid t=${header}.${claims}.${b64urlEncode(sig)}, k=${vapid.publicKey}`
}

/** Encrypt a payload for one subscription (RFC 8291, single aes128gcm record). */
export async function encryptPayload(target: PushTarget, payload: Uint8Array): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(target.p256dh)
  const authSecret = b64urlDecode(target.auth)

  // Our one-off key pair for this message
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', bs(uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256))

  const ikm = await hkdf(authSecret, ecdhSecret, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  // One record: payload + 0x02 (last-record delimiter)
  const aesKey = await crypto.subtle.importKey('raw', bs(cek), 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bs(nonce) }, aesKey, bs(concat(payload, new Uint8Array([2])))))

  // Header: salt(16) | record size(4, BE) | key id length(1) | key id (our public key)
  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, 4096)
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext)
}

/**
 * Send one notification. `payload` is what the service worker's push
 * handler receives (we send JSON: title, body, url, tag).
 */
export async function sendWebPush(
  target: PushTarget,
  payload: string,
  vapid: VapidKeys,
  opts: { ttlSec?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; topic?: string } = {},
): Promise<PushResult> {
  const body = await encryptPayload(target, enc.encode(payload))
  const headers: Record<string, string> = {
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(opts.ttlSec ?? 24 * 3600),
    Urgency: opts.urgency ?? 'normal',
    Authorization: await vapidAuthorization(target.endpoint, vapid),
  }
  // Topic replaces an undelivered message with the same topic (≤32 url-safe chars)
  if (opts.topic) headers.Topic = opts.topic.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32)
  const res = await fetch(target.endpoint, { method: 'POST', headers, body: bs(body) })
  const text = res.ok ? undefined : (await res.text()).slice(0, 300)
  return { status: res.status, gone: res.status === 404 || res.status === 410, body: text }
}
