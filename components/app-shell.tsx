'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { ChevronDown, CircleHelp, Menu, Moon, Sun, X, ShieldCheck } from 'lucide-react';
import { sections, sectionDescriptions, type Section } from '@/lib/navigation';
import SectionContent from './section-content';
import LogoutButton from './logout-button';

export default function AppShell({section}:{section:Section}){
 const pathname=usePathname();
 const [dark,setDark]=useState(false);
 const [mobileOpen,setMobileOpen]=useState(false);
 const [query,setQuery]=useState('');
 useEffect(()=>{setDark(window.localStorage.getItem('dashboard-theme')==='dark')},[]);
 useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';window.localStorage.setItem('dashboard-theme',dark?'dark':'light')},[dark]);
 useEffect(()=>{setMobileOpen(false)},[pathname]);
 const active=sections.find(s=>s.slug===section)!;
 const callsLive = section === 'chamadas';
 return <div className="app-root">
  {mobileOpen && <button className="backdrop" aria-label="Fechar menu" onClick={()=>setMobileOpen(false)}/>}
  <aside className={`sidebar ${mobileOpen?'sidebar-open':''}`} aria-label="Navegação principal">
   <div className="brand"><div className="brand-mark"><Image src="/logo-empresa.png" width={48} height={48} alt="Logomarca da empresa" priority/></div><div><strong>dashboard<span>_tools</span></strong><small>Business intelligence</small></div><button className="mobile-close icon-button" aria-label="Fechar menu" onClick={()=>setMobileOpen(false)}><X size={18}/></button></div>
   <div className="workspace-label"><span className="workspace-icon">D</span><div><strong>Ambiente corporativo</strong><small>{callsLive ? 'Indicadores conectados' : 'Espaço de demonstração'}</small></div><ChevronDown size={15}/></div>
   <nav className="side-nav">
    {(['Workspace','Administração','Sistema'] as const).map(group=><div className="nav-group" key={group}><div className="nav-group-label">{group}</div>{sections.filter(s=>s.group===group).map(item=>{const Icon=item.icon;return <Link key={item.slug} href={`/${item.slug}`} className={`nav-item ${section===item.slug?'active':''}`} aria-current={section===item.slug?'page':undefined}><Icon size={18} strokeWidth={1.9}/><span>{item.label}</span>{item.slug==='operacoes'&&<span className="nav-count" title="Demonstração, não dados reais">2</span>}{item.slug==='alertas'&&<span className="nav-alert" title="Demonstração, não dados reais">4</span>}</Link>})}</div>)}
   </nav>
   <div className="sidebar-bottom"><div className="demo-flag"><ShieldCheck size={17}/><span>{callsLive ? 'Chamadas · dados reais' : 'Ambiente visual de demonstração'}<br/><small>{callsLive ? 'Indicadores agregados do Supabase' : 'Sem conexão com dados reais'}</small></span></div><div className="account"><div className="avatar">AD</div><div><strong>{callsLive ? 'Usuário autenticado' : 'Administrador demo'}</strong><small>{callsLive ? 'Acesso autorizado' : 'Perfil ilustrativo'}</small></div><ChevronDown size={16}/></div></div>
  </aside>
  <div className="main-column"><header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Abrir menu" onClick={()=>setMobileOpen(true)}><Menu size={21}/></button><span className="breadcrumb">dashboard_tools</span><span className="crumb-sep">/</span><strong>{active.label}</strong></div><div className="top-actions"><span className="demo-pill">Protótipo · Fase 1</span><button className="icon-button" aria-label={dark?'Ativar tema claro':'Ativar tema escuro'} onClick={()=>setDark(!dark)}>{dark?<Sun size={19}/>:<Moon size={19}/>}</button><span className="top-avatar">AD</span><LogoutButton/></div></header>
   <main className="main-content"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot"/> VISÃO CORPORATIVA</div><h1>{active.label}</h1><p>{sectionDescriptions[section]}</p></div><div className="heading-actions"><button className="outline-button" onClick={()=>window.alert('Esta é uma demonstração visual. A ajuda contextual será implementada em uma fase futura.')}><CircleHelp size={16}/> Sobre a fase 1</button></div></div>
   <SectionContent section={section} query={query} setQuery={setQuery}/>
   <footer className="footer"><span>dashboard_tools · Identidade visual v4.60</span><span>{callsLive ? 'Chamadas · indicadores reais agregados' : 'Fase 1 — Estrutura e interface · Sem dados reais'}</span></footer>
   </main>
  </div>
 </div>
}
