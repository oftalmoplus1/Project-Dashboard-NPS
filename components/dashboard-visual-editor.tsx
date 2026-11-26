'use client';

import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from 'react';
import Link from 'next/link';
import {
 ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BarChart3, Eye, GripVertical,
 LayoutDashboard, LineChart, Maximize2, Plus, Redo2, Save, ShieldCheck,
 Table2, Trash2, Type, Undo2, type LucideIcon,
} from 'lucide-react';
import {
 addVisualBlock, EDITOR_COLUMNS, EDITOR_MAX_BLOCKS, moveVisualBlock, resizeVisualBlock,
 setVisualBlock, validLayout, VISUAL_COMPONENTS, type VisualBlock,
 type VisualKind, type VisualSource,
} from '@/lib/editor-visual-layout';
import styles from './dashboard-visual-editor.module.css';
import { useEditorDraftAutosave } from './use-editor-draft-autosave';
import { useEditorQueueSnapshot, type SnapshotPreviewState } from './use-editor-queue-snapshot';
import EditorQueueSnapshotBlock from './editor-queue-snapshot-block';
import { DEFAULT_QUEUE_SETTINGS, type QueueViewSettings, type QueueSortField, type QueueLimit } from '@/lib/editor-queue-settings';

type DashboardInfo = { id: string; nome: string; topicoNome: string };
type Dragged = { mode: 'new'; kind: VisualKind } | { mode: 'move'; id: string };
type ResizeSession = {
 id: string;
 startClientX: number; startClientY: number; startW: number; startH: number;
 before: VisualBlock[];
};

const icons: Record<VisualKind, LucideIcon> = {
 kpi: LayoutDashboard,
 line: LineChart,
 bar: BarChart3,
 area: LineChart,
 pie: BarChart3,
 donut: BarChart3,
 table: Table2,
 text: Type,
};

const allowedMetrics: Record<Exclude<VisualSource, null>, ReadonlyArray<{ id: string; label: string; disabled?: boolean }>> = {
 listar_filas: [
  { id: 'received', label: 'Chamadas recebidas' },
  { id: 'answered', label: 'Chamadas atendidas' },
  { id: 'abandoned', label: 'Chamadas abandonadas (todas)' },
  { id: 'waiting_calls', label: 'Legado: em espera', disabled: true },
  { id: 'abandon_less_30s', label: 'Legado: abandonos até 30 s', disabled: true },
  { id: 'abandon_more_30s', label: 'Legado: abandonos acima de 30 s', disabled: true },
  { id: 'tma', label: 'Legado: TMA', disabled: true },
  { id: 'tme', label: 'Legado: TME', disabled: true },
 ],
 relatorio_chamadas: [
  { id: 'quantidade_chamadas', label: 'Quantidade de chamadas' },
 ],
};

const sourceNames: Record<Exclude<VisualSource, null>, string> = {
 listar_filas: 'Filas (última coleta)',
 relatorio_chamadas: 'Relatório de chamadas',
};

const MAX_UNDO = 50;
const GRID_ROW = 74;

function unchanged(a: readonly VisualBlock[], b: readonly VisualBlock[]) {
 return JSON.stringify(a) === JSON.stringify(b);
}

function BlockContent({ block, snapshot }: { block: VisualBlock; snapshot: SnapshotPreviewState }) {
 const Icon = icons[block.kind];
 if (block.kind === 'text') {
  return <p className={styles.textContent}>
   {block.text.trim() || 'Selecione este bloco para escrever uma anotação no painel de propriedades.'}
  </p>;
 }
 if (block.source === 'listar_filas') {
  if (block.metric && !['received','answered','abandoned'].includes(block.metric)) {
   return <p className={styles.snapshotMessage}>Indicador legado sem prévia nesta fase. Selecione as três métricas, recebidas ou atendidas.</p>;
  }
  return <EditorQueueSnapshotBlock block={block} snapshot={snapshot}/>;
 }
 return <div className={styles.placeholder} aria-label={block.kind + ' ainda sem dados'}>
  <Icon size={block.kind === 'kpi' ? 26 : 34} strokeWidth={1.4} aria-hidden="true" />
  <span>{block.source ? 'Fonte candidata: ' + sourceNames[block.source] : 'Nenhuma fonte selecionada'}</span>
  <small>Sem dados reais nesta etapa. Não há consulta ou publicação habilitada.</small>
 </div>;
}

/**
 * Fase 3B: config drafts only. Server confirms every save and never publishes.
 */
export default function DashboardVisualEditor({ dashboard }: { dashboard: DashboardInfo }) {
 const [blocks, setBlocks] = useState<VisualBlock[]>([]);
 const [past, setPast] = useState<VisualBlock[][]>([]);
 const [future, setFuture] = useState<VisualBlock[][]>([]);
 const [selectedId, setSelectedId] = useState<string | null>(null);
 const [preview, setPreview] = useState(false);
 const [feedback, setFeedback] = useState('');
 const canvasRef = useRef<HTMLDivElement>(null);
 const dragged = useRef<Dragged | null>(null);
 const resizeSession = useRef<ResizeSession | null>(null);
 const nextLocalId = useRef(0);
 const blocksRef = useRef(blocks);
 blocksRef.current = blocks;

 const autosave = useEditorDraftAutosave(dashboard.id, blocks, loaded => {
  blocksRef.current = loaded;
  setBlocks(loaded);
  setPast([]);
  setFuture([]);
  setSelectedId(null);
  nextLocalId.current = 0;
 });
 const selected = useMemo(() => blocks.find(block => block.id === selectedId) ?? null, [blocks, selectedId]);
 const snapshotEnabled = autosave.status !== 'loading' && blocks.some(block =>
  block.source === 'listar_filas' && ['kpi','table','bar'].includes(block.kind)
  && (block.metric === '' || ['received','answered','abandoned'].includes(block.metric)));
 const queueSnapshot = useEditorQueueSnapshot(snapshotEnabled);

 useEffect(() => {
  if (!autosave.dirty && autosave.status !== 'saving') return;
  const warn = (event: BeforeUnloadEvent) => {
   event.preventDefault();
   event.returnValue = '';
  };
  window.addEventListener('beforeunload', warn);
  return () => window.removeEventListener('beforeunload', warn);
 }, [autosave.dirty, autosave.status]);

 function commit(next: VisualBlock[]) {
  if (!autosave.editable || unchanged(blocksRef.current, next) || !validLayout(next)) return;
  const before = blocksRef.current;
  setPast(previous => [...previous, before].slice(-MAX_UNDO));
  blocksRef.current = next;
  setBlocks(next);
  setFuture([]);
  setFeedback('');
 }

 function add(kind: VisualKind, x?: number, y?: number) {
  if (!autosave.editable || preview) return;
  if (blocksRef.current.length >= EDITOR_MAX_BLOCKS) {
   setFeedback('Limite de 40 componentes por dashboard nesta etapa.');
   return;
  }
  // Identificadores somente locais: nao dependem de Web Crypto/HTTPS.
  const id = 'local-' + Date.now() + '-' + (++nextLocalId.current);
  const next = addVisualBlock(blocksRef.current, kind, id, x, y);
  if (next.length === blocksRef.current.length) {
   setFeedback('Não há espaço disponível na grade para este componente.');
   return;
  }
  commit(next);
  setSelectedId(id);
 }

 function revert() {
  if (!autosave.editable) return;
  const previous = past.at(-1);
  if (!previous) return;
  const before = blocksRef.current;
  setFuture(next => [before, ...next].slice(0, MAX_UNDO));
  blocksRef.current = previous;
  setBlocks(previous);
  setPast(next => next.slice(0, -1));
  setSelectedId(current => previous.some(block => block.id === current) ? current : null);
 }

 function replay() {
  if (!autosave.editable) return;
  const next = future[0];
  if (!next) return;
  const before = blocksRef.current;
  setPast(previous => [...previous, before].slice(-MAX_UNDO));
  blocksRef.current = next;
  setBlocks(next);
  setFuture(previous => previous.slice(1));
  setSelectedId(current => next.some(block => block.id === current) ? current : null);
 }

 function gridCoordinate(event: DragEvent<HTMLDivElement>): { x: number; y: number } {
  const rect = canvasRef.current?.getBoundingClientRect();
  if (!rect) return { x: 0, y: 0 };
  const x = Math.max(0, Math.min(EDITOR_COLUMNS - 1,
   Math.floor((event.clientX - rect.left) / (rect.width / EDITOR_COLUMNS))));
  const y = Math.max(0, Math.floor((event.clientY - rect.top) / GRID_ROW));
  return { x, y };
 }

 function drop(event: DragEvent<HTMLDivElement>) {
  event.preventDefault();
  if (preview || !autosave.editable || !dragged.current) return;
  const location = gridCoordinate(event);
  const subject = dragged.current;
  dragged.current = null;
  if (subject.mode === 'new') add(subject.kind, location.x, location.y);
  else {
   const target = blocksRef.current.find(block => block.id === subject.id);
   if (!target) return;
   commit(moveVisualBlock(blocksRef.current, target.id, location.x, location.y));
   setSelectedId(target.id);
  }
 }

 function startResize(event: PointerEvent<HTMLButtonElement>, block: VisualBlock) {
  if (preview || !autosave.editable) return;
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.setPointerCapture(event.pointerId);
  resizeSession.current = {
   id: block.id, before: blocksRef.current,
   startClientX: event.clientX, startClientY: event.clientY,
   startW: block.w, startH: block.h,
  };
 }

 function resize(event: PointerEvent<HTMLButtonElement>) {
  const session = resizeSession.current;
  if (!session || preview || !autosave.editable) return;
  const pixelColumn = (canvasRef.current?.clientWidth ?? 1200) / EDITOR_COLUMNS;
  const w = session.startW + Math.round((event.clientX - session.startClientX) / pixelColumn);
  const h = session.startH + Math.round((event.clientY - session.startClientY) / GRID_ROW);
  const next = resizeVisualBlock(session.before, session.id, w, h);
  if (validLayout(next)) {
   blocksRef.current = next;
   setBlocks(next);
  }
 }

 function finishResize() {
  if (!autosave.editable) return;
  const session = resizeSession.current;
  if (!session) return;
  resizeSession.current = null;
  if (unchanged(session.before, blocksRef.current)) return;
  setPast(previous => [...previous, session.before].slice(-MAX_UNDO));
  setFuture([]);
 }

 function changeSelected(changes: Parameters<typeof setVisualBlock>[2]) {
  if (!selected || !autosave.editable) return;
  commit(setVisualBlock(blocksRef.current, selected.id, changes));
 }

 function removeSelected() {
  if (!selected || !autosave.editable) return;
  commit(blocksRef.current.filter(block => block.id !== selected.id));
  setSelectedId(null);
 }

 function resizeSelected(width: number, height: number) {
  if (!selected || !autosave.editable) return;
  const next = resizeVisualBlock(blocksRef.current, selected.id, width, height);
  if (unchanged(blocksRef.current, next)) {
   setFeedback('Não é possível redimensionar: verifique o espaço e os limites da grade.');
  } else commit(next);
 }

 function moveSelected(dx: number, dy: number) {
  if (!selected || !autosave.editable) return;
  commit(moveVisualBlock(blocksRef.current, selected.id, selected.x + dx, selected.y + dy));
 }

 const selectedMetrics = selected?.source ? allowedMetrics[selected.source] : [];
 const queueConfig = selected?.queueConfig ?? DEFAULT_QUEUE_SETTINGS;
 const availableQueues = queueSnapshot.status === 'ready' && queueSnapshot.data
  ? [...queueSnapshot.data.rows].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR') || a.id-b.id)
  : [];
 function changeQueueConfig(next: QueueViewSettings) {
  if (!selected || selected.source !== 'listar_filas'
    || !['kpi','table','bar'].includes(selected.kind)) return;
  changeSelected({ queueConfig: next });
 }
 function setSelectionMode(mode:'all'|'selected') {
  if (mode === 'all') {
   changeQueueConfig({ ...queueConfig, selection:{mode:'all'} });
  } else if (availableQueues.length>0) {
   const existing = queueConfig.selection.mode==='selected' ? queueConfig.selection.ids : [];
   const validIds = existing.filter(id=>availableQueues.some(row=>row.id===id));
   changeQueueConfig({ ...queueConfig,
    selection:{mode:'selected', ids:validIds.length ? validIds : [availableQueues[0].id]} });
  }
 }
 function toggleQueue(id:number, checked:boolean) {
  if (queueConfig.selection.mode!=='selected') return;
  const current = queueConfig.selection.ids;
  const next = checked ? [...current.filter(v=>v!==id),id].sort((a,b)=>a-b)
   : current.filter(v=>v!==id);
  if (next.length) changeQueueConfig({...queueConfig,selection:{mode:'selected',ids:next}});
 }

 return <div className={styles.editor} data-testid="visual-editor">
  <header className={styles.topbar}>
   <div className={styles.breadcrumb}>
    <Link href="/dashboards" className={styles.back}
     onClick={event => {
      if ((autosave.dirty || autosave.status === 'saving') && !window.confirm('Existem alterações não confirmadas no servidor. Sair e descartá-las?')) {
       event.preventDefault();
      }
     }} aria-label="Voltar para Gerenciar dashboards">
     <ArrowLeft size={19} />
    </Link>
    <div>
     <span className={styles.eyebrow}>Editor Visual · Configuração de filas</span>
     <h1>{dashboard.nome}</h1>
     <p>Tópico: {dashboard.topicoNome} · Rascunho</p>
    </div>
   </div>
   <div className={styles.toolbar}>
    <button type="button" className={styles.secondaryButton} onClick={revert} disabled={!autosave.editable || !past.length}
     aria-label="Desfazer"><Undo2 size={17}/> <span>Desfazer</span></button>
    <button type="button" className={styles.secondaryButton} onClick={replay} disabled={!autosave.editable || !future.length}
     aria-label="Refazer"><Redo2 size={17}/> <span>Refazer</span></button>
    <button type="button" className={styles.secondaryButton} onClick={() => setPreview(value => !value)}
     aria-pressed={preview}><Eye size={17}/> <span>{preview ? 'Voltar à edição' : 'Pré-visualizar'}</span></button>
    <button type="button" disabled={!autosave.editable || !autosave.dirty || autosave.status === 'saving'}
     title="Solicitar gravação imediata do rascunho" onClick={autosave.saveNow}
     className={styles.secondaryButton}><Save size={16}/> Salvar agora</button>
    <button type="button" disabled title="A publicação será liberada após persistência e revisão das permissões."
     className={styles.primaryButton}><ShieldCheck size={16}/> Publicar</button>
   </div>
  </header>
  <div className={styles.banner} role="status">
   <ShieldCheck size={18} aria-hidden="true"/>
   <span><strong>Rascunho do Editor Visual:</strong> {autosave.status === 'loading'
    ? 'Consultando layout salvo...'
    : autosave.status === 'saving' ? 'Salvando alterações no Supabase...'
    : autosave.status === 'ready' ? (autosave.dirty ? 'Alterações pendentes de gravação.' : 'Sem alterações pendentes.')
    : autosave.message} A prévia da última coleta de listar_filas está disponível para administradores. Histórico por período e publicação continuam desabilitados.</span>
   {(autosave.status === 'error' || autosave.status === 'conflict') && <button type="button"
    className={styles.reloadButton} onClick={() => {
     if (window.confirm('Recarregar o layout do servidor? Alterações não confirmadas nesta aba serão descartadas.')) {
      window.location.reload();
     }
    }}>Recarregar do servidor</button>}
  </div>
  <div className={styles.workspace + (preview ? ' ' + styles.previewMode : '')}>
   <aside className={styles.catalog} aria-label="Catálogo de componentes">
    <div className={styles.panelHeading}>
     <strong>Componentes</strong>
     <small>Arraste para a grade ou clique para adicionar</small>
    </div>
    <div className={styles.catalogItems}>
     {VISUAL_COMPONENTS.map(item => {
      const Icon = icons[item.kind];
      return <button key={item.kind} type="button" disabled={!autosave.editable || preview} draggable={autosave.editable && !preview}
       className={styles.catalogItem} onClick={() => add(item.kind)}
       onDragStart={event => {
        dragged.current = { mode: 'new', kind: item.kind };
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('text/plain', item.kind);
       }}
       onDragEnd={() => { dragged.current = null; }}>
       <span className={styles.catalogIcon}><Icon size={18}/></span>
       <span><strong>{item.label}</strong><small>{item.description}</small></span>
       <Plus size={16} className={styles.addIcon} aria-hidden="true"/>
      </button>;
     })}
    </div>
    <p className={styles.panelFoot}>Máximo de {EDITOR_MAX_BLOCKS} componentes. Sem sobreposição.</p>
   </aside>

   <main className={styles.stage}>
    <div className={styles.stageHeader}>
     <div>
      <h2>Área do dashboard</h2>
      <p>Grade de 12 colunas · arraste, selecione ou redimensione usando a alça</p>
     </div>
     <span className={styles.counter}>{blocks.length} / {EDITOR_MAX_BLOCKS}</span>
    </div>
    {feedback && <div className={styles.error} role="alert">{feedback}</div>}
    <div className={styles.canvasScroll}>
     <div ref={canvasRef} className={styles.canvas} data-testid="editor-canvas"
      onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
      onDrop={drop}>
      {blocks.length === 0 && <div className={styles.emptyCanvas} data-testid="editor-empty">
       <LayoutDashboard size={36} strokeWidth={1.4} />
       <strong>Monte seu dashboard</strong>
       <span>Adicione um componente pelo catálogo à esquerda ou arraste-o para cá.</span>
      </div>}
      {blocks.map(block => {
       const Icon = icons[block.kind];
       const active = selectedId === block.id && !preview;
       return <article key={block.id} data-testid="editor-block"
        className={styles.block + (active ? ' ' + styles.blockSelected : '')}
        style={{ gridColumn: `${block.x + 1} / span ${block.w}`, gridRow: `${block.y + 1} / span ${block.h}` }}
        aria-label={block.title + ', componente ' + block.kind}
        onClick={() => { if (!preview && autosave.editable) setSelectedId(block.id); }}>
        <div className={styles.blockTop}>
         {!preview && <button type="button" draggable={autosave.editable}
          disabled={!autosave.editable} className={styles.dragHandle} title="Arrastar componente" aria-label={'Mover ' + block.title}
          onDragStart={event => {
           dragged.current = { mode: 'move', id: block.id };
           event.dataTransfer.effectAllowed = 'move';
           event.dataTransfer.setData('text/plain', block.id);
           setSelectedId(block.id);
          }}
          onDragEnd={() => { dragged.current = null; }}>
          <GripVertical size={16}/>
         </button>}
         <Icon size={16} aria-hidden="true"/>
         <strong>{block.title || 'Sem título'}</strong>
         {!preview && <span className={styles.blockType}>{VISUAL_COMPONENTS.find(item => item.kind === block.kind)?.label}</span>}
        </div>
        <BlockContent block={block} snapshot={queueSnapshot}/>
        {!preview && active && autosave.editable && <button type="button"
         className={styles.resizeHandle}
         title="Arraste para redimensionar" aria-label={'Redimensionar ' + block.title}
         onPointerDown={event => startResize(event, block)}
         onPointerMove={resize}
         onPointerUp={finishResize}
         onPointerCancel={() => { resizeSession.current = null; }}
         onClick={event => event.stopPropagation()}>
         <Maximize2 size={16}/>
        </button>}
       </article>;
      })}
     </div>
    </div>
   </main>

   <aside className={styles.inspector} aria-label="Propriedades do componente">
    <div className={styles.panelHeading}>
     <strong>Configurações</strong>
     <small>{selected ? 'Personalize o componente selecionado' : 'Selecione um componente no canvas'}</small>
    </div>
    {!selected ? <div className={styles.noSelection}>
     <LayoutDashboard size={27}/>
     <p>Selecione um cartão para alterar seu título, fonte, conteúdo ou posição.</p>
    </div> : <fieldset disabled={!autosave.editable} className={styles.inspectorBody}>
     <div className={styles.control}>
      <label htmlFor="editor-title">Título do componente</label>
      <input id="editor-title" type="text" maxLength={80} value={selected.title}
       onChange={event => changeSelected({ title: event.target.value })}/>
     </div>
     {selected.kind === 'text' ? <div className={styles.control}>
      <label htmlFor="editor-text">Conteúdo do texto</label>
      <textarea id="editor-text" rows={6} maxLength={2000} value={selected.text}
       onChange={event => changeSelected({ text: event.target.value })}
       placeholder="Escreva um texto explicativo para o dashboard."/>
     </div> : <>
      <div className={styles.control}>
       <label htmlFor="editor-source">Fonte candidata</label>
       <select id="editor-source" value={selected.source ?? ''}
        onChange={event => changeSelected({
         source: event.target.value ? event.target.value as Exclude<VisualSource, null> : null,
         metric: '',
         queueConfig: undefined,
        })}>
        <option value="">Não selecionada</option>
        <option value="listar_filas">listar_filas · última coleta</option>
        <option value="relatorio_chamadas">relatorio_chamadas · histórico</option>
       </select>
      </div>
      <div className={styles.control}>
       <label htmlFor="editor-metric">Indicador candidato</label>
       <select id="editor-metric" value={selected.metric} disabled={!selected.source}
        onChange={event => changeSelected({ metric: event.target.value })}>
        <option value="">{selected.source === 'listar_filas'
         ? 'As três métricas (última coleta)' : 'Escolha um indicador'}</option>
        {selectedMetrics.map(metric => <option key={metric.id} value={metric.id} disabled={metric.disabled}>{metric.label}</option>)}
       </select>
      </div>
      {selected.source === 'listar_filas' && ['kpi','table','bar'].includes(selected.kind) && <>
       <div className={styles.control}>
        <label htmlFor="editor-queue-selection">Filas do componente</label>
        <select id="editor-queue-selection" value={queueConfig.selection.mode}
         onChange={event=>setSelectionMode(event.target.value as 'all'|'selected')}>
         <option value="all">Todas as filas autorizadas</option>
         <option value="selected" disabled={availableQueues.length===0}>Selecionar filas</option>
        </select>
        <small>“Todas” inclui automaticamente novas filas autorizadas.</small>
       </div>
       {queueConfig.selection.mode==='selected' && <div className={styles.control}>
        <span className={styles.queueSelectionTitle}>Escolha uma ou várias filas</span>
        <div className={styles.queueSelectionList} role="group" aria-label="Filas selecionadas">
         {availableQueues.map(row=><label key={row.id} className={styles.queueOption}>
          <input type="checkbox"
           checked={queueConfig.selection.mode==='selected' && queueConfig.selection.ids.includes(row.id)}
           onChange={event=>toggleQueue(row.id,event.target.checked)}/>
          <span>{row.name}</span>
         </label>)}
        </div>
        <small>É necessário manter pelo menos uma fila selecionada.</small>
       </div>}
       <div className={styles.control}>
        <label htmlFor="editor-queue-sort">Ordenar filas por</label>
        <select id="editor-queue-sort" value={queueConfig.sortBy}
         onChange={event=>changeQueueConfig({...queueConfig,sortBy:event.target.value as QueueSortField})}>
         <option value="name">Nome da fila</option>
         <option value="received">Chamadas recebidas</option>
         <option value="answered">Chamadas atendidas</option>
         <option value="abandoned">Chamadas abandonadas</option>
         <option value="answerRate">Percentual de atendimento</option>
        </select>
       </div>
       <div className={styles.control}>
        <label htmlFor="editor-queue-direction">Direção da ordenação</label>
        <select id="editor-queue-direction" value={queueConfig.direction}
         onChange={event=>changeQueueConfig({...queueConfig,
          direction:event.target.value as 'asc'|'desc'})}>
         <option value="asc">Crescente</option>
         <option value="desc">Decrescente</option>
        </select>
       </div>
       {selected.kind!=='kpi' && <div className={styles.control}>
        <label htmlFor="editor-queue-limit">Quantidade de filas exibidas</label>
        <select id="editor-queue-limit" value={String(queueConfig.limit)}
         onChange={event=>changeQueueConfig({...queueConfig,
          limit:event.target.value==='all'?'all':Number(event.target.value) as QueueLimit})}>
         <option value="5">5 filas</option>
         <option value="10">10 filas</option>
         <option value="20">20 filas</option>
         <option value="all">Todas as filas</option>
        </select>
        <small>O KPI consolidado soma todas as filas selecionadas, sem aplicar esse limite.</small>
       </div>}
      </>}
      {selected.kind === 'bar' && <div className={styles.control}>
       <label htmlFor="editor-orientation">Orientação das barras</label>
       <select id="editor-orientation" value={selected.chartOrientation}
        onChange={event => changeSelected({ chartOrientation: event.target.value as 'vertical' | 'horizontal' })}>
        <option value="vertical">Vertical</option>
        <option value="horizontal">Horizontal</option>
       </select>
      </div>}
      <p className={styles.warning}>Os filtros de fila, ordenação e limites deste componente são salvos no rascunho após instalação do contrato V2 no Supabase. Somente última coleta: não há histórico por datas. Publicação continua desabilitada.</p>
     </>}
     <div className={styles.control}>
      <label>Dimensões na grade (colunas × linhas)</label>
      <div className={styles.dimensionControls}>
       <button type="button" aria-label="Diminuir largura" onClick={() => resizeSelected(selected.w - 1, selected.h)}>−</button>
       <span>{selected.w} × {selected.h}</span>
       <button type="button" aria-label="Aumentar largura" onClick={() => resizeSelected(selected.w + 1, selected.h)}>+</button>
       <button type="button" aria-label="Diminuir altura" onClick={() => resizeSelected(selected.w, selected.h - 1)}>− H</button>
       <button type="button" aria-label="Aumentar altura" onClick={() => resizeSelected(selected.w, selected.h + 1)}>+ H</button>
      </div>
     </div>
     <div className={styles.control}>
      <label>Posição na grade</label>
      <div className={styles.moveControls}>
       <button type="button" aria-label="Mover para cima" onClick={() => moveSelected(0, -1)}><ArrowUp size={16}/></button>
       <button type="button" aria-label="Mover para baixo" onClick={() => moveSelected(0, 1)}><ArrowDown size={16}/></button>
       <button type="button" aria-label="Mover para esquerda" onClick={() => moveSelected(-1, 0)}><ArrowLeft size={16}/></button>
       <button type="button" aria-label="Mover para direita" onClick={() => moveSelected(1, 0)}><ArrowRight size={16}/></button>
      </div>
     </div>
     <button type="button" className={styles.deleteButton} onClick={removeSelected}>
      <Trash2 size={16}/> Remover do layout local
     </button>
    </fieldset>}
   </aside>
  </div>
  <div className={styles.mobileNote}>A edição e o posicionamento estão disponíveis no computador. Esta visualização compacta não altera o layout.</div>
 </div>;
}
