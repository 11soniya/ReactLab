import crypto from 'node:crypto';

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days
const COOKIE_NAME = 'reactlab_classroom_session';

// In-memory rate limiter for auth / join attempts
const attempts = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_ATTEMPTS = 20;

export function checkRateLimit(key) {
  const now = Date.now();
  const record = attempts.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  record.count += 1;
  attempts.set(key, record);
  return record.count <= MAX_ATTEMPTS;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, hash, salt) {
  try {
    const calculated = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(calculated, 'hex'));
  } catch {
    return false;
  }
}

export function generateId() {
  return crypto.randomUUID();
}

export function generateClassroomCode() {
  // 6-character clean alphanumeric code (avoiding ambiguous letters/digits like 0, O, 1, I)
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

export function parseCookies(cookieHeader = '') {
  const cookies = {};
  if (!cookieHeader) return cookies;
  const items = cookieHeader.split(';');
  for (const item of items) {
    const [name, ...rest] = item.trim().split('=');
    if (name) {
      cookies[name] = decodeURIComponent(rest.join('='));
    }
  }
  return cookies;
}

export function createSessionCookie(token, origin = '', maxAge = SESSION_MAX_AGE_SECONDS) {
  const isSecure = origin.startsWith('https:');
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isSecure ? '; Secure' : ''}`;
}

export function clearSessionCookie(origin = '') {
  const isSecure = origin.startsWith('https:');
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isSecure ? '; Secure' : ''}`;
}

export function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Creates a new session in the database for the given user.
 */
export async function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const hashedToken = hashSessionToken(token);
  const now = Date.now();
  const expiresAt = now + (SESSION_MAX_AGE_SECONDS * 1000);

  await db.run(
    'INSERT INTO classroom_sessions (id, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4)',
    [hashedToken, userId, expiresAt, now]
  );

  return { token, expiresAt };
}

/**
 * Validates session from incoming request and returns authenticated user object.
 */
export async function authenticateUser(request, db) {
  const cookieHeader = request.headers.get('Cookie') || request.headers.get('cookie') || '';
  const cookies = parseCookies(cookieHeader);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;

  const hashedToken = hashSessionToken(token);
  const now = Date.now();

  const session = await db.get(
    `SELECT s.id as session_id, s.user_id, s.expires_at, u.id as user_id, u.email, u.name, u.role
     FROM classroom_sessions s
     JOIN classroom_users u ON s.user_id = u.id
     WHERE s.id = $1 AND s.expires_at > $2`,
    [hashedToken, now]
  );

  if (!session) return null;

  return {
    id: session.user_id,
    email: session.email,
    name: session.name,
    role: session.role
  };
}

/**
 * Removes session on logout.
 */
export async function deleteSession(request, db) {
  const cookieHeader = request.headers.get('Cookie') || request.headers.get('cookie') || '';
  const cookies = parseCookies(cookieHeader);
  const token = cookies[COOKIE_NAME];
  if (!token) return;

  const hashedToken = hashSessionToken(token);
  await db.run('DELETE FROM classroom_sessions WHERE id = $1', [hashedToken]);
}
