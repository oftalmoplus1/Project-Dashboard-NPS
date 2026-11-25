import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getAuthorizedUser, SESSION_COOKIE } from '@/lib/server/auth-session';
import { monitoramentoRpc } from '@/lib/server/monitoramento-rpc';
import { parsePublishedDashboard } from '@/lib/monitoramento-contract';
import MonitoringDisplay from '@/components/monitoring-display';

export const dynamic = 'force-dynamic';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Authorize on the SERVER before delivering the dashboard route.
 * The client still rechecks every 30 seconds to react to revocation.
 */
export default async function MonitoringDashboardPage({ params }: { params: Promise<{ id: string }> }) {
 if (!await getAuthorizedUser()) redirect('/login');
 const { id } = await params;
 if (!uuid.test(id)) notFound();
 const token = (await cookies()).get(SESSION_COOKIE)?.value;
 if (!token) redirect('/login');

 let status: 'allowed' | 'denied' | 'unavailable' = 'unavailable';
 try {
  const response = await monitoramentoRpc(token, 'dashboard_monitoramento_obter', { p_dashboard_id: id });
  if (response.ok) {
   const payload: unknown = await response.json();
   status = Array.isArray(payload) && payload.length === 1
    && parsePublishedDashboard(payload[0])?.dashboard_id === id ? 'allowed' : 'unavailable';
  } else {
   const body: unknown = await response.json().catch(() => null);
   const code = body && typeof body === 'object' && 'code' in body ? body.code : null;
   status = response.status === 401 || response.status === 403
    || code === 'P0002' || code === '42501' ? 'denied' : 'unavailable';
  }
 } catch { /* API indisponível, não permitir exibir qualquer snapshot */ }

 if (status === 'denied') notFound();
 if (status === 'unavailable') return <main role="alert" style={{ padding: 32 }}>
  Não foi possível confirmar a publicação e suas permissões. Tente novamente pela galeria.
 </main>;
 return <MonitoringDisplay id={id}/>;
}
