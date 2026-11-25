import 'server-only';
import { getSupabaseServerConfig } from './supabase-config';

export async function monitoramentoRpc(token: string, procedure: string, payload: Record<string, unknown>) {
 const { url, publishableKey } = getSupabaseServerConfig();
 return fetch(url + '/rest/v1/rpc/' + procedure, {
  method: 'POST',
  headers: {
   apikey: publishableKey, Authorization: 'Bearer ' + token,
   Accept: 'application/json', 'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
  cache: 'no-store',
  signal: AbortSignal.timeout(12000),
 });
}
