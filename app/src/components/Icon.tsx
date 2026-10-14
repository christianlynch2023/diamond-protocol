// Line icons for round 2 (replaces the emoji). 24px grid, 1.7 stroke, drawn in currentColor
// so each icon takes the colour of whatever it sits in (muted tab, lime active tab, button text).
import type { ReactNode } from 'react';

export type IconName =
  | 'today' | 'meals' | 'program' | 'progress' | 'history' | 'body' | 'privacy' | 'tools'
  | 'settings' | 'chevron' | 'back' | 'plus' | 'check' | 'more' | 'timer';

const P: Record<IconName, ReactNode> = {
  today: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></>,
  meals: <><path d="M5 3v5a2 2 0 0 0 4 0V3M7 3v18" /><path d="M17 21V3c-2.2 1.2-3.5 3.6-3.5 6.5V13H17" /></>,
  program: <path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />,
  progress: <><path d="M3.5 17.5l5.5-5.5 4 4 7.5-7.5" /><path d="M15 8.5h5.5V14" /></>,
  history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" /><path d="M3.5 4v4h4M12 7.5V12l3 2" /></>,
  body: <><circle cx="12" cy="6.5" r="3" /><path d="M5.5 20.5c.6-4.2 3.1-6.5 6.5-6.5s5.9 2.3 6.5 6.5" /></>,
  privacy: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  tools: <path d="M14.5 6.5a4 4 0 0 0 4.9 4.9l-8.2 8.2a2.1 2.1 0 0 1-3-3l8.2-8.2a4 4 0 0 0-1.9-1.9z" />,
  settings: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  chevron: <path d="M9 6l6 6-6 6" />,
  back: <path d="M15 6l-6 6 6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  more: <><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>,
  timer: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 1.5M9.5 2.5h5" /></>,
};

export function Icon({ name, size = 22, strokeWidth = 1.7, title }: { name: IconName; size?: number; strokeWidth?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      {P[name]}
    </svg>
  );
}
