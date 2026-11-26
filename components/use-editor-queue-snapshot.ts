'use client';

import { useEffect, useState } from 'react';
import { parseQueueApiResponse } from '@/lib/ligsim-queue-snapshot';

export type SnapshotPreviewState =
 | { status: 'idle' | 'loading' | 'error'; data: null }
 | { status: 'ready'; data: ReturnType<typeof parseQueueApiResponse> };

/**
 * One authenticated, existing admin-only RPC via /api/chamadas/filas.
 * Poll every 5 minutes only while visible; clear on any error or access loss.
 */
export function useEditorQueueSnapshot(enabled: boolean): SnapshotPreviewState {
 const [state,setState] = useState<SnapshotPreviewState>({status:'idle',data:null});
 useEffect(()=>{
  if (!enabled) {
   setState({status:'idle',data:null});
   return;
  }
  let mounted = true;
  let current: AbortController | null = null;
  async function refresh() {
   if (document.visibilityState === 'hidden') return;
   current?.abort();
   const controller = new AbortController();
   current = controller;
   setState({status:'loading',data:null});
   try {
    const response = await fetch('/api/chamadas/filas', {
     method:'GET', cache:'no-store', credentials:'same-origin', signal: controller.signal,
    });
    if (!response.ok) throw new Error('Consulta indisponível.');
    const payload: unknown = await response.json();
    const data = parseQueueApiResponse(payload);
    if (mounted && !controller.signal.aborted) setState({status:'ready',data});
   } catch {
    if (mounted && !controller.signal.aborted) setState({status:'error',data:null});
   }
  }
  const visibility = () => {
   if (document.visibilityState === 'visible') void refresh();
   else {
    current?.abort();
    if (mounted) setState({status:'loading',data:null});
   }
  };
  void refresh();
  const id = window.setInterval(()=>{ void refresh(); },300000);
  document.addEventListener('visibilitychange',visibility);
  return ()=>{
   mounted = false;
   window.clearInterval(id);
   document.removeEventListener('visibilitychange',visibility);
   current?.abort();
  };
 },[enabled]);
 return state;
}
