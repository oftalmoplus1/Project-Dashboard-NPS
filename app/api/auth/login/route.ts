import { NextResponse } from 'next/server';
import { getSupabaseServerConfig } from '@/lib/server/supabase-config';
import { verifySupabaseUser } from '@/lib/server/verify-supabase-user';
import { SESSION_COOKIE } from '@/lib/server/auth-session';

export const runtime = 'nodejs';

// Public origin is explicitly configured for reverse proxies such as Coolify.
// Do not trust arbitrary forwarded hosts as allowed origins.
function getPublicOrigin(request: Request): string {
  const configured = process.env.APP_ORIGIN?.trim();
  if (!configured) return new URL(request.url).origin;
  const parsed = new URL(configured);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password ||
      parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Invalid APP_ORIGIN.');
  }
  return parsed.origin;
}


export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return NextResponse.json({ error: 'Formato inválido.' }, { status: 415 });
  const origin = request.headers.get('origin');
  let publicOrigin: string;
  try { publicOrigin = getPublicOrigin(request); }
  catch { return NextResponse.json({ error: 'Origem publica configurada incorretamente.' }, { status: 503 }); }
  if (origin && origin !== publicOrigin) return NextResponse.json({ error: 'Origem inválida.' }, { status: 403 });
  let credentials: unknown;
  try { credentials = await request.json(); } catch { return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 }); }
  if (!credentials || typeof credentials !== 'object') return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  const { email, password } = credentials as Record<string, unknown>;
  if (typeof email !== 'string' || email.length > 254 || !email.includes('@') || typeof password !== 'string' || password.length < 1 || password.length > 1024) {
    return NextResponse.json({ error: 'Informe e-mail e senha válidos.' }, { status: 400 });
  }
  try {
    const { url, publishableKey } = getSupabaseServerConfig();
    const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return NextResponse.json({ error: 'Credenciais inválidas ou acesso não autorizado.' }, { status: 401 });
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object') return NextResponse.json({ error: 'Resposta de autenticação inválida.' }, { status: 502 });
    const session = payload as { access_token?: unknown; expires_in?: unknown };
    if (typeof session.access_token !== 'string') return NextResponse.json({ error: 'Resposta de autenticação inválida.' }, { status: 502 });
    const user = await verifySupabaseUser(session.access_token);
    if (!user) return NextResponse.json({ error: 'Conta sem permissão para acessar este dashboard.' }, { status: 403 });
    const ttl = typeof session.expires_in === 'number' && Number.isFinite(session.expires_in) ? Math.max(1, Math.min(Math.floor(session.expires_in), 3600)) : 3600;
    const result = NextResponse.json({ ok: true, role: user.role }, { headers: { 'Cache-Control': 'no-store' } });
    result.cookies.set(SESSION_COOKIE, session.access_token, { httpOnly: true, secure: new URL(publicOrigin).protocol === 'https:', sameSite: 'lax', path: '/', maxAge: ttl });
    return result;
  } catch {
    return NextResponse.json({ error: 'Serviço de autenticação indisponível. Tente novamente.' }, { status: 503 });
  }
}
