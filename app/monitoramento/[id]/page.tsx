import { notFound, redirect } from 'next/navigation';
import { getAuthorizedUser } from '@/lib/server/auth-session';
import MonitoringDisplay from '@/components/monitoring-display';

export const dynamic = 'force-dynamic';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MonitoringDashboardPage({ params }: { params: Promise<{ id: string }> }) {
 if (!await getAuthorizedUser()) redirect('/login');
 const { id } = await params;
 if (!uuid.test(id)) notFound();
 return <MonitoringDisplay id={id}/>;
}
