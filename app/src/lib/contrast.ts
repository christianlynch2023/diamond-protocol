// WCAG 2.x contrast, used by the round 2 contrast test to hold every text colour to 4.5:1.
const ch = (v: number): number => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };

export function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) return null;
  const n = parseInt(m[1], 16);
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
}

export function contrast(a: string, b: string): number | null {
  const la = luminance(a), lb = luminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The colour tokens declared in the first :root block of a stylesheet. */
export function rootTokens(css: string): Record<string, string> {
  const block = /:root\s*\{([\s\S]*?)\}/.exec(css);
  const out: Record<string, string> = {};
  if (!block || !block[1]) return out;
  for (const m of block[1].matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) if (m[1] && m[2]) out[m[1]] = m[2];
  return out;
}
