'use client';

import { useEffect, useState } from 'react';
import { localToday, validateRange } from '@/lib/call-chart-data';
import { parsePublicExtensionRows, type ExtensionCount } from '@/lib/ligsim-report-data';
import ChartTooltip, { pointFromMouse, pointFromFocus, type TooltipPoint } from './chart-tooltip';

const number = (value: number) => value.toLocaleString('pt-BR');
type Props = { refreshKey: number };

export default function CallExtensionsChart({ refreshKey }: Props) {
  const today = localToday(new Date());
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [applied, setApplied] = useState<{ start: string; end: string } | null>(null);
  const [rows, setRows] = useState<{ key: string; data: ExtensionCount[] } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tooltipPoint, setTooltipPoint] = useState<TooltipPoint | null>(null);
  const key = applied ? applied.start + ':' + applied.end : '';
  useEffect(() => {
    if (!applied) return;
    const controller = new AbortController();
    let active = true;
    setError(''); setRows(null); setLoading(true); setHovered(null); setSelected(null);
    const load = async () => {
      try {
        const query = new URLSearchParams(applied);
        const response = await fetch('/api/chamadas/ramais?' + query, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ?
          'Acesso aos ramais negado.' : 'Consulta à LigSim indisponível. Verifique a integração do servidor.');
        const payload: unknown = await response.json();
        if (!payload || typeof payload !== 'object' || !('rows' in payload)) throw new Error('Resposta de ramais inválida.');
        // Reuse the exact schema validator, without accepting extra/private fields.
        const validated = parsePublicExtensionRows(payload);
        if (active) setRows({ key, data: validated });
      } catch (cause) {
        if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Falha nos dados por ramal.');
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; controller.abort(); };
  }, [applied, key, refreshKey]);
  const displayed = rows?.key === key ? rows.data : null;
  const max = Math.max(1, ...(displayed?.map(row => row.answered) ?? []));
  const active = displayed?.find(row => row.extension === (hovered ?? selected)) ?? null;
  return <section className="panel" style={{ padding: 20 }}>
    <div className="panel-head"><div><h2>Chamadas atendidas por ramal</h2>
      <p>Relatório LigSim chartcallsipdst · total de atendimentos por identificador de destino.</p></div></div>
    <form onSubmit={event => {
      event.preventDefault();
      try { validateRange({ start, end }); if (end > today) throw new Error('Não consulte datas futuras.'); setApplied({ start, end }); setError(''); }
      catch { setError('Período inválido. Selecione datas válidas, até 365 dias e sem datas futuras.'); }
    }} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end', marginBottom: 16 }}>
      <label>Data inicial <input type="date" aria-label="Data inicial dos ramais" value={start} max={today} onChange={event => setStart(event.target.value)}/></label>
      <label>Data final <input type="date" aria-label="Data final dos ramais" value={end} max={today} onChange={event => setEnd(event.target.value)}/></label>
      <button type="submit" className="primary-button">Consultar</button>
    </form>
    {!applied && <p>Selecione o período para consultar os dados reais da LigSim. Nenhum valor foi estimado.</p>}
    {loading && <p role="status">Consultando atendimentos por ramal...</p>}
    {error && <p role="alert">{error}</p>}
    {displayed?.length === 0 && <p>Não há registros retornados pela LigSim para este período. Isso não comprova a coleta histórica completa.</p>}
    {displayed && displayed.length > 0 && <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ fontSize: 12 }}>Período: {applied?.start} a {applied?.end}. {displayed.length} identificadores retornados.</p>
      {displayed.map(item => <button type="button" key={item.extension}
        aria-label={`${item.extension}: ${number(item.answered)} chamadas atendidas`}
        aria-pressed={selected === item.extension}
        onMouseEnter={event => {setHovered(item.extension);setTooltipPoint(pointFromMouse(event));}}
        onMouseMove={event => setTooltipPoint(pointFromMouse(event))}
        onMouseLeave={() => setHovered(null)}
        onFocus={event => {setHovered(item.extension);setTooltipPoint(pointFromFocus(event));}}
        onBlur={() => setHovered(null)}
        onClick={event => {setSelected(selected === item.extension ? null : item.extension);setTooltipPoint(pointFromMouse(event));}}
        style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 145px) minmax(0,1fr) 70px',
          alignItems: 'center', gap: 12, width: '100%', padding: '5px 2px', border: '1px solid transparent',
          borderRadius: 7, color: 'var(--text)', background: hovered===item.extension || selected===item.extension ? 'var(--soft)' : 'transparent',
          textAlign: 'left', cursor: 'pointer', transition: 'background 180ms ease-out' }}>
        <span style={{ overflowWrap: 'anywhere', fontSize: 12 }} title={item.extension}>{item.extension}</span>
        <span style={{ height: 22, background: 'var(--soft)', borderRadius: 4 }}>
          <span style={{ display: 'block', width: (item.answered / max * 100) + '%', height: '100%', background: '#12b981', borderRadius: 4 }}/>
        </span>
        <strong style={{ textAlign: 'right', fontSize: 12 }}>{number(item.answered)}</strong>
      </button>)}
      <ChartTooltip open={Boolean(active)} point={tooltipPoint}
        title={active ? 'Ramal ' + active.extension : ''}
        values={active ? [{ label: 'Atendidas', value: number(active.answered), color: '#12b981' }] : []}
        note="Identificador de destino fornecido pela LigSim; não representa nome de atendente."/>
      <p style={{ fontSize: 11, opacity: .75 }}>Identificadores fornecidos pelo endpoint de ramais. Não foram inferidos nomes ou associações a atendentes.</p>
    </div>}
  </section>;
}
