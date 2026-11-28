// The palette of the five predefined table colours (info, success, warning, danger, note). The User picks one accent per
// colour in the Project's settings; the soft, stripe and text shades, for light and dark themes, are derived from it in CSS.
// This module reads a palette from untrusted JSON and writes the CSS that overrides the colours' custom properties.

import { TABLE_COLORS, type TableColor } from "./snippets.ts";

export type TableColorName = Exclude<TableColor, "">;

/** The accents the User changed, as lower-case `#rrggbb` by colour name; a colour not in it keeps today's colour. */
export type TablePalette = Partial<Record<TableColorName, string>>;

/** Today's light accents (the `--tbl-accent` of each colour in document.css). */
export const DEFAULT_TABLE_ACCENTS: Record<TableColorName, string> = {
  info: "#3b82f6",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  note: "#8b5cf6",
};

/** A colour as `#rrggbb` lower case from `#rgb` or `#rrggbb` (any case, trimmed); null when it is neither. */
function toHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  if (/^#[0-9a-f]{3}$/.test(text)) return `#${[...text.slice(1)].map((digit) => digit + digit).join("")}`;
  return null;
}

/** The palette of a JSON value: known colour names with a valid colour only; anything else gives {}. */
export function normalizePalette(value: unknown): TablePalette {
  const palette: TablePalette = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) return palette;
  const entries = value as Record<string, unknown>;
  for (const name of TABLE_COLORS) {
    const hex = Object.hasOwn(entries, name) ? toHex(entries[name]) : null;
    if (hex) palette[name] = hex;
  }
  return palette;
}

const mix = (color: string, share: number, other: string) => `color-mix(in srgb, ${color} ${share}%, ${other})`;

const declarations = (accent: string, soft: string, stripe: string, text: string) =>
  `{ --tbl-accent: ${accent}; --tbl-accent-soft: ${soft}; --tbl-accent-stripe: ${stripe}; --tbl-accent-text: ${text}; }`;

/**
 * The CSS that gives each colour of the palette its accent and the shades derived from it. The class is doubled so the
 * rules win over the stylesheet's own whatever the order they are inserted in. "document" is for the reading view and the
 * snippet dialog (light and dark); "page" is for the HTML view and the downloaded HTML (light only). An entry that is not
 * a `#rrggbb` is ignored, so nothing unchecked reaches the CSS.
 */
export function tablePaletteCss(palette: TablePalette, target: "document" | "page"): string {
  const rules: string[] = [];
  for (const name of TABLE_COLORS) {
    const accent = toHex(palette[name]);
    if (!accent) continue;
    const selector = `table.table-color-${name}.table-color-${name}`;
    const light = declarations(accent, mix(accent, 20, "white"), mix(accent, 8, "white"), mix(accent, 45, "black"));
    if (target === "page") {
      rules.push(`${selector} ${light}`);
      continue;
    }
    const shade = mix(accent, 50, "black");
    const dark = declarations(mix(accent, 70, "white"), mix(shade, 55, "transparent"), mix(shade, 35, "transparent"), mix(accent, 30, "white"));
    rules.push(`.document ${selector} ${light}`, `:root[data-mode="dark"]:not(.ld-white-background) .document ${selector} ${dark}`);
  }
  return rules.join("\n");
}
