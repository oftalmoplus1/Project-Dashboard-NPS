import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/server/auth-session';
import { verifySupabaseUser } from '@/lib/server/verify-supabase-user';
import { fetchValidatedQueueSnapshot, QueueSnapshotDeniedError } from '@/lib/server/validated-queue-snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

/** Admin-only RPC: no raw table grants, no service_role and no agent/member data. */
export async function GET() {
 const token = (await cookies()).get(SESSION_COOKIE)?.value;
 if (!token) return NextResponse.json({ error: 'Sessao necessaria.' }, { status: 401, headers });
 try {
  const user = await verifySupabaseUser(token);
  if (!user || user.role !== 'administrador') {
   return NextResponse.json({ error: 'Acesso nao autorizado.' }, { status: 403, headers });
  }
  const parsed = await fetchValidatedQueueSnapshot(token);
  return NextResponse.json({
   ...parsed, source: 'listar_filas', kind: 'latest_snapshot',
   consultedAt: new Date().toISOString(),
   note: 'Contadores da ultima coleta validada, sem historico horario.',
  }, { headers });
 } catch (error) {
  if (error instanceof QueueSnapshotDeniedError) {
   return NextResponse.json({ error: 'Acesso a filas negado pelo Supabase.' }, { status: 403, headers });
  }
  return NextResponse.json({
   error: 'Nao foi possivel validar os dados atuais das filas.',
  }, { status: 503, headers });
 }
}
