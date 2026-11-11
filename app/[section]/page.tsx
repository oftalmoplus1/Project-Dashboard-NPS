import { redirect } from 'next/navigation';
import { getAuthorizedUser } from '@/lib/server/auth-session';
import { notFound } from 'next/navigation';
import { isSection } from '@/lib/navigation';
import AppShell from '@/components/app-shell';
export default async function SectionPage({params,searchParams}:{params:Promise<{section:string}>;searchParams:Promise<{painel?:string | string[]}>}){
 const {section}=await params;
 if(!isSection(section)) notFound();
 const user = await getAuthorizedUser();
 if (!user) redirect('/login');
 const {painel}=await searchParams;
 const callView=section==='chamadas' && painel==='tempos-diarios' ? 'tempos-diarios' : 'geral';
 return <AppShell section={section} callView={callView}/>;
}
