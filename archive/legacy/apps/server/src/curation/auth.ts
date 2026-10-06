import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import type { AdminSession } from '@mirrorn/shared';

export interface Credential {
  username: string;
  salt: string;
  digest: string;
}
const SESSION_MS = 8 * 60 * 60 * 1000;
const key = (token: string) => createHash('sha256').update(token).digest('hex');
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, (error, result) => (error ? reject(error) : resolve(result))),
  );
}
export async function makeCredential(username: string, password: string): Promise<Credential> {
  if (!username.trim() || username.length > 80 || password.length < 12 || password.length > 256)
    throw new Error('用户名不能为空，密码需要12到256个字符');
  const salt = randomBytes(32).toString('hex');
  return {
    username: username.trim(),
    salt,
    digest: (await derive(password, salt)).toString('hex'),
  };
}
export async function verifyCredential(
  credential: Credential | undefined,
  username: string,
  password: string,
) {
  const digest = await derive(password, credential?.salt ?? 'mirrorn-invalid-user');
  const expected = Buffer.from(credential?.digest ?? '00'.repeat(64), 'hex');
  return (
    expected.length === digest.length &&
    timingSafeEqual(expected, digest) &&
    credential?.username === username
  );
}
export class AdminSessions {
  private sessions = new Map<
    string,
    AdminSession & { credentialDigest: string; requests: number; window: number }
  >();
  private attempts = { window: 0, count: 0 };
  allowLogin() {
    const now = Date.now();
    this.attempts =
      now - this.attempts.window > 60000
        ? { window: now, count: 1 }
        : { ...this.attempts, count: this.attempts.count + 1 };
    return this.attempts.count <= 10;
  }
  create(credential: Credential) {
    const now = Date.now();
    this.sessions = new Map([...this.sessions].filter(([, session]) => session.expiresAt > now));
    if (this.sessions.size >= 100) this.sessions = new Map([...this.sessions].slice(-99));
    const token = randomBytes(32).toString('hex');
    const session = {
      username: credential.username,
      csrf: randomBytes(32).toString('hex'),
      expiresAt: now + SESSION_MS,
    };
    this.sessions.set(key(token), {
      ...session,
      credentialDigest: credential.digest,
      window: now,
      requests: 0,
    });
    return { token, session, maxAge: SESSION_MS / 1000 };
  }
  get(token: string | undefined, credential: Credential | undefined): AdminSession | undefined {
    if (!token || !credential || token.length > 128) return undefined;
    const session = this.sessions.get(key(token));
    if (
      !session ||
      session.expiresAt <= Date.now() ||
      session.credentialDigest !== credential.digest
    )
      return undefined;
    return { username: session.username, csrf: session.csrf, expiresAt: session.expiresAt };
  }
  allowRequest(token: string) {
    const id = key(token);
    const session = this.sessions.get(id);
    if (!session) return false;
    const next =
      Date.now() - session.window > 60000
        ? { ...session, requests: 1, window: Date.now() }
        : { ...session, requests: session.requests + 1 };
    this.sessions.set(id, next);
    return next.requests <= 120;
  }
  revoke(token: string | undefined) {
    if (token) this.sessions.delete(key(token));
  }
}
