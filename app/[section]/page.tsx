import { redirect } from 'next/navigation';
import { getAuthorizedUser } from '@/lib/server/auth-session';
import { notFound } from 'next/navigation';
import { isSection } from '@/lib/navigation';
import AppShell from '@/components/app-shell';
export default async function SectionPage({params}:{params:Promise<{section:string}>}){
 const {section}=await params;
 if(!isSection(section)) notFound();
 const user = await getAuthorizedUser();
 if (!user) redirect('/login');
 return <AppShell section={section}/>;
}
