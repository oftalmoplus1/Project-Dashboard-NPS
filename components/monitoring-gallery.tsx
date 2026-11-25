'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, ArrowUpRight } from 'lucide-react';
import { parsePublishedGallery, type PublishedSummary } from '@/lib/monitoramento-contract';
import styles from './monitoramento.module.css';

export default function MonitoringGallery() {
 const [rows, setRows] = useState<PublishedSummary[] | null>(null);
 const [error, setError] = useState('');
 useEffect(() => {
  const controller = new AbortController();
  async function load() {
   try {
    const response = await fetch('/api/monitoramento', { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('Consulta indisponível.');
    const payload: unknown = await response.json();
    const items = payload && typeof payload === 'object' && 'rows' in payload
     ? parsePublishedGallery(payload.rows) : null;
    if (!items) throw new Error('Catálogo inválido.');
    if (!controller.signal.aborted) setRows(items);
   } catch {
    if (!controller.signal.aborted) setError('Não foi possível carregar a galeria de dashboards autorizados.');
   }
  }
  void load();
  return () => controller.abort();
 }, []);

 return <main className={styles.shell}>
  <header className={styles.header}>
   <div className={styles.headline}>
    <span className={styles.eyebrow}>Monitoramento</span>
    <h1>Dashboards publicados</h1>
    <p>Somente dashboards disponíveis para sua conta.</p>
   </div>
   <Link className={styles.back} href="/configuracoes"><ArrowLeft size={17}/> Voltar ao sistema</Link>
  </header>
  <div className={styles.content} data-testid="monitoring-gallery">
   {error && <div className={styles.notice + ' ' + styles.error} role="alert">{error}</div>}
   {!error && rows === null && <div className={styles.notice} role="status">Carregando dashboards autorizados...</div>}
   {!error && rows?.length === 0 && <div className={styles.notice} role="status">
    Nenhum dashboard personalizado publicado foi disponibilizado para sua conta.
   </div>}
   {!error && rows && rows.length > 0 && <div className={styles.grid}>
    {rows.map(row => <Link key={row.dashboard_id} className={styles.card}
     href={'/monitoramento/' + encodeURIComponent(row.dashboard_id)}>
     <div className={styles.cardTop}>
      <span className={styles.cardIcon}><BarChart3 size={22}/></span>
      <ArrowUpRight size={19} aria-hidden="true"/>
     </div>
     <div>
      <h2>{row.nome}</h2>
      <p>{row.descricao || 'Dashboard de monitoramento.'}</p>
     </div>
     <div className={styles.meta}>{row.topico_nome} · Publicação v{row.versao}</div>
    </Link>)}
   </div>}
  </div>
 </main>;
}
