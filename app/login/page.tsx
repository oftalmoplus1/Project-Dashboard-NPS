'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }), cache: 'no-store' });
      if (!response.ok) {
        const payload: { error?: string } = await response.json();
        setError(payload.error || 'Não foi possível autenticar.');
        return;
      }
      setPassword('');
      router.replace('/chamadas');
      router.refresh();
    } catch { setError('Não foi possível conectar ao serviço de autenticação.'); }
    finally { setPending(false); }
  }
  return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f5f8fa' }}>
    <section style={{ width: '100%', maxWidth: 420, background: '#fff', border: '1px solid #dfe6eb', borderRadius: 18, padding: 32, boxShadow: '0 12px 40px rgba(0,0,0,.06)', color: '#192938' }}>
      <div style={{ fontSize: 14, color: '#148d7e', fontWeight: 800, marginBottom: 18 }}>dashboard_tools</div>
      <h1 style={{ fontSize: 26, marginBottom: 8 }}>Acesso ao painel</h1>
      <p style={{ color: '#607080', marginBottom: 24 }}>Entre com a conta autorizada no Supabase Auth.</p>
      <form onSubmit={login} style={{ display: 'grid', gap: 14 }}>
        <label style={{ display: 'grid', gap: 6, fontWeight: 600 }}>E-mail<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} style={{ padding: 12, borderRadius: 8, border: '1px solid #cbd5df', color: '#192938', background: '#fff' }}/></label>
        <label style={{ display: 'grid', gap: 6, fontWeight: 600 }}>Senha<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} style={{ padding: 12, borderRadius: 8, border: '1px solid #cbd5df', color: '#192938', background: '#fff' }}/></label>
        {error && <p role="alert" style={{ color: '#ad2333', fontSize: 14 }}>{error}</p>}
        <button type="submit" disabled={pending} style={{ background: '#078a77', color: '#fff', border: 0, padding: 13, borderRadius: 9, fontWeight: 700, cursor: pending ? 'wait' : 'pointer' }}>{pending ? 'Validando...' : 'Entrar'}</button>
      </form>
      <p style={{ marginTop: 20, fontSize: 12, color: '#64748b' }}>Acesso restrito. Cadastro público não disponível.</p>
    </section>
  </main>;
}
