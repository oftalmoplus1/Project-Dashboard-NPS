'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './chart-tooltip.module.css';

export type TooltipPoint = { x: number; y: number };
export type TooltipValue = { label: string; value: string; color?: string };
type Props = {
  open: boolean;
  point: TooltipPoint | null;
  title: string;
  values: readonly TooltipValue[];
  note?: string;
  id?: string;
  testId?: string;
};

/** Shared, non-interactive tooltip for every chart, including keyboard navigation. */
export function pointFromMouse(event: { clientX: number; clientY: number }): TooltipPoint {
  return { x: event.clientX, y: event.clientY };
}

export function pointFromFocus(event: { currentTarget: Element }): TooltipPoint {
  const bounds = event.currentTarget.getBoundingClientRect();
  return { x: bounds.left + bounds.width / 2, y: bounds.top + Math.min(bounds.height / 2, 24) };
}

export default function ChartTooltip({ open, point, title, values, note, id, testId }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  const offset = 14;
  const width = Math.min(270, Math.max(180, window.innerWidth - 24));
  const estimatedHeight = Math.min(290, 64 + values.length * 26 + (note ? 45 : 0));
  const x = Math.max(12, Math.min(window.innerWidth - width - 12, (point?.x ?? 12) + offset));
  const below = (point?.y ?? 12) + estimatedHeight + offset < window.innerHeight;
  const y = Math.max(12, Math.min(window.innerHeight - estimatedHeight - 12,
    below ? (point?.y ?? 12) + offset : (point?.y ?? 12) - estimatedHeight - offset));

  return createPortal(
    <div id={id} data-testid={testId} role="tooltip" aria-hidden={!open}
      data-open={open && point !== null} className={styles.tooltip}
      style={{ left: x, top: y }}>
      <strong className={styles.title}>{title}</strong>
      {values.map(item => <div key={item.label} className={styles.line}>
        <span className={styles.label}>
          {item.color && <i className={styles.swatch} style={{ backgroundColor: item.color }} aria-hidden="true"/>}
          {item.label}
        </span>
        <span className={styles.value}>{item.value}</span>
      </div>)}
      {note && <p className={styles.note}>{note}</p>}
    </div>,
    document.body,
  );
}
