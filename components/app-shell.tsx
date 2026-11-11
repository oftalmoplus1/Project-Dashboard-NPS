'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { ChevronDown, CircleHelp, Menu, PanelLeftClose, PanelLeftOpen, Moon, Sun, X, ShieldCheck, Folder } from 'lucide-react';
import { sections, sectionDescriptions, type Section } from '@/lib/navigation';
import SectionContent from './section-content';
import LogoutButton from './logout-button';
import type { DashboardItem } from '@/lib/dashboard-registry';

type TopicView={
 nome:string;
 slug:string;
 dashboards:DashboardItem[];
 activeCode:string|null;
};
type TopicNav={nome:string;slug:string};


export default function AppShell({section,callView='geral',role,topic}:{section:Section;callView?:'geral'|'tempos-diarios';role:'administrador'|'gestor';topic?:TopicView}){
 const pathname=usePathname();
 const [dark,setDark]=useState(false);
 const [themeReady,setThemeReady]=useState(false);
 const [openGroup,setOpenGroup]=useState<string|null>(null);
 const [mobileOpen,setMobileOpen]=useState(false);
 const [sidebarCollapsed,setSidebarCollapsed]=useState(false);
 const [sidebarReady,setSidebarReady]=useState(false);
 const [query,setQuery]=useState('');
 const [topics,setTopics]=useState<TopicNav[]>([]);
 const [topicsLoading,setTopicsLoading]=useState(true);
 useEffect(()=>{setDark(window.localStorage.getItem('dashboard-theme')==='dark');setThemeReady(true)},[]);
 useEffect(()=>{if(!themeReady)return;document.documentElement.dataset.theme=dark?'dark':'light';window.localStorage.setItem('dashboard-theme',dark?'dark':'light')},[dark,themeReady]);
 useEffect(()=>{setOpenGroup(topic?'Meus Dashboards':sections.find(s=>s.slug===section)?.group ?? 'Meus Dashboards')},[section,topic?.slug]);
 useEffect(()=>{
  let live=true;
  async function getTopics(){
   try{
    const response=await fetch('/api/catalogo/topicos',{cache:'no-store'});
    const payload:unknown=await response.json();
    if(!response.ok||!payload||typeof payload!=='object'||!('rows' in payload))return;
    const rows=(payload as {rows?:unknown}).rows;
    if(Array.isArray(rows) && rows.every((r:unknown)=>
      !!r&&typeof r==='object' && typeof (r as TopicNav).slug==='string'
      && typeof (r as TopicNav).nome==='string')){
      if(live)setTopics(rows as TopicNav[]);
    }
   }catch{
    // No fallback permissivo: sem catalogo nao exibir links protegidos.
   }finally{if(live)setTopicsLoading(false);}
  }
  void getTopics();
  return ()=>{live=false;};
 },[pathname]);
 useEffect(()=>{setMobileOpen(false)},[pathname]);
 useEffect(()=>{setSidebarCollapsed(window.localStorage.getItem('dashboard-sidebar-collapsed')==='true');setSidebarReady(true)},[]);
 useEffect(()=>{if(sidebarReady)window.localStorage.setItem('dashboard-sidebar-collapsed',String(sidebarCollapsed))},[sidebarCollapsed,sidebarReady]);
 const active=sections.find(s=>s.slug===section)!;
 const admin=role==='administrador';
 const callsLive = section === 'chamadas';
 const heading=topic?.nome??active.label;
 const headingDescription=topic?'Dashboards associados a este tópico, conforme permissões.':sectionDescriptions[section];
 return <div className={`app-root ${sidebarCollapsed?'sidebar-collapsed':''}`}>
  {mobileOpen && <button className="backdrop" aria-label="Fechar menu" onClick={()=>setMobileOpen(false)}/>}
  <aside className={`sidebar ${mobileOpen?'sidebar-open':''}`} aria-label="Navegação principal">
   <div className="brand"><div className="brand-mark"><Image src="/logo-empresa.png" width={48} height={48} alt="Logomarca da empresa" priority/></div><div className="brand-copy"><strong>dashboard<span>_tools</span></strong><small>Business intelligence</small></div><button type="button" className="icon-button desktop-collapse" title={sidebarCollapsed?'Expandir menu lateral':'Recolher menu lateral'} aria-label={sidebarCollapsed?'Expandir menu lateral':'Recolher menu lateral'} aria-expanded={!sidebarCollapsed} onClick={()=>setSidebarCollapsed(v=>!v)}>{sidebarCollapsed?<PanelLeftOpen size={19}/>:<PanelLeftClose size={19}/>}</button><button className="mobile-close icon-button" aria-label="Fechar menu" onClick={()=>setMobileOpen(false)}><X size={18}/></button></div>
   <div className="workspace-label"><span className="workspace-icon">D</span><div className="workspace-copy"><strong>Ambiente corporativo</strong><small>{callsLive ? 'Indicadores conectados' : 'Espaço de demonstração'}</small></div><ChevronDown size={15}/></div>
   <nav className="side-nav" aria-label="Categorias">
    {(['Meus Dashboards','Administração'] as const).filter(group=>group!=='Administração'||admin).map(group=>{
      const expanded=openGroup===group;
      const items=group==='Administração'?sections.filter(item=>item.group===group):[];
      return <div className="nav-group accordion-group" key={group}>
        <button type="button" title={group} className={`accordion-trigger ${expanded?'expanded':''}`} aria-expanded={expanded} aria-controls={`nav-group-${group}`} onClick={()=>setOpenGroup(expanded?null:group)}>
          <span>{group}</span><ChevronDown size={16} aria-hidden="true"/>
        </button>
        <div id={`nav-group-${group}`} className={`accordion-panel ${expanded?'expanded':''}`} inert={!expanded}>
          <div className="accordion-panel-inner">
            {group==='Meus Dashboards' && topicsLoading && <span className="nav-no-access">Carregando tópicos...</span>}
            {group==='Meus Dashboards' && !topicsLoading && topics.length===0 && <span className="nav-no-access">Nenhum tópico autorizado.</span>}
            {group==='Meus Dashboards' && topics.map(t=><Link
              key={t.slug} href={`/meus-dashboards/${t.slug}`} title={t.nome}
              className={`nav-item nav-topic-item ${topic?.slug===t.slug?'active':''}`}
              aria-current={topic?.slug===t.slug?'page':undefined}>
              <Folder size={18} strokeWidth={1.9}/><span className="nav-item-label">{t.nome}</span>
             </Link>)}
            {items.map(item=>{const Icon=item.icon;return <Link key={item.slug} href={`/${item.slug}`} title={item.label} className={`nav-item ${section===item.slug?'active':''}`} aria-current={section===item.slug?'page':undefined}><Icon size={18} strokeWidth={1.9}/><span className="nav-item-label">{item.label}</span></Link>})}
          </div>
        </div>
      </div>
    })}
    <Link href="/configuracoes" title="Configurações" className={`nav-item settings-direct-link ${section==='configuracoes'?'active':''}`} aria-current={section==='configuracoes'?'page':undefined}><span className="nav-settings-icon">{(() => { const Icon=sections.find(s=>s.slug==='configuracoes')!.icon;return <Icon size={18} strokeWidth={1.9}/> })()}</span><span className="nav-item-label">Configurações</span></Link>
   </nav>
   <div className="sidebar-bottom"><div className="demo-flag"><ShieldCheck size={17}/><span className="sidebar-detail">{callsLive ? 'Chamadas · dados reais' : 'Ambiente visual de demonstração'}<br/><small>{callsLive ? 'Indicadores agregados do Supabase' : 'Sem conexão com dados reais'}</small></span></div><div className="account"><div className="avatar">AD</div><div className="sidebar-detail"><strong>{callsLive ? 'Usuário autenticado' : 'Usuário'}</strong><small>{callsLive ? 'Acesso autorizado' : 'Sessão autenticada'}</small></div><ChevronDown size={16}/></div></div>
  </aside>
  <div className="main-column"><header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Abrir menu" onClick={()=>setMobileOpen(true)}><Menu size={21}/></button><span className="breadcrumb">dashboard_tools</span><span className="crumb-sep">/</span><strong>{heading}</strong></div><div className="top-actions"><span className="demo-pill">Protótipo · Fase 1</span><button className="icon-button" aria-label={dark?'Ativar tema claro':'Ativar tema escuro'} onClick={()=>setDark(!dark)}>{dark?<Sun size={19}/>:<Moon size={19}/>}</button><span className="top-avatar">AD</span><LogoutButton/></div></header>
   <main className="main-content"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot"/> VISÃO CORPORATIVA</div><h1>{heading}</h1><p>{headingDescription}</p></div><div className="heading-actions"><button className="outline-button" onClick={()=>window.alert('Esta é uma demonstração visual. A ajuda contextual será implementada em uma fase futura.')}><CircleHelp size={16}/> Sobre a fase 1</button></div></div>
   {topic ? <nav className="category-slider" aria-label={`Dashboards do tópico ${topic.nome}`}>
      {topic.dashboards.map(d=><Link
       key={d.codigo} href={`/meus-dashboards/${topic.slug}?dashboard=${d.codigo}`}
       className={`category-slide ${topic.activeCode===d.codigo?'active':''}`}
       aria-current={topic.activeCode===d.codigo?'page':undefined}>{d.nome}</Link>)}
     </nav>
    :section==='chamadas' && <nav className="category-slider" aria-label="Dashboards de Visão Geral de Chamadas">
     <Link href="/chamadas" className={`category-slide ${callView==='geral'?'active':''}`} aria-current={callView==='geral'?'page':undefined}>Chamadas</Link>
     <Link href="/chamadas?painel=tempos-diarios" className={`category-slide ${callView==='tempos-diarios'?'active':''}`} aria-current={callView==='tempos-diarios'?'page':undefined}>TMA e TME diário</Link>
    </nav>}
   
   {section==='configuracoes' ? <section className="panel settings-panel" aria-label="Preferências pessoais">
     <div className="panel-head"><div><h2>Minhas preferências</h2><p>Personalize sua experiência sem alterar o ambiente de outros usuários.</p></div></div>
     <div className="settings-body"><div><strong>Tema da interface</strong><p>Escolha o modo claro ou escuro. A preferência é mantida neste navegador.</p></div><div className="settings-theme-actions"><button type="button" className={`outline-button ${!dark?'selected-theme':''}`} aria-pressed={!dark} onClick={()=>setDark(false)}><Sun size={16}/> Claro</button><button type="button" className={`outline-button ${dark?'selected-theme':''}`} aria-pressed={dark} onClick={()=>setDark(true)}><Moon size={16}/> Escuro</button></div></div>
     {admin && <div className="settings-body"><div><strong>Configurações globais</strong><p>Área reservada aos administradores. Alterações globais estarão disponíveis após definição e validação dos parâmetros persistentes.</p></div><span className="phase-tag">Planejado</span></div>}
   </section> : topic?.dashboards.length===0 ? <section className="panel topic-empty-panel"><h2>Nenhum dashboard associado</h2><p>Vincule dashboards a este tópico pela Administração para habilitar o menu slider.</p></section> : <SectionContent section={section} callView={callView} query={query} setQuery={setQuery}/>}

   <footer className="footer"><span>dashboard_tools · Identidade visual v4.60</span><span>{callsLive ? 'Chamadas · indicadores reais agregados' : 'Fase 1 — Estrutura e interface · Sem dados reais'}</span></footer>
   </main>
  </div>
 </div>
}
