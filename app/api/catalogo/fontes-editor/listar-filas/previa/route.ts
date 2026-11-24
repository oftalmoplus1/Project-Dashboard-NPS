import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/server/auth-session';
import { verifySupabaseUser } from '@/lib/server/verify-supabase-user';
import { fetchValidatedQueueSnapshot, QueueSnapshotDeniedError } from '@/lib/server/validated-queue-snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'private, no-store' };

/**
 * First Fase 2B slice: aggregated, admin-only PREVIEW.
 * It is deliberately NOT an editor query API or a consumer data endpoint.
 * There is no source/column/SQL parameter, no cross-source join and no
 * historic range; the existing restricted LigSim RPC remains authoritative.
 */
export async function GET() {
 const token = (await cookies()).get(SESSION_COOKIE)?.value;
 if (!token) {
  return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401, headers });
 }
 try {
  const user = await verifySupabaseUser(token);
  if (!user || user.role !== 'administrador') {
   return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 403, headers });
  }

  const { rows, summary, sourceUpdatedAt } = await fetchValidatedQueueSnapshot(token);
  let waiting = 0;
  for (const row of rows) {
   waiting += row.waiting;
   if (!Number.isSafeInteger(waiting)) {
    throw new Error('Quantidade em espera fora do limite seguro.');
   }
  }
  return NextResponse.json({
   source: 'listar_filas',
   kind: 'latest_snapshot',
   finalidade: 'previa_administrativa',
   consultedAt: new Date().toISOString(),
   sourceUpdatedAt,
   metrics: {
    received: summary.total,
    answered: summary.answered,
    abandoned: summary.abandoned,
    waiting,
    tmaSeconds: summary.tmaSeconds,
    tmeSeconds: summary.tmeSeconds,
    tmaQueues: summary.tmaQueues,
    tmeQueues: summary.tmeQueues,
   },
   note: 'Última coleta validada; não representa histórico nem total diário garantido. TMA e TME são médias simples entre filas elegíveis.',
  }, { headers });
 } catch (error) {
  if (error instanceof QueueSnapshotDeniedError) {
   return NextResponse.json({ error: 'Acesso a filas negado pelo Supabase.' }, { status: 403, headers });
  }
  return NextResponse.json({ error: 'Prévia indisponível ou dados desatualizados.' }, { status: 503, headers });
 }
}
