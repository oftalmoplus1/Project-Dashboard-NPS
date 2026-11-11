/**
 * Registro fechado dos dashboards legados realmente implementados no aplicativo.
 * Cada codigo e persistido uma unica vez no catalogo; os topicos referenciam
 * essa definicao sem duplicar a consulta ou o grafico.
 * Novos graficos do editor visual terao registro/renderer separados em fase futura.
 */
export const existingDashboards = [
  {codigo:'visao-geral-chamadas',nome:'Visão geral de Chamadas',callView:'geral'},
  {codigo:'tma-tme-diario',nome:'TMA e TME diário',callView:'tempos-diarios'},
] as const;

export type ExistingDashboardCode=(typeof existingDashboards)[number]['codigo'];
export type DashboardItem={
 codigo:string;
 nome:string;
 estado:'rascunho'|'publicado';
 posicao:number;
};
export function isExistingDashboardCode(value:unknown):value is ExistingDashboardCode {
 return typeof value==='string' && existingDashboards.some(item=>item.codigo===value);
}
export function isDashboardItem(value:unknown):value is DashboardItem {
 if(!value||typeof value!=='object')return false;
 const item=value as Record<string,unknown>;
 return isExistingDashboardCode(item.codigo)
  && typeof item.nome==='string' && item.nome.length>=1 && item.nome.length<=120
  && (item.estado==='rascunho'||item.estado==='publicado')
  && typeof item.posicao==='number' && Number.isSafeInteger(item.posicao)&&item.posicao>=0;
}
