// Round 2 building blocks. Later phases build screens from these instead of one-off markup.
// Styling lives in theme.css (ui-* classes); see app/DESIGN.md for the rules behind them.
import type { CSSProperties, ReactNode } from 'react';
import { pctOf, sparkPath } from '../lib/chartMath';
import { Icon } from './Icon';
import type { IconName } from './Icon';

type Tone = 'ok' | 'watch' | 'problem' | 'accent';

export function Card({ children, tone, className = '', style }: { children: ReactNode; tone?: 'watch' | 'accent'; className?: string; style?: CSSProperties }) {
  return <section className={`ui-card${tone ? ' ui-card-' + tone : ''}${className ? ' ' + className : ''}`} style={style}>{children}</section>;
}

/** Small capitalised label that names a card or section. */
export function Eyebrow({ children, tone }: { children: ReactNode; tone?: Tone }) {
  return <span className={`ui-eyebrow${tone ? ' ui-t-' + tone : ''}`}>{children}</span>;
}

/** A headline number with an optional unit. Numbers always use tabular figures. */
export function Figure({ value, unit, size = 'l', tone }: { value: ReactNode; unit?: ReactNode; size?: 's' | 'm' | 'l' | 'xl'; tone?: Tone }) {
  return (
    <span className={`ui-fig ui-fig-${size}${tone ? ' ui-t-' + tone : ''}`}>
      {value}{unit != null && <span className="ui-unit">{unit}</span>}
    </span>
  );
}

export function Button({ children, kind = 'primary', icon, onClick, disabled, full }: {
  children: ReactNode; kind?: 'primary' | 'ghost' | 'danger'; icon?: IconName; onClick?: () => void; disabled?: boolean; full?: boolean;
}) {
  return (
    <button type="button" className={`ui-btn ui-btn-${kind}${full ? ' ui-full' : ''}`} onClick={onClick} disabled={disabled}>
      {icon && <Icon name={icon} size={18} strokeWidth={2.2} />}{children}
    </button>
  );
}

/** Two to four mutually exclusive choices (Plan / History, Train 5am / 8pm / Rest). */
export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: ReadonlyArray<{ value: T; label: string }>; value: T; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="ui-seg" role="tablist" aria-label={label} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(o => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value}
          className={`ui-seg-b${o.value === value ? ' on' : ''}`} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

/** Big number with minus and plus either side (weight, reps). */
export function Stepper({ label, value, onDec, onInc, sub, decLabel, incLabel }: {
  label: string; value: ReactNode; onDec: () => void; onInc: () => void; sub?: ReactNode; decLabel?: string; incLabel?: string;
}) {
  return (
    <div className="ui-step">
      <span className="ui-eyebrow">{label}</span>
      <div className="ui-step-row">
        <button type="button" className="ui-step-b" aria-label={decLabel || `Less ${label.toLowerCase()}`} onClick={onDec}>−</button>
        <span className="ui-fig ui-fig-l">{value}</span>
        <button type="button" className="ui-step-b" aria-label={incLabel || `More ${label.toLowerCase()}`} onClick={onInc}>+</button>
      </div>
      {sub != null && <span className="ui-step-sub">{sub}</span>}
    </div>
  );
}

/** 7-day style trend line. Draws nothing until there are two real readings. */
export function Sparkline({ values, width = 96, height = 28, colour = 'var(--t2)' }: {
  values: ReadonlyArray<number | null | undefined>; width?: number; height?: number; colour?: string;
}) {
  const s = sparkPath(values, width, height, 3);
  if (!s) return null;
  return (
    <svg className="ui-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={s.d} fill="none" stroke={colour} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={s.cx} cy={s.cy} r={2.6} fill={colour} />
    </svg>
  );
}

/** Today's value as a dot against your normal band. Position carries the meaning, not length. */
export function RangeBar({ value, lo, hi, min, max, tone = 'ok' }: {
  value: number; lo: number; hi: number; min: number; max: number; tone?: Tone;
}) {
  const a = pctOf(lo, min, max), b = pctOf(hi, min, max), v = pctOf(value, min, max);
  return (
    <div className="ui-range" aria-hidden="true">
      <span className="ui-range-track" />
      <span className="ui-range-band" style={{ left: `${a}%`, width: `${Math.max(0, b - a)}%` }} />
      <span className={`ui-range-dot ui-bg-${tone}`} style={{ left: `${v}%` }} />
    </div>
  );
}
