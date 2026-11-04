import { notFound } from 'next/navigation';
import { isSection } from '@/lib/navigation';
import AppShell from '@/components/app-shell';
export default async function SectionPage({params}:{params:Promise<{section:string}>}){
 const {section}=await params;
 if(!isSection(section)) notFound();
 return <AppShell section={section}/>;
}
