import { BarChart3, BellRing, BookOpen, ClipboardList, Database, LayoutDashboard, MonitorCheck, Settings2, ShieldCheck, Users } from 'lucide-react';
export const sections = [
  {slug:'inicio',label:'Visão geral',icon:LayoutDashboard,group:'Workspace'},
  {slug:'chamadas',label:'Visão Geral de Chamadas',icon:BarChart3,group:'Workspace'},
  {slug:'dashboards',label:'Dashboards',icon:BarChart3,group:'Workspace'},
  {slug:'fontes',label:'Fontes de dados',icon:Database,group:'Administração'},
  {slug:'monitoramento',label:'Monitoramento',icon:MonitorCheck,group:'Administração'},
  {slug:'alertas',label:'Alertas operacionais',icon:BellRing,group:'Administração'},
  {slug:'operacoes',label:'Operações administrativas',icon:ClipboardList,group:'Administração'},
  {slug:'usuarios',label:'Usuários e acessos',icon:Users,group:'Administração'},
  {slug:'auditoria',label:'Histórico e auditoria',icon:BookOpen,group:'Administração'},
  {slug:'configuracoes',label:'Configurações',icon:Settings2,group:'Sistema'},
] as const;
export type Section = (typeof sections)[number]['slug'];
export function isSection(value: string): value is Section { return sections.some(s => s.slug === value); }
export const sectionDescriptions: Record<Section,string> = {
 inicio:'Panorama do ambiente e acesso rápido aos módulos.',
 chamadas:'Indicadores, evolução temporal e tabela agregada de chamadas recebidas (demonstração).',
 dashboards:'Organize, publique e consulte dashboards autorizados.',
 fontes:'Catálogo central de fontes de dados e importações.',
 monitoramento:'Acompanhe verificações e disponibilidade de fontes.',
 alertas:'Investigue ocorrências operacionais e seus diagnósticos.',
 operacoes:'Acompanhe alterações administrativas que exigiram confirmação especial.',
 usuarios:'Convites, perfis e permissões de acesso.',
 auditoria:'Histórico administrativo e eventos operacionais.',
 configuracoes:'Preferências gerais e identidade visual do aplicativo.'
};
export const otherIcons = {ShieldCheck};
