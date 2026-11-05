import 'server-only';

export function getSupabaseServerConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) {
    throw new Error('Supabase Auth não configurado no servidor.');
  }
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    throw new Error('SUPABASE_URL deve usar HTTPS.');
  }
  return { url: parsed.origin, publishableKey };
}
