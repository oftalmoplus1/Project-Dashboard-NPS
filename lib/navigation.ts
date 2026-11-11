import { BarChart3, BellRing, BookOpen, ClipboardList, Database, FolderKanban, LayoutDashboard, MonitorCheck, Settings2, ShieldCheck, Users } from 'lucide-react';

// Etapa 1: manter o painel de chamadas existente como entrada de transicao.
// Na etapa do catalogo persistente, Meus Dashboards passara a listar apenas topicos publicados/autorizados.
export const sections = [
  {slug:'chamadas',label:'Chamadas',icon:BarChart3,group:'Meus Dashboards'},
  {slug:'topicos',label:'Gerenciar tópicos',icon:FolderKanban,group:'Administração'},
  {slug:'dashboards',label:'Gerenciar dashboards',icon:BarChart3,group:'Administração'},
  {slug:'usuarios',label:'Usuários e acessos',icon:Users,group:'Administração'},
  {slug:'fontes',label:'Fontes de dados',icon:Database,group:'Administração'},
  {slug:'monitoramento',label:'Monitoramento',icon:MonitorCheck,group:'Administração'},
  {slug:'alertas',label:'Alertas operacionais',icon:BellRing,group:'Administração'},
  {slug:'operacoes',label:'Operações administrativas',icon:ClipboardList,group:'Administração'},
  {slug:'auditoria',label:'Histórico e auditoria',icon:BookOpen,group:'Administração'},
  {slug:'inicio',label:'Visão geral demonstrativa',icon:LayoutDashboard,group:'Administração'},
  {slug:'configuracoes',label:'Configurações',icon:Settings2,group:'Configurações'},
] as const;

export type Section = (typeof sections)[number]['slug'];
export function isSection(value: string): value is Section {
  return sections.some(section => section.slug === value);
}
export function isAdministrativeSection(section: Section): boolean {
  return sections.some(item => item.slug === section && item.group === 'Administração');
}
export const sectionDescriptions: Record<Section,string> = {
 chamadas:'Indicadores e gráficos de chamadas conectados ao Supabase.',
 topicos:'Organize tópicos, associações e permissões de acesso.',
 dashboards:'Crie e organize dashboards e seus gráficos.',
 usuarios:'Gerencie usuários e permissões por tópico e dashboard.',
 fontes:'Catálogo central de fontes de dados validadas.',
 monitoramento:'Acompanhe verificações e disponibilidade das fontes.',
 alertas:'Investigue ocorrências operacionais e seus diagnósticos.',
 operacoes:'Acompanhe alterações administrativas que exigiram confirmação especial.',
 auditoria:'Histórico administrativo e eventos operacionais.',
 inicio:'Panorama ilustrativo do aplicativo.',
 configuracoes:'Preferências pessoais e, para administradores, configurações globais.'
};
export const otherIcons = {ShieldCheck};
