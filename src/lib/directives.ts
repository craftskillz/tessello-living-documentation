// The catalogue of block directives (ADR 0005): HTML comments written on the lines before the block they apply to,
// as the original defined them. A comment is `<!-- name: value -->` or a bare `<!-- name -->`. Pure: this module only
// reads comment text and says what it means; render.ts applies it to the Document.

export interface Directive {
  name: string;
  value: string | null;
}

/** The directive written in the text of a comment (what sits between `<!--` and `-->`), or null if it is not one. */
export function parseDirective(comment: string): Directive | null {
  const match = /^\s*(\/?[a-z][a-z0-9-]*)\s*(?::\s*([\s\S]*?))?\s*$/i.exec(comment);
  if (!match) return null;
  const name = match[1]!.toLowerCase();
  return { name, value: match[2] === undefined ? null : match[2] };
}

const oneOf = (allowed: readonly string[], value: string | null): string | null =>
  value !== null && allowed.includes(value) ? value : null;

// ---- tables ----

export interface TableAttrs {
  /** The density; null is the default one. */
  style: "compact" | "intermediate" | null;
  fill: "striped" | "full" | null;
  border: string | null;
  rounded: boolean;
  color: string | null;
  /** The bare `table-checkboxes`: the first column holds a check box per row (`[ ]` or `[x]` in the Markdown). */
  checkboxes: boolean;
}

const TABLE_DENSITIES = ["compact", "intermediate"];
const TABLE_FILLS = ["striped", "full"];
const TABLE_BORDERS = ["bordered", "soft-bordered", "borderless"];
const TABLE_COLORS = ["info", "success", "warning", "danger", "note"];

/**
 * `table-style` (density), `table-fill`, `table-border`, the bare `table-rounded`, `table-color` and the bare
 * `table-checkboxes`; invalid values are ignored, the last valid one wins per attribute. The original's `table-style` also carried the fill and the border:
 * `striped` and `full` (which was rounded) set the fill, `bordered`, `soft-bordered` and `borderless` the border.
 */
export function tableAttrs(directives: Directive[]): TableAttrs {
  const attrs: TableAttrs = { style: null, fill: null, border: null, rounded: false, color: null, checkboxes: false };
  for (const { name, value } of directives) {
    const word = value === null ? null : value.trim();
    if (name === "table-style") {
      attrs.style = (oneOf(TABLE_DENSITIES, word) as TableAttrs["style"]) ?? attrs.style;
      const legacyFill = oneOf(TABLE_FILLS, word) as TableAttrs["fill"];
      attrs.fill = legacyFill ?? attrs.fill;
      if (legacyFill === "full") attrs.rounded = true;
      attrs.border = oneOf(TABLE_BORDERS, word) ?? attrs.border; // legacy: table-style: bordered
    }
    if (name === "table-fill") attrs.fill = (oneOf(TABLE_FILLS, word) as TableAttrs["fill"]) ?? attrs.fill;
    if (name === "table-border") attrs.border = oneOf(TABLE_BORDERS, word) ?? attrs.border;
    if (name === "table-rounded" && value === null) attrs.rounded = true;
    if (name === "table-color") attrs.color = oneOf(TABLE_COLORS, word) ?? attrs.color;
    if (name === "table-checkboxes" && value === null) attrs.checkboxes = true;
  }
  return attrs;
}

// ---- images and code blocks: a width and an alignment ----

const WIDTHS = ["full", "3/4", "2/3", "1/2", "1/3", "1/4"];
const ALIGNS = ["left", "center", "right"];
const WIDTH_SUFFIX: Record<string, string> = { full: "full", "3/4": "three-quarters", "2/3": "two-thirds", "1/2": "half", "1/3": "third", "1/4": "quarter" };

export interface SizeAttrs {
  width: string | null;
  align: string | null;
  /** The suffix of the width's class (`half` for `1/2`). */
  widthClass: string | null;
}

/** `<kind>-width` and `<kind>-align` (`image` or `code`); invalid values are ignored, the last valid one wins. */
export function sizeAttrs(kind: "image" | "code", directives: Directive[]): SizeAttrs {
  let width: string | null = null;
  let align: string | null = null;
  for (const { name, value } of directives) {
    const word = value === null ? null : value.trim();
    if (name === `${kind}-width`) width = oneOf(WIDTHS, word) ?? width;
    if (name === `${kind}-align`) align = oneOf(ALIGNS, word) ?? align;
  }
  return { width, align, widthClass: width && WIDTH_SUFFIX[width]! };
}

// ---- blockquotes: callouts ----

export interface QuoteAttrs {
  type: string | null;
  title: string | null;
  icon: boolean;
}

const CALLOUT_ALIASES: Record<string, string> = { note: "info", tip: "success", caution: "warning", danger: "error" };
const CALLOUT_TYPES = ["info", "success", "warning", "error", ...Object.keys(CALLOUT_ALIASES)];

/** The canonical callout type (`tip` is `success`), or null when the value is not a known type. */
const calloutType = (value: string | null): string | null => {
  const word = oneOf(CALLOUT_TYPES, value === null ? null : value.trim());
  return word && (CALLOUT_ALIASES[word] ?? word);
};

/** `quote-type`, `quote-title` and the bare `quote-icon`. A blockquote is a callout when any of them is set. */
export function quoteAttrs(directives: Directive[]): QuoteAttrs {
  const attrs: QuoteAttrs = { type: null, title: null, icon: false };
  for (const { name, value } of directives) {
    if (name === "quote-type") attrs.type = calloutType(value);
    if (name === "quote-title" && value !== null && value !== "") attrs.title = value;
    if (name === "quote-icon") attrs.icon = true;
  }
  return attrs;
}

const ICONS: Record<string, string> = {
  info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>',
  success:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
  warning:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>',
  error:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/></svg>',
};

/** The SVG of a callout type; the info icon for no type. */
export const calloutIcon = (type: string | null): string => ICONS[type ?? ""] ?? ICONS.info!;

// ---- column layouts ----

export interface ColumnOptions {
  ratio: string | null;
  verticalAlign: string | null;
  textAlign: string | null;
  gap: string | null;
}

export type ColumnComment = { kind: "open"; options: ColumnOptions } | { kind: "column" } | { kind: "close" };

const VERTICAL_ALIGNS = ["top", "center", "bottom", "stretch"];
const TEXT_ALIGNS = ["left", "center", "right", "justify"];
const GAPS = ["sm", "md", "lg"];

/** What a comment means to a column layout: `layout-columns: 2/1 | gap: lg`, `col`, `/layout-columns`. */
export function parseColumnComment(comment: string): ColumnComment | null {
  if (/^\s*col\s*$/i.test(comment)) return { kind: "column" };
  if (/^\s*\/layout-columns\s*$/i.test(comment)) return { kind: "close" };
  if (!/^\s*layout-columns\b/i.test(comment)) return null;
  const options: ColumnOptions = { ratio: null, verticalAlign: null, textAlign: null, gap: null };
  for (const part of comment.trim().replace(/^layout-columns\s*:?\s*/i, "").split("|")) {
    const text = part.trim();
    const pair = /^([\w-]+)\s*:\s*(.+)$/.exec(text);
    if (pair) {
      const key = pair[1]!.toLowerCase();
      const value = pair[2]!.trim().toLowerCase();
      if (key === "vertical-align") options.verticalAlign = oneOf(VERTICAL_ALIGNS, value) ?? options.verticalAlign;
      else if (key === "text-align") options.textAlign = oneOf(TEXT_ALIGNS, value) ?? options.textAlign;
      else if (key === "gap") options.gap = oneOf(GAPS, value) ?? options.gap;
      else if (key === "ratio") options.ratio = value.replace(/\s+/g, "");
    } else if (/^\d+(\s*\/\s*\d+)*$/.test(text)) options.ratio = text.replace(/\s+/g, "");
  }
  return { kind: "open", options };
}

/** The `grid-template-columns` of a layout: the ratio when it fits the column count, equal columns otherwise. */
export function gridTemplate(ratio: string | null, columnCount: number): string {
  const equal = `repeat(${columnCount}, minmax(0, 1fr))`;
  if (!ratio) return equal;
  if (ratio.includes("/")) {
    const fractions = ratio.split("/").map((each) => parseInt(each, 10));
    return fractions.length === columnCount && fractions.every((each) => each > 0) ? fractions.map((each) => `${each}fr`).join(" ") : equal;
  }
  const count = parseInt(ratio, 10);
  return count > 0 ? `repeat(${count}, minmax(0, 1fr))` : equal;
}

// ---- cards ----

export interface CardOptions {
  /** The title, as written (text, never markup); null without one. */
  title: string | null;
  style: string | null;
  /** One of the palette's backgrounds; null keeps the style's own. */
  color: string | null;
  /** One of the images' widths (`1/2`…). */
  width: string | null;
  align: string | null;
}

export type CardComment = { kind: "open"; options: CardOptions } | { kind: "close" };

export const CARD_STYLES = ["plain", "bristol", "deck"] as const;
/** The card backgrounds (snippets.ts holds their colours): ten light ones, then two dark ones. */
export const CARD_COLORS = ["white", "cream", "lemon", "peach", "rose", "lavender", "sky", "mint", "sage", "slate", "navy", "forest"] as const;

/** The width's class suffix (`half` for `1/2`), as for images; null for none. */
export const widthClassOf = (width: string | null): string | null => (width === null ? null : (WIDTH_SUFFIX[width] ?? null));

/**
 * What a comment means to a card: `card: Title | style: deck | color: sky | width: 1/2 | align: right` opens one (with a colon, the
 * first part is the title, colons and all; without one, every part is an option), `/card` closes it. Invalid options
 * are ignored.
 */
export function parseCardComment(comment: string): CardComment | null {
  if (/^\s*\/card\s*$/i.test(comment)) return { kind: "close" };
  const open = /^\s*card(?![\w-])\s*(:?)([\s\S]*)$/i.exec(comment);
  if (!open) return null;
  const parts = open[2]!.split("|");
  const options: CardOptions = { title: null, style: null, color: null, width: null, align: null };
  if (open[1] === ":") options.title = parts.shift()!.trim() || null;
  for (const part of parts) {
    const pair = /^\s*([\w-]+)\s*:\s*(.+?)\s*$/.exec(part);
    if (!pair) continue;
    const key = pair[1]!.toLowerCase();
    const value = pair[2]!.toLowerCase();
    if (key === "style") options.style = oneOf(CARD_STYLES, value) ?? options.style;
    else if (key === "color") options.color = oneOf(CARD_COLORS, value) ?? options.color;
    else if (key === "width") options.width = oneOf(WIDTHS, value) ?? options.width;
    else if (key === "align") options.align = oneOf(ALIGNS, value) ?? options.align;
  }
  return { kind: "open", options };
}
