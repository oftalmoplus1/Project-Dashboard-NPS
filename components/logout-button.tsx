'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return <button className="outline-button" disabled={pending} onClick={async () => {
    setPending(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Logout indisponível');
      router.replace('/login');
      router.refresh();
    } catch {
      window.alert('Não foi possível encerrar a sessão. Tente novamente.');
      setPending(false);
    }
  }}>{pending ? 'Saindo...' : 'Sair'}</button>;
}
