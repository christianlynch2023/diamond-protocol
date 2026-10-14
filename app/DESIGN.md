# Diamond Protocol design system (round 2)

The rules behind the round 2 look. Tokens and component styles live in `src/theme.css`;
building blocks live in `src/components/ui.tsx` and `src/components/Icon.tsx`.

## Colour roles
| Role | Token | Use |
|---|---|---|
| Action and "you are here" | `--acc` #c4ff00 | Primary buttons, active tab, current week, your latest data point |
| Good | `--ok` #3fe0c5 | On target, in range, done |
| Watch | `--warn` #ffb020 | Below target, deload, low recovery, stalled |
| Problem | `--err` #ff5a4f | Destructive actions, real errors |
| Neutral information | `--inf` #b8c2cf | Anything informational (blue is retired) |
| Text | `--t`, `--t2`, `--t3` | Primary, muted, faintest allowed |

Contrast: every text colour is 4.5:1 or better on the surface it sits on. Never put status colours on
decoration. Readiness is information: low recovery is shown in amber, never red, and never changes the plan.

## Type
Barlow for text, Barlow Semi Condensed for figures. Fonts are bundled (`@fontsource`), so they work offline.
Scale: caption 12, label 13, body 15, title 20, screen 30, figure 44. Nothing below 11px.
Capitals are for small section labels only (11px, .1em tracking). Buttons and tabs are sentence case.
Every number is tabular and carries a unit, a date or a comparison.

## Building blocks
`Card`, `Eyebrow`, `Figure`, `Button`, `Segmented`, `Stepper`, `Sparkline`, `RangeBar`, `Icon`.
Touch targets are at least 44px. Chart maths (`lib/chartMath.ts`) is pure and tested.

## Round 2 phases
1. Visual foundation (this layer) · 2. Navigation, five tabs · 3. Today · 4. Fuel ·
5. Session flow · 6. Body and Progress · 7. Hardening and audit.
