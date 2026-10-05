const encoder = new TextEncoder();
export const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
export function b64(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''); }
function bytes(value) { return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0)); }
export async function hash(value) { return b64(await crypto.subtle.digest('SHA-256', encoder.encode(value))); }
async function key(secret) { const raw = bytes(secret); if (raw.length !== 32) throw new Error('Invalid encryption configuration'); return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); }
export async function seal(data, secret, owner) { const iv = crypto.getRandomValues(new Uint8Array(12)); const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(owner) }, await key(secret), encoder.encode(JSON.stringify(data))); return `${b64(iv)}.${b64(encrypted)}`; }
export async function unseal(value, secret, owner) { const [iv, encrypted] = value.split('.'); const result = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(iv), additionalData: encoder.encode(owner) }, await key(secret), bytes(encrypted)); return JSON.parse(new TextDecoder().decode(result)); }
export function cookie(request, name) { return request.headers.get('Cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(name + '='))?.slice(name.length + 1) || ''; }
export function cookieHeader(name, value, maxAge, origin) { return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${origin.startsWith('https:') ? '; Secure' : ''}`; }
export function originAllowed(request, origin) { return request.headers.get('Origin') === origin; }
