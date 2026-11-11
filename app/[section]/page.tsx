import { redirect, notFound } from 'next/navigation';
import { getAuthorizedUser } from '@/lib/server/auth-session';
import { isAdministrativeSection, isSection } from '@/lib/navigation';
import AppShell from '@/components/app-shell';

export default async function SectionPage({
 params, searchParams,
}:{
 params:Promise<{section:string}>;
 searchParams:Promise<{painel?:string | string[]}>;
}){
 const {section}=await params;
 if(!isSection(section)) notFound();
 const user=await getAuthorizedUser();
 if(!user) redirect('/login');
 // Acesso negado no servidor, inclusive por URL direta.
 if(isAdministrativeSection(section) && user.role!=='administrador') notFound();
 // Transitorio: ainda nao ha ACL persistente por topico/dashboard.
 // Nao liberar dados de chamadas para gerente somente por possuir o perfil manager.
 if(section==='chamadas' && user.role!=='administrador') notFound();
 const {painel}=await searchParams;
 const callView=section==='chamadas' && painel==='tempos-diarios'?'tempos-diarios':'geral';
 return <AppShell section={section} callView={callView} role={user.role}/>;
}
