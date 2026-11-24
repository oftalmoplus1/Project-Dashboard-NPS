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

const allowedMetrics: Record<Exclude<VisualSource, null>, ReadonlyArray<{ id: string; label: string }>> = {
 listar_filas: [
  { id: 'received', label: 'Chamadas recebidas' },
  { id: 'answered', label: 'Chamadas atendidas' },
  { id: 'waiting_calls', label: 'Chamadas em espera' },
  { id: 'abandon_less_30s', label: 'Abandonos até 30 s' },
  { id: 'abandon_more_30s', label: 'Abandonos acima de 30 s' },
  { id: 'tma', label: 'TMA' },
  { id: 'tme', label: 'TME' },
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

function BlockContent({ block }: { block: VisualBlock }) {
 const Icon = icons[block.kind];
 if (block.kind === 'text') {
  return <p className={styles.textContent}>
   {block.text.trim() || 'Selecione este bloco para escrever uma anotação no painel de propriedades.'}
  </p>;
 }
 return <div className={styles.placeholder} aria-label={block.kind + ' ainda sem dados'}>
  <Icon size={block.kind === 'kpi' ? 26 : 34} strokeWidth={1.4} aria-hidden="true" />
  <span>{block.source ? 'Fonte candidata: ' + sourceNames[block.source] : 'Nenhuma fonte selecionada'}</span>
  <small>Sem dados reais nesta etapa. Não há consulta ou publicação habilitada.</small>
 </div>;
}

/**
 * First operational UI slice only. All edits remain in React memory.
 * Deliberately no fake "autosaved" state and no mutations of Supabase.
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
 const blocksRef = useRef(blocks);
 blocksRef.current = blocks;

 const selected = useMemo(() => blocks.find(block => block.id === selectedId) ?? null, [blocks, selectedId]);

 useEffect(() => {
  if (blocks.length === 0) return;
  const warn = (event: BeforeUnloadEvent) => {
   event.preventDefault();
   event.returnValue = '';
  };
  window.addEventListener('beforeunload', warn);
  return () => window.removeEventListener('beforeunload', warn);
 }, [blocks.length]);

 function commit(next: VisualBlock[]) {
  if (unchanged(blocksRef.current, next) || !validLayout(next)) return;
  setPast(previous => [...previous, blocksRef.current].slice(-MAX_UNDO));
  blocksRef.current = next;
  setBlocks(next);
  setFuture([]);
  setFeedback('');
 }

 function add(kind: VisualKind, x?: number, y?: number) {
  if (blocksRef.current.length >= EDITOR_MAX_BLOCKS) {
   setFeedback('Limite de 40 componentes por dashboard nesta etapa.');
   return;
  }
  const id = crypto.randomUUID();
  const next = addVisualBlock(blocksRef.current, kind, id, x, y);
  if (next.length === blocksRef.current.length) {
   setFeedback('Não há espaço disponível na grade para este componente.');
   return;
  }
  commit(next);
  setSelectedId(id);
 }

 function revert() {
  const previous = past.at(-1);
  if (!previous) return;
  setFuture(next => [blocksRef.current, ...next].slice(0, MAX_UNDO));
  blocksRef.current = previous;
  setBlocks(previous);
  setPast(next => next.slice(0, -1));
  setSelectedId(current => previous.some(block => block.id === current) ? current : null);
 }

 function replay() {
  const next = future[0];
  if (!next) return;
  setPast(previous => [...previous, blocksRef.current].slice(-MAX_UNDO));
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
  if (preview || !dragged.current) return;
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
  if (preview) return;
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
  if (!session || preview) return;
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
  const session = resizeSession.current;
  if (!session) return;
  resizeSession.current = null;
  if (unchanged(session.before, blocksRef.current)) return;
  setPast(previous => [...previous, session.before].slice(-MAX_UNDO));
  setFuture([]);
 }

 function changeSelected(changes: Parameters<typeof setVisualBlock>[2]) {
  if (!selected) return;
  commit(setVisualBlock(blocksRef.current, selected.id, changes));
 }

 function removeSelected() {
  if (!selected) return;
  commit(blocksRef.current.filter(block => block.id !== selected.id));
  setSelectedId(null);
 }

 function resizeSelected(width: number, height: number) {
  if (!selected) return;
  const next = resizeVisualBlock(blocksRef.current, selected.id, width, height);
  if (unchanged(blocksRef.current, next)) {
   setFeedback('Não é possível redimensionar: verifique o espaço e os limites da grade.');
  } else commit(next);
 }

 function moveSelected(dx: number, dy: number) {
  if (!selected) return;
  commit(moveVisualBlock(blocksRef.current, selected.id, selected.x + dx, selected.y + dy));
 }

 const selectedMetrics = selected?.source ? allowedMetrics[selected.source] : [];

 return <div className={styles.editor} data-testid="visual-editor">
  <header className={styles.topbar}>
   <div className={styles.breadcrumb}>
    <Link href="/dashboards" className={styles.back}
     onClick={event => {
      if (blocks.length && !window.confirm('O layout ainda não pode ser salvo no servidor. Sair e descartar as alterações?')) {
       event.preventDefault();
      }
     }} aria-label="Voltar para Gerenciar dashboards">
     <ArrowLeft size={19} />
    </Link>
    <div>
     <span className={styles.eyebrow}>Editor Visual · Fase 3A</span>
     <h1>{dashboard.nome}</h1>
     <p>Tópico: {dashboard.topicoNome} · Rascunho</p>
    </div>
   </div>
   <div className={styles.toolbar}>
    <button type="button" className={styles.secondaryButton} onClick={revert} disabled={!past.length}
     aria-label="Desfazer"><Undo2 size={17}/> <span>Desfazer</span></button>
    <button type="button" className={styles.secondaryButton} onClick={replay} disabled={!future.length}
     aria-label="Refazer"><Redo2 size={17}/> <span>Refazer</span></button>
    <button type="button" className={styles.secondaryButton} onClick={() => setPreview(value => !value)}
     aria-pressed={preview}><Eye size={17}/> <span>{preview ? 'Voltar à edição' : 'Pré-visualizar'}</span></button>
    <button type="button" disabled title="O salvamento no Supabase será implementado em outra entrega."
     className={styles.secondaryButton}><Save size={16}/> Salvar</button>
    <button type="button" disabled title="A publicação será liberada após persistência e revisão das permissões."
     className={styles.primaryButton}><ShieldCheck size={16}/> Publicar</button>
   </div>
  </header>
  <div className={styles.banner} role="status">
   <ShieldCheck size={18} aria-hidden="true"/>
   <span>**Edição experimental:** os componentes existem apenas nesta sessão. Ainda não há salvamento automático, consultas de dados nem publicação. Não utilize este layout como dashboard operacional.</span>
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
      return <button key={item.kind} type="button" draggable={!preview}
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
       return <article key={block.id}
        className={styles.block + (active ? ' ' + styles.blockSelected : '')}
        style={{ gridColumn: `${block.x + 1} / span ${block.w}`, gridRow: `${block.y + 1} / span ${block.h}` }}
        aria-label={block.title + ', componente ' + block.kind}
        onClick={() => { if (!preview) setSelectedId(block.id); }}>
        <div className={styles.blockTop}>
         {!preview && <button type="button" draggable
          className={styles.dragHandle} title="Arrastar componente" aria-label={'Mover ' + block.title}
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
        <BlockContent block={block}/>
        {!preview && active && <button type="button"
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
    </div> : <div className={styles.inspectorBody}>
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
        <option value="">Escolha um indicador</option>
        {selectedMetrics.map(metric => <option key={metric.id} value={metric.id}>{metric.label}</option>)}
       </select>
      </div>
      {selected.kind === 'bar' && <div className={styles.control}>
       <label htmlFor="editor-orientation">Orientação das barras</label>
       <select id="editor-orientation" value={selected.chartOrientation}
        onChange={event => changeSelected({ chartOrientation: event.target.value as 'vertical' | 'horizontal' })}>
        <option value="vertical">Vertical</option>
        <option value="horizontal">Horizontal</option>
       </select>
      </div>}
      <p className={styles.warning}>Estas opções são apenas configurações locais; ainda não executam consultas nem validam a semântica das métricas.</p>
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
    </div>}
   </aside>
  </div>
  <div className={styles.mobileNote}>A edição e o posicionamento estão disponíveis no computador. Esta visualização compacta não altera o layout.</div>
 </div>;
}
