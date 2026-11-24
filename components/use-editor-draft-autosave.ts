'use client';

import { useEffect, useRef, useState } from 'react';
import { parseEditorLayoutSnapshot } from '@/lib/editor-layout-contract';
import type { VisualBlock } from '@/lib/editor-visual-layout';

export type AutosaveState = 'loading' | 'ready' | 'saving' | 'error' | 'conflict';

/**
 * One in-flight write at a time, debounced after edits.
 * A conflict or ambiguous network failure LOCKS writes until reload:
 * never blindly retry against an unknown server revision.
 */
export function useEditorDraftAutosave(
 dashboardId: string,
 blocks: readonly VisualBlock[],
 onHydrate: (loaded: VisualBlock[]) => void,
) {
 const [status, setStatus] = useState<AutosaveState>('loading');
 const [message, setMessage] = useState('');
 const [forceSave, setForceSave] = useState(0);
 const revision = useRef<number | null>(null);
 const saved = useRef('[]');
 const onHydrateRef = useRef(onHydrate);
 onHydrateRef.current = onHydrate;
 const url = '/api/editor/dashboards/' + encodeURIComponent(dashboardId) + '/layout';

 useEffect(() => {
  const controller = new AbortController();
  async function hydrate() {
   try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('API de layout indisponível.');
    const value: unknown = await response.json();
    const snapshot = parseEditorLayoutSnapshot(value);
    if (!snapshot) throw new Error('Layout recebido inválido.');
    if (controller.signal.aborted) return;
    revision.current = snapshot.revision;
    saved.current = JSON.stringify(snapshot.blocks);
    onHydrateRef.current(snapshot.blocks);
    setStatus('ready');
   } catch {
    if (!controller.signal.aborted) {
     setStatus('error');
     setMessage('Não foi possível carregar o layout salvo. Nenhuma alteração será permitida até recarregar.');
    }
   }
  }
  void hydrate();
  return () => controller.abort();
 }, [url]);

 const fingerprint = JSON.stringify(blocks);
 const dirty = revision.current !== null && fingerprint !== saved.current;
 const editable = status === 'ready' || status === 'saving';

 useEffect(() => {
  if (status !== 'ready' || !dirty || revision.current === null) return;
  const snapshot = blocks.map(block => ({ ...block }));
  const currentRevision = revision.current;
  const timer = window.setTimeout(async () => {
   // Restore normal debounce after a forced manual save.
   setForceSave(0);
   setStatus('saving');
   try {
    const response = await fetch(url, {
     method: 'PUT',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ revision: currentRevision, blocks: snapshot }),
     cache: 'no-store',
    });
    if (!response.ok) {
     setStatus(response.status === 409 ? 'conflict' : 'error');
     setMessage(response.status === 409
      ? 'Outro acesso alterou o rascunho. Para proteger as alterações, não faremos novas gravações. Recarregue a página e revise o layout.'
      : 'Não foi possível confirmar o salvamento. Uma nova tentativa automática poderia sobrescrever dados. Recarregue para consultar a versão do servidor.');
     return;
    }
    const data: unknown = await response.json();
    const savedSnapshot = parseEditorLayoutSnapshot(data);
    if (!savedSnapshot || savedSnapshot.revision !== currentRevision + 1
     || JSON.stringify(savedSnapshot.blocks) !== JSON.stringify(snapshot)) {
     setStatus('error');
     setMessage('Resposta de gravação inconsistente. Recarregue antes de continuar.');
     return;
    }
    revision.current = savedSnapshot.revision;
    saved.current = JSON.stringify(snapshot);
    setMessage('');
    setStatus('ready');
   } catch {
    setStatus('error');
    setMessage('O resultado do salvamento não pôde ser confirmado. Recarregue antes de continuar.');
   }
  }, forceSave ? 0 : 1100);
  return () => window.clearTimeout(timer);
 }, [fingerprint, dirty, status, forceSave, url, blocks]);

 function saveNow() {
  if (status === 'ready' && dirty) setForceSave(value => value + 1);
 }

 return { status, message, dirty, editable, saveNow };
}
