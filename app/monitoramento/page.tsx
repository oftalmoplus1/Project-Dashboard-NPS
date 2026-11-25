import { redirect } from 'next/navigation';
import { getAuthorizedUser } from '@/lib/server/auth-session';
import MonitoringGallery from '@/components/monitoring-gallery';

export const dynamic = 'force-dynamic';

export default async function MonitoringGalleryPage() {
 if (!await getAuthorizedUser()) redirect('/login');
 return <MonitoringGallery/>;
}
