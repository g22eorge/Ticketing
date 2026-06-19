// ── Minimal Document Design Tokens ─────────────────────────────────────────
// True minimal: no borders, no cards, no colored blocks.
// Hierarchy through typography weight, size, and spacing alone.
// One accent rule per document for brand moment.
// ───────────────────────────────────────────────────────────────────────────

export const T = {
  ink: "#0a0a0a",
  body: "#1c1917",
  muted: "#78716c",
  faint: "#a8a29e",
  rule: "#d6d3d1",
  accent: "#b08968",
  warm: "#fafaf9",
  white: "#ffffff",

  font: {
    display: 20,
    title: 13,
    heading: 10.5,
    body: 9,
    label: 7.5,
    micro: 6.5,
  },

  space: {
    xs: 2,
    sm: 4,
    md: 8,
    lg: 14,
    xl: 22,
    pageX: 36,
    pageY: 32,
  },

  radius: 2,
} as const;

export function brandLine(name: string, tagline?: string) {
  return { name, tagline: tagline || "Service Desk" };
}
