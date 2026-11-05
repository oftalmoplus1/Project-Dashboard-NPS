import 'server-only';
import { getSupabaseServerConfig } from './supabase-config';

export type AuthorizedUser = { id: string; email: string | null; role: 'administrador' | 'gestor' };

/**
 * Verifica o token diretamente no serviço Auth do Supabase self-hosted.
 * Nunca confia no perfil enviado pelo navegador ou em user_metadata.
 * Esta função não libera acesso por si só: cada rota precisa chamá-la.
 */
export async function verifySupabaseUser(accessToken: string): Promise<AuthorizedUser | null> {
  if (!accessToken || accessToken.length > 8192) return null;
  const { url, publishableKey } = getSupabaseServerConfig();
  let response: Response;
  try {
    response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const user: unknown = await response.json().catch(() => null);
  if (!user || typeof user !== 'object' || !('id' in user) || typeof user.id !== 'string') return null;
  const obj = user as { id: string; email?: unknown; app_metadata?: unknown };
  const metadata = obj.app_metadata && typeof obj.app_metadata === 'object'
    ? obj.app_metadata as Record<string, unknown>
    : {};
  const dashboardRole = metadata.dashboard_role;
  const role: AuthorizedUser['role'] | null = dashboardRole === 'admin'
    ? 'administrador'
    : dashboardRole === 'manager' ? 'gestor' : null;
  if (!role) return null;
  return { id: obj.id, email: typeof obj.email === 'string' ? obj.email : null, role };
}
