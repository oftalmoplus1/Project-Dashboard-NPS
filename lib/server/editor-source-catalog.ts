import 'server-only';

/**
 * Candidatos verificáveis no inventário de 24/11/2026.
 *
 * NÃO é um executor de consultas. Nenhuma relação, coluna, agregação,
 * filtro, intervalo temporal ou métrica é autorizada automaticamente
 * por aparecer aqui. A aprovação técnica de consultas/RPCs e ACL
 * contextual pertencerá a outra entrega.
 */
type Candidate = {
 id: string;
 nome: string;
 unidade: 'contagem' | 'duracao';
 situacao: 'em_analise';
 observacao: string;
};
type Dimension = { id: string; nome: string };
export type EditorSource = {
 id: 'listar_filas' | 'relatorio_chamadas';
 nome: string;
 origem: string;
 natureza: 'fotografia_atual' | 'historico_de_eventos';
 descricao: string;
 politicaTemporal: string;
 referenciaTemporal: string;
 fuso: 'America/Sao_Paulo';
 consultasHabilitadas: false;
 indicadoresCandidatos: Candidate[];
 dimensoesCandidatas: Dimension[];
 avisos: string[];
};

const rows: readonly EditorSource[] = [
 {
  id: 'listar_filas',
  nome: 'Filas de atendimento',
  origem: 'public.listar_filas',
  natureza: 'fotografia_atual',
  descricao: 'Informações da última coleta disponível, agrupáveis por fila após homologação da semântica.',
  politicaTemporal: 'Somente fotografia atual; não produz histórico de chamadas.',
  referenciaTemporal: 'updated_at (atualização do registro, não data de chamada)',
  fuso: 'America/Sao_Paulo',
  consultasHabilitadas: false,
  indicadoresCandidatos: [
   { id: 'received', nome: 'Recebidas', unidade: 'contagem', situacao: 'em_analise', observacao: 'Verificar se o contador é acumulativo e o período de reinício.' },
   { id: 'answered', nome: 'Atendidas', unidade: 'contagem', situacao: 'em_analise', observacao: 'Confirmar definição e relação com recebidas.' },
   { id: 'waiting_calls', nome: 'Em espera', unidade: 'contagem', situacao: 'em_analise', observacao: 'Medida pontual; não somar entre coletas.' },
   { id: 'abandon_less_30s', nome: 'Abandono até 30s', unidade: 'contagem', situacao: 'em_analise', observacao: 'Revisar convenção da fonte no limite de 30 segundos.' },
   { id: 'abandon_more_30s', nome: 'Abandono acima de 30s', unidade: 'contagem', situacao: 'em_analise', observacao: 'Revisar semântica do período informado pela fonte.' },
   { id: 'tma', nome: 'TMA', unidade: 'duracao', situacao: 'em_analise', observacao: 'Banco armazena time without time zone; tratar como duração, não horário.' },
   { id: 'tme', nome: 'TME', unidade: 'duracao', situacao: 'em_analise', observacao: 'Banco armazena time without time zone; tratar como duração, não horário.' }
  ],
  dimensoesCandidatas: [{ id: 'name', nome: 'Fila' }],
  avisos: [
   'A tabela é mutável e não contém histórico de snapshots aprovado.',
   'Agregações entre filas, taxas e médias ainda exigem validação semântica.',
   'Campos como member não serão expostos por este catálogo.'
  ]
 },
 {
  id: 'relatorio_chamadas',
  nome: 'Relatório histórico de chamadas',
  origem: 'public.relatorio_chamadas',
  natureza: 'historico_de_eventos',
  descricao: 'Registros históricos para indicadores agregados após revisão da consulta e do isolamento de dados.',
  politicaTemporal: 'Intervalos por data fixa ou relativa podem ser suportados após validação no servidor.',
  referenciaTemporal: 'init_time (timestamp com fuso horário)',
  fuso: 'America/Sao_Paulo',
  consultasHabilitadas: false,
  indicadoresCandidatos: [
   { id: 'quantidade_chamadas', nome: 'Quantidade de chamadas', unidade: 'contagem', situacao: 'em_analise', observacao: 'Contagem dos registros autorizados; verificar duplicidade e semântica dos eventos.' }
  ],
  dimensoesCandidatas: [
   { id: 'disposition', nome: 'Situação da chamada' },
   { id: 'call_direction', nome: 'Direção da chamada' },
   { id: 'queuename', nome: 'Fila' }
  ],
  avisos: [
   'Não expor registros, identificadores telefônicos ou nomes de agentes.',
   'Campos src, dst, agent_name e dstchannel estão fora desta lista.',
   'ta e tet ainda precisam de homologação da semântica antes de qualquer KPI.'
  ]
 }
];

export function getEditorSourceCatalog(): EditorSource[] {
 return rows.map(source => ({
  ...source,
  indicadoresCandidatos: source.indicadoresCandidatos.map(item => ({ ...item })),
  dimensoesCandidatas: source.dimensoesCandidatas.map(item => ({ ...item })),
  avisos: [...source.avisos]
 }));
}
