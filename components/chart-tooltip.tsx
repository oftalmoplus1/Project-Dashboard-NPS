'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<TooltipPoint>({ x: 12, y: 12 });
  useEffect(() => setMounted(true), []);

  // Measure the actual tooltip, rather than estimating its height from the
  // number of rows. Text can wrap and fonts differ across screen sizes.
  useLayoutEffect(() => {
    if (!mounted || !open || !point || !tooltipRef.current) return;
    const bounds = tooltipRef.current.getBoundingClientRect();
    const offset = 14;
    const inset = 12;
    const maxX = Math.max(inset, window.innerWidth - bounds.width - inset);
    const maxY = Math.max(inset, window.innerHeight - bounds.height - inset);
    const x = Math.max(inset, Math.min(maxX, point.x + offset));
    const below = point.y + bounds.height + offset <= window.innerHeight - inset;
    const rawY = below ? point.y + offset : point.y - bounds.height - offset;
    const y = Math.max(inset, Math.min(maxY, rawY));
    setPosition(previous => previous.x === x && previous.y === y ? previous : { x, y });
  }, [mounted, open, point, title, values, note]);

  if (!mounted) return null;
  return createPortal(
    <div ref={tooltipRef} id={id} data-testid={testId} role="tooltip" aria-hidden={!open || !point}
      data-open={open && point !== null} className={styles.tooltip}
      style={{ left: position.x, top: position.y }}>
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
