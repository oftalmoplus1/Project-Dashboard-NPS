'use client';

import { useRef, type KeyboardEvent } from 'react';
import { CALL_CENTER_TABS, nextCallTabIndex, type CallCenterTab } from '@/lib/call-center-design';
import styles from './call-center.module.css';

type Props = { id: string; value: CallCenterTab; onChange: (value: CallCenterTab) => void };
export default function CallCenterTabs({ id, value, onChange }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const target = nextCallTabIndex(index, event.key);
    if (target === null) return;
    event.preventDefault();
    refs.current[target]?.focus();
    // Manual activation: Enter/Space uses the button's native click.
  }
  return <div className={styles.tabs} role="tablist" aria-label="Análises de chamadas">
    {CALL_CENTER_TABS.map((tab, index) => <button
      key={tab.id} type="button" role="tab" id={`${id}-tab-${tab.id}`}
      aria-selected={value === tab.id} aria-controls={`${id}-panel-${tab.id}`}
      tabIndex={value === tab.id ? 0 : -1} ref={element => { refs.current[index] = element; }}
      onKeyDown={event => move(event, index)} onClick={() => onChange(tab.id)}
      className={styles.tab}>
      {tab.label}{tab.pending && <span className={styles.tabBadge}>Pendente</span>}
    </button>)}
  </div>;
}
