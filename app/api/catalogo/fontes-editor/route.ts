import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/server/auth-session';
import { verifySupabaseUser } from '@/lib/server/verify-supabase-user';
import { getEditorSourceCatalog } from '@/lib/server/editor-source-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

/**
 * Somente metadados revisados. Nao executa consultas sobre tabelas/RPCs
 * operacionais, nao permite SQL dinamico e nao altera o banco.
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
  return NextResponse.json({
   rows: getEditorSourceCatalog(),
   consultasHabilitadas: false,
   aviso: 'Inventário de campos candidatos; nenhum acesso a consultas foi autorizado.'
  }, { headers });
 } catch {
  return NextResponse.json({ error: 'Não foi possível carregar o catálogo de fontes.' }, { status: 503, headers });
 }
}
