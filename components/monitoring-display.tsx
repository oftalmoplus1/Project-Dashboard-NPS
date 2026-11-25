'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { parsePublishedDashboard, type PublishedDashboard } from '@/lib/monitoramento-contract';
import styles from './monitoramento.module.css';

const REFRESH_MS = 30000;
const STALE_MS = 60000;

/** Read-only published snapshot. No invented metrics or direct data access. */
export default function MonitoringDisplay({ id }: { id: string }) {
 const [dashboard, setDashboard] = useState<PublishedDashboard | null>(null);
 const [checked, setChecked] = useState<number | null>(null);
 const [error, setError] = useState('');
 const [denied, setDenied] = useState(false);
 const [now, setNow] = useState(Date.now());
 const inFlight = useRef(false);
 useEffect(() => {
  const controller = new AbortController();
  async function load() {
   if (inFlight.current) return;
   inFlight.current = true;
   try {
    const response = await fetch('/api/monitoramento/' + encodeURIComponent(id), {
     cache: 'no-store', signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    if (response.status === 401 || response.status === 403 || response.status === 404) {
     setDenied(true); setDashboard(null); setError('Dashboard indisponível ou permissão revogada.');
     return;
    }
    if (!response.ok) throw new Error('Resposta indisponível.');
    const payload: unknown = await response.json();
    const value = parsePublishedDashboard(payload);
    if (!value || value.dashboard_id !== id) throw new Error('Publicação inválida.');
    if (!controller.signal.aborted) {
     setDashboard(value); setChecked(Date.now()); setError(''); setDenied(false);
    }
   } catch {
    if (!controller.signal.aborted) setError('Não foi possível conferir a versão publicada.');
   } finally {
    inFlight.current = false;
   }
  }
  void load();
  const interval = window.setInterval(() => { void load(); }, REFRESH_MS);
  const clock = window.setInterval(() => setNow(Date.now()), 1000);
  return () => { controller.abort(); window.clearInterval(interval); window.clearInterval(clock); };
 }, [id]);

 const stale = checked !== null && now - checked >= STALE_MS;
 const date = checked === null ? 'Ainda não verificada' : new Date(checked).toLocaleTimeString('pt-BR');
 return <main className={styles.shell} data-testid="monitoring-display">
  <header className={styles.header}>
   <div className={styles.headline}>
    <span className={styles.eyebrow}>Monitoramento · somente leitura</span>
    <h1>{dashboard?.nome || 'Dashboard'}</h1>
    <p>{dashboard ? dashboard.topico_nome + ' · Versão publicada ' + dashboard.versao : 'Aguardando acesso à versão publicada.'}</p>
   </div>
   <Link href="/monitoramento" className={styles.back}><ArrowLeft size={17}/> Voltar à galeria</Link>
  </header>
  <div className={styles.content}>
   <div className={styles.status} role="status" style={{ marginBottom: 20 }}>
    {error || stale ? <AlertTriangle size={15} aria-hidden="true"/> : <CheckCircle2 size={15} aria-hidden="true"/>}
    <span>{error || (stale ? 'Versão publicada sem verificação há mais de 60 segundos.' : 'Versão publicada verificada.')} Última conferência: {date}.</span>
   </div>
   {denied && <div className={styles.notice + ' ' + styles.error} role="alert">Acesso encerrado. Retorne à galeria.</div>}
   {!denied && error && !dashboard && <div className={styles.notice + ' ' + styles.error} role="alert">{error}</div>}
   {!denied && !dashboard && !error && <div className={styles.notice} role="status">Carregando a publicação...</div>}
   {!denied && dashboard && <>
    <div className={styles.notice} style={{ marginBottom: 18 }}>
     A versão publicada é somente leitura. As consultas dos gráficos e o indicador de atualização dos <strong>dados</strong> serão habilitados após homologação das fontes; esta tela verifica apenas a versão do layout.
    </div>
    <div className={styles.viewer} aria-label="Layout publicado">
     {dashboard.blocos.map(block => <section key={block.id} className={styles.block}
      style={{ gridColumn: (block.x + 1) + ' / span ' + block.w, gridRow: (block.y + 1) + ' / span ' + block.h }}>
      <h2>{block.title}</h2>
      {block.kind === 'text' ? <p>{block.text}</p> :
       <div className={styles.unavailable} role="status">
        Indicador ainda não habilitado nesta fase. Nenhum valor fictício será exibido.
       </div>}
     </section>)}
    </div>
   </>}
  </div>
 </main>;
}
