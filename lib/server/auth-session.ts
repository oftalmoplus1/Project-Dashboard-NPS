import 'server-only';
import { cookies } from 'next/headers';
import { verifySupabaseUser } from './verify-supabase-user';

export const SESSION_COOKIE = 'dashboard_tools_access_token';

export async function getAuthorizedUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySupabaseUser(token);
}
