/** Presentation only: does not change topic IDs, slugs or access rules. */
export const CALL_CENTER_TABS = [
  { id: 'overview', label: 'Visão geral', pending: false },
  { id: 'month', label: 'Por mês', pending: false },
  { id: 'hour', label: 'Por hora', pending: false },
  { id: 'annual', label: 'Comparativo anual', pending: false },
] as const;
export type CallCenterTab = typeof CALL_CENTER_TABS[number]['id'];
export type CallCenterView = CallCenterTab | 'tempos-diarios';

// Navigation is shared by the page shell and the server route parser.
export const CALL_CENTER_NAV_ITEMS: ReadonlyArray<{ id: CallCenterView; label: string; href: string }> = [
  ...CALL_CENTER_TABS.map(item => ({
    id: item.id,
    label: item.label,
    href: item.id === 'overview' ? '/chamadas' : `/chamadas?painel=${item.id}`,
  })),
  { id: 'tempos-diarios', label: 'TMA e TME diário', href: '/chamadas?painel=tempos-diarios' },
];

export function resolveCallCenterView(value: string | string[] | undefined): CallCenterView {
  if (typeof value === 'string') {
    const item = CALL_CENTER_NAV_ITEMS.find(candidate => candidate.id === value);
    if (item) return item.id;
  }
  return 'overview';
}

export function callCenterTopicLabel(topic: { slug: string; nome: string }): string {
  const name = topic.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return topic.slug === 'relatorios' && name === 'relatorios' ? 'Call Center' : topic.nome;
}

/** Durations are seconds; rounding occurs once, before splitting units. */
export function formatCallDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0 || seconds > Number.MAX_SAFE_INTEGER) return '—';
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const remainder = total % 60;
  const pair = (value: number) => String(value).padStart(2, '0');
  return hours ? `${pair(hours)}:${pair(minutes)}:${pair(remainder)}` : `${pair(minutes)}:${pair(remainder)}`;
}

export function nextCallTabIndex(index: number, key: string): number | null {
  if (!Number.isInteger(index) || index < 0 || index >= CALL_CENTER_TABS.length) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return CALL_CENTER_TABS.length - 1;
  if (key === 'ArrowRight') return (index + 1) % CALL_CENTER_TABS.length;
  if (key === 'ArrowLeft') return (index + CALL_CENTER_TABS.length - 1) % CALL_CENTER_TABS.length;
  return null;
}
