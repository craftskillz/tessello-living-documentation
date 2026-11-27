// The page styles shared by both templates: the reading view's rules for directives, columns, cards, compare, Kanban preview,
// missing image and Tag markers, without the `.document` prefix and without the dark rules (the page keeps its light colours).

export const SHARED_CSS = String.raw`
.ld-html-page {
  --doc-missing: #b45309;
  --doc-captions: #6b7280;
}
img[class*="ld-image-width-"] { max-height: none; }
/* An Image that is not in the Project: its alt text, and a mark. */
.image-missing {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  padding: 0.2em 0.6em;
  border: 1px dashed var(--doc-missing);
  border-radius: 0.375rem;
  color: var(--doc-missing);
  font-style: italic;
}
.image-missing::before {
  content: "\26A0";
  font-style: normal;
}
del {
  opacity: 0.75;
}
/* ── Images: width and alignment presets (image-width / image-align comments) ── */
img[class*="ld-image-width-"] {
  max-width: 100%;
  height: auto;
}
img.ld-image-width-full { width: 100%; }
img.ld-image-width-three-quarters { width: 75%; }
img.ld-image-width-two-thirds { width: 66.6667%; }
img.ld-image-width-half { width: 50%; }
img.ld-image-width-third { width: 33.3333%; }
img.ld-image-width-quarter { width: 25%; }
img[class*="ld-image-align-"] { display: block; }
img.ld-image-align-left { margin-left: 0; margin-right: auto; }
img.ld-image-align-center { margin-left: auto; margin-right: auto; }
img.ld-image-align-right { margin-left: auto; margin-right: 0; }
/* ── Column layouts (layout-columns comments); grid-template-columns is inline ── */
.ld-columns {
  display: grid;
  gap: 1rem;
  align-items: center;
  margin: 1rem 0;
}
.ld-columns.ld-valign-top { align-items: start; }
.ld-columns.ld-valign-bottom { align-items: end; }
.ld-columns.ld-valign-stretch { align-items: stretch; }
.ld-columns.ld-gap-sm { gap: 0.5rem; }
.ld-columns.ld-gap-lg { gap: 2rem; }
.ld-columns.ld-text-left .ld-column { text-align: left; }
.ld-columns.ld-text-center .ld-column { text-align: center; }
.ld-columns.ld-text-right .ld-column { text-align: right; }
.ld-columns.ld-text-justify .ld-column { text-align: justify; }
.ld-column { min-width: 0; }
.ld-column > :first-child { margin-top: 0; }
.ld-column > :last-child { margin-bottom: 0; }
@media (max-width: 640px) {
  .ld-columns { grid-template-columns: 1fr !important; }
}
/* ── Cards (card comments): a frame around free Markdown, its title, style, width and alignment ── */
.ld-card { box-sizing: border-box; width: 100%; margin: 1.75em 0; }
.ld-card-width-full { width: 100%; }
.ld-card-width-three-quarters { width: 75%; }
.ld-card-width-two-thirds { width: 66.6667%; }
.ld-card-width-half { width: 50%; }
.ld-card-width-third { width: 33.3333%; }
.ld-card-width-quarter { width: 25%; }
.ld-card-align-center { margin-left: auto; margin-right: auto; }
.ld-card-align-right { margin-left: auto; margin-right: 0; }
.ld-card-title { font-weight: 700; }
.ld-card-body > :first-child { margin-top: 0; }
.ld-card-body > :last-child { margin-bottom: 0; }
.ld-card-plain { --card-frame: #d1d5db; border: 1px solid var(--card-frame); border-radius: 10px; box-shadow: 0 1px 3px rgb(0 0 0 / 0.08); }
.ld-card-plain > .ld-card-title { padding: 0.7rem 1.1rem; color: var(--doc-headings, #111827); border-bottom: 1px solid var(--card-frame); }
.ld-card-plain > .ld-card-body { padding: 0.9rem 1.1rem; }
/* Paper cards stay light in a dark Document, like a real card on the desk: the light palette inside them. */
:is(.ld-card-bristol, .ld-card-deck) {
  --doc-body: #374151; --doc-headings: #111827; --doc-bold: #111827; --doc-counters: #6b7280; --doc-bullets: #d1d5db;
  --doc-hr: #e5e7eb; --doc-quotes: #111827; --doc-quote-borders: #e5e7eb; --doc-captions: #6b7280; --doc-code: #111827;
  --doc-pre-code: #24292e; --doc-pre-bg: #f6f8fa; --doc-pre-bg-solid: #f6f8fa; --doc-th-borders: #d1d5db; --doc-td-borders: #e5e7eb;
  color: var(--doc-body);
}
/* A bristol index card: cream paper, a red title, punched holes across the top, two in every four places (● · · ●),
   cut out so they show what is behind. */
.ld-card-bristol {
  /* Light squares, and a red rule under the title from edge to edge. */
  --bristol-grid: rgb(59 130 246 / 0.13);
  --bristol-rule: rgb(220 38 38 / 0.55);
  background: radial-gradient(circle at 0.8rem 0.85rem, transparent 0.3rem, rgb(0 0 0 / 0.22) 0.31rem 0.4rem, transparent 0.42rem) 0 0 / 6.4rem 100% repeat-x, radial-gradient(circle at 5.6rem 0.85rem, transparent 0.3rem, rgb(0 0 0 / 0.22) 0.31rem 0.4rem, transparent 0.42rem) 0 0 / 6.4rem 100% repeat-x,
    linear-gradient(var(--bristol-grid) 1px, transparent 1px) 0 0 / 100% 1.25rem,
    linear-gradient(90deg, var(--bristol-grid) 1px, transparent 1px) 0 0 / 1.25rem 100% #f8efd4;
  border: 1px solid #e6dab5;
  border-radius: 3px;
  padding: 1.7rem 1.4rem 1.1rem;
  /* Each tile is four places wide with a hole in the first and the last: the two layers intersect, so both holes are cut. */
  -webkit-mask: radial-gradient(circle at 0.8rem 0.85rem, transparent 0.3rem, #000 0.32rem) 0 0 / 6.4rem 100% repeat-x, radial-gradient(circle at 5.6rem 0.85rem, transparent 0.3rem, #000 0.32rem) 0 0 / 6.4rem 100% repeat-x;
  -webkit-mask-composite: source-in;
  mask: radial-gradient(circle at 0.8rem 0.85rem, transparent 0.3rem, #000 0.32rem) 0 0 / 6.4rem 100% repeat-x, radial-gradient(circle at 5.6rem 0.85rem, transparent 0.3rem, #000 0.32rem) 0 0 / 6.4rem 100% repeat-x;
  mask-composite: intersect;
}
.ld-card-bristol > .ld-card-title { color: #9b2c2c; margin: 0 -1.4rem 0.7rem; padding: 0 1.4rem 0.35rem; border-bottom: 2px solid var(--bristol-rule); }
.ld-card-bristol[class*="ld-card-color-"] { --bristol-grid: color-mix(in srgb, var(--card-ink) 12%, transparent); --bristol-rule: color-mix(in srgb, var(--card-title) 60%, transparent); }
/* A playing card: white face, rounded corners, a shadow, a double lozenge in both top corners, a centred serif title. */
.ld-card-deck { --suit: #b91c1c; position: relative; background: #fff; border: 1px solid #d6d3d1; border-radius: 16px; box-shadow: 0 10px 25px rgb(0 0 0 / 0.18); padding: 2.4rem 3rem; }
.ld-card-deck::before,
.ld-card-deck::after { content: "\25C8"; position: absolute; top: 0.6rem; color: var(--suit); font: 1.3rem/1 Georgia, serif; }
.ld-card-deck::before { left: 0.8rem; }
.ld-card-deck::after { right: 0.8rem; }
.ld-card-deck > .ld-card-title { text-align: center; font: 700 1.35rem Georgia, serif; color: var(--suit); margin-bottom: 0.6rem; }
/* A coloured card (the card's color option): its background from the palette, the ink of its text and of its title chosen with it
   (snippets.ts holds the same palette). It keeps its colours in a dark Document, like the paper cards. */
.ld-card-color-white { --card-bg: #ffffff; --card-ink: #374151; --card-title: #111827; }
.ld-card-color-cream { --card-bg: #fdf8e7; --card-ink: #3f3a2e; --card-title: #8a5a00; }
.ld-card-color-lemon { --card-bg: #fef9c3; --card-ink: #422006; --card-title: #854d0e; }
.ld-card-color-peach { --card-bg: #ffedd5; --card-ink: #431407; --card-title: #c2410c; }
.ld-card-color-rose { --card-bg: #ffe4e6; --card-ink: #4c0519; --card-title: #be123c; }
.ld-card-color-lavender { --card-bg: #ede9fe; --card-ink: #2e1065; --card-title: #6d28d9; }
.ld-card-color-sky { --card-bg: #e0f2fe; --card-ink: #082f49; --card-title: #0369a1; }
.ld-card-color-mint { --card-bg: #dcfce7; --card-ink: #052e16; --card-title: #15803d; }
.ld-card-color-sage { --card-bg: #e7efe3; --card-ink: #1f2d1a; --card-title: #3f6212; }
.ld-card-color-slate { --card-bg: #e2e8f0; --card-ink: #1e293b; --card-title: #334155; }
.ld-card-color-navy { --card-bg: #1e293b; --card-ink: #e2e8f0; --card-title: #fde68a; }
.ld-card-color-forest { --card-bg: #14532d; --card-ink: #ecfdf5; --card-title: #bbf7d0; }
.ld-card[class*="ld-card-color-"] {
  --doc-body: var(--card-ink); --doc-bold: var(--card-ink); --doc-headings: var(--card-title); --doc-quotes: var(--card-ink); --doc-code: var(--card-ink);
  --doc-counters: color-mix(in srgb, var(--card-ink) 70%, var(--card-bg)); --doc-captions: color-mix(in srgb, var(--card-ink) 70%, var(--card-bg));
  --doc-bullets: color-mix(in srgb, var(--card-ink) 35%, var(--card-bg)); --doc-th-borders: color-mix(in srgb, var(--card-ink) 25%, var(--card-bg));
  --doc-hr: color-mix(in srgb, var(--card-ink) 15%, var(--card-bg)); --doc-td-borders: color-mix(in srgb, var(--card-ink) 15%, var(--card-bg));
  --doc-quote-borders: color-mix(in srgb, var(--card-ink) 20%, var(--card-bg));
  --card-frame: color-mix(in srgb, var(--card-ink) 22%, var(--card-bg));
  --suit: var(--card-title);
  color: var(--doc-body);
  background-color: var(--card-bg);
}
.ld-card[class*="ld-card-color-"] > .ld-card-title { color: var(--card-title); }
@media (max-width: 640px) {
  .ld-card[class*="ld-card-width-"] { width: 100%; }
}
/* ── Code blocks: width and alignment presets, and the collapsed look of long ones ── */
pre[class*="ld-code-width-"] { max-width: 100%; }
pre.ld-code-width-full { width: 100%; }
pre.ld-code-width-three-quarters { width: 75%; }
pre.ld-code-width-two-thirds { width: 66.6667%; }
pre.ld-code-width-half { width: 50%; }
pre.ld-code-width-third { width: 33.3333%; }
pre.ld-code-width-quarter { width: 25%; }
pre[class*="ld-code-align-"] { display: block; }
pre.ld-code-align-left { margin-left: 0; margin-right: auto; }
pre.ld-code-align-center { margin-left: auto; margin-right: auto; }
pre.ld-code-align-right { margin-left: auto; margin-right: 0; }
/* ── Tables: style, border and color presets ── */
.overflow-x-auto {
  overflow-x: auto;
}
table.table-color-info {
  --tbl-accent: rgb(59 130 246);
  --tbl-accent-soft: rgb(219 234 254);
  --tbl-accent-stripe: rgb(239 246 255);
  --tbl-accent-text: rgb(30 58 138);
}
table.table-color-success {
  --tbl-accent: rgb(34 197 94);
  --tbl-accent-soft: rgb(220 252 231);
  --tbl-accent-stripe: rgb(240 253 244);
  --tbl-accent-text: rgb(20 83 45);
}
table.table-color-warning {
  --tbl-accent: rgb(245 158 11);
  --tbl-accent-soft: rgb(254 243 199);
  --tbl-accent-stripe: rgb(255 251 235);
  --tbl-accent-text: rgb(120 53 15);
}
table.table-color-danger {
  --tbl-accent: rgb(239 68 68);
  --tbl-accent-soft: rgb(254 226 226);
  --tbl-accent-stripe: rgb(254 242 242);
  --tbl-accent-text: rgb(127 29 29);
}
table.table-color-note {
  --tbl-accent: rgb(139 92 246);
  --tbl-accent-soft: rgb(233 213 255);
  --tbl-accent-stripe: rgb(245 243 255);
  --tbl-accent-text: rgb(76 29 149);
}
table[class*="table-color-"] thead th {
  background-color: var(--tbl-accent-soft);
  color: var(--tbl-accent-text);
  border-bottom-color: var(--tbl-accent);
}
table[class*="table-color-"] :is(th,
td) {
  border-bottom-color: var(--tbl-accent-soft);
}
table[class*="table-color-"] thead th {
  border-bottom-color: var(--tbl-accent);
}
table.table-style-compact {
  font-size: 0.85em;
  line-height: 1.35;
}
table.table-style-compact :is(th,
td) {
  padding: 0.2rem 0.5rem;
}
table.table-style-intermediate {
  font-size: 0.875em;
  line-height: 1.5;
}
table.table-style-intermediate :is(th, td) {
  padding: 0.4rem 0.75rem;
}

table.table-fill-striped tbody tr:nth-child(odd) {
  background-color: var(--tbl-accent-stripe, rgb(243 244 246));
}

/* Borders draw their lines in --tbl-line: the color's accent; Softened borders a tone between it and the soft line (the color's soft accent, else the neutral row separator). */
table.table-border-bordered {
  --tbl-line: var(--tbl-accent, rgb(209 213 219));
}
table.table-border-soft-bordered {
  --tbl-line: color-mix(in srgb, var(--tbl-accent, rgb(209 213 219)) 55%, var(--tbl-accent-soft, var(--line)));
}
table.table-fill-full.table-border-soft-bordered {
  --tbl-full-line: color-mix(in srgb, var(--tbl-accent, rgb(148 163 184)) 22%, var(--tbl-accent-soft, rgb(226 232 240)));
}

/* Full: filled cells on a uniform grid with a square outer edge (the rounded frame is Rounded's job); one line color drives the grid. */
table.table-fill-full {
  --tbl-full-line: var(--tbl-accent-soft, rgb(226 232 240));
  border-collapse: separate;
  border-spacing: 0;
}
table.table-fill-full.table-border-bordered {
  --tbl-full-line: color-mix(in srgb, var(--tbl-accent, rgb(148 163 184)) 45%, var(--tbl-accent-soft, rgb(226 232 240)));
}
table.table-fill-full :is(th, td),
table.table-fill-full thead th {
  border: none;
  border-right: 1px solid var(--tbl-full-line);
  border-bottom: 1px solid var(--tbl-full-line);
  background-color: var(--tbl-accent-stripe, rgb(248 250 252));
}
table.table-fill-full tr > *:last-child {
  border-right: none;
}
table.table-fill-full tbody tr:last-child > * {
  border-bottom: none;
}
/* Full with Borders (square): the outer edge is the inner line: the table adds the top and left, the edge cells keep their right and bottom. */
table.table-fill-full:is(.table-border-bordered, .table-border-soft-bordered):not(.table-rounded) {
  border-top: 1px solid var(--tbl-full-line);
  border-left: 1px solid var(--tbl-full-line);
}
table.table-fill-full:is(.table-border-bordered, .table-border-soft-bordered):not(.table-rounded) tr > *:last-child {
  border-right: 1px solid var(--tbl-full-line);
}
table.table-fill-full:is(.table-border-bordered, .table-border-soft-bordered):not(.table-rounded) tbody tr:last-child > * {
  border-bottom: 1px solid var(--tbl-full-line);
}

table:is(.table-border-bordered, .table-border-soft-bordered):not(.table-fill-full):not(.table-rounded) {
  border-collapse: collapse;
}
table:is(.table-border-bordered, .table-border-soft-bordered):not(.table-fill-full):not(.table-rounded),
table:is(.table-border-bordered, .table-border-soft-bordered):not(.table-fill-full):not(.table-rounded) :is(th, td) {
  border: 1px solid var(--tbl-line);
}
table.table-border-borderless :is(th, td) {
  border-left: none;
  border-right: none;
  border-top: none;
}

/* Rounded: an outer frame clipped to rounded corners, on top of any density, fill and color.
   Alone it keeps the horizontal separators; with Borders the whole grid sits inside the frame. The frame replaces the
   last row's bottom line and the last column's right line, so no edge is drawn twice. */
table.table-rounded {
  --tbl-frame: var(--tbl-accent-soft, rgb(226 232 240));
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid var(--tbl-frame);
  border-radius: 0.5rem;
  overflow: hidden;
}
table.table-rounded:is(.table-border-bordered, .table-border-soft-bordered) {
  --tbl-frame: var(--tbl-line);
}
table.table-rounded.table-fill-full {
  --tbl-frame: var(--tbl-full-line);
}
table.table-rounded:is(.table-border-bordered, .table-border-soft-bordered) :is(th, td) {
  border-right: 1px solid var(--tbl-frame);
  border-bottom: 1px solid var(--tbl-frame);
}
table.table-rounded tbody tr:last-child > * {
  border-bottom: none;
}
table.table-rounded:is(.table-border-bordered, .table-border-soft-bordered) tr > *:last-child {
  border-right: none;
}
table.table-rounded.table-border-borderless :is(th, td) {
  border-right: none;
}
/* Without Borders (and without Full, whose grid is uniform), the header's line is a row separator like the others. */
table:not(.table-border-bordered):not(.table-border-soft-bordered):not(.table-fill-full) thead th {
  border-bottom-color: var(--tbl-accent-soft, var(--line));
}

/* ── Callouts (quote-type / quote-title / quote-icon comments) ── */
blockquote.ld-callout {
  --callout-accent: #9ca3af;
  --callout-bg: #f9fafb;
  --callout-title-color: #374151;
  --callout-icon-color: #6b7280;
  border: none;
  border-left: 4px solid var(--callout-accent);
  background: var(--callout-bg);
  border-radius: 0 0.5rem 0.5rem 0;
  padding: 1rem 1.25rem;
  font-style: normal;
  font-weight: 400;
  color: inherit;
  margin-left: 0;
  margin-right: 0;
}
blockquote.ld-callout:not([class*="ld-callout-"]) {
  border: 1px solid #e5e7eb;
  border-left: 4px solid var(--callout-accent);
}
blockquote.ld-callout p {
  color: inherit;
  margin-top: 0.4em;
  margin-bottom: 0.4em;
}
blockquote.ld-callout p:first-of-type { margin-top: 0; }
blockquote.ld-callout p:last-of-type { margin-bottom: 0; }
.ld-callout-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
  font-size: 1.05em;
  color: var(--callout-title-color);
  margin-bottom: 0.5rem;
  line-height: 1.3;
}
.ld-callout-icon {
  display: inline-flex;
  align-items: center;
  color: var(--callout-icon-color);
  flex-shrink: 0;
  transform: scale(1.35);
  margin-right: 0.15rem;
}
.ld-callout-icon-inline {
  vertical-align: middle;
  margin-right: 0.4rem;
  margin-top: -0.1em;
  transform: scale(1.2);
}
blockquote.ld-callout-info {
  --callout-accent: rgb(59 130 246);
  --callout-bg: rgb(239 246 255);
  --callout-title-color: rgb(30 58 138);
  --callout-icon-color: rgb(59 130 246);
}
blockquote.ld-callout-success {
  --callout-accent: rgb(34 197 94);
  --callout-bg: rgb(240 253 244);
  --callout-title-color: rgb(20 83 45);
  --callout-icon-color: rgb(34 197 94);
}
blockquote.ld-callout-warning {
  --callout-accent: rgb(245 158 11);
  --callout-bg: rgb(255 251 235);
  --callout-title-color: rgb(120 53 15);
  --callout-icon-color: rgb(245 158 11);
}
blockquote.ld-callout-error {
  --callout-accent: rgb(239 68 68);
  --callout-bg: rgb(254 242 242);
  --callout-title-color: rgb(127 29 29);
  --callout-icon-color: rgb(239 68 68);
}
/* ── Compare: the source and its rendering side by side; the labels come from the renderer (data-label) ── */
.ld-compare {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  border: 1px solid rgb(229 231 235);
  border-radius: 0.5rem;
  overflow: hidden;
  margin: 1.5rem 0;
  font-size: 0.92em;
}
:is(.ld-compare-source,
.ld-compare-render) {
  padding: 1rem 1.25rem;
  position: relative;
}
:is(.ld-compare-source,
.ld-compare-render)::before {
  content: attr(data-label);
  display: block;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 0.6rem;
  color: var(--doc-captions);
}
.ld-compare-source {
  background-color: rgb(249 250 251);
  border-right: 1px solid rgb(229 231 235);
}
.ld-compare-render {
  background-color: #fff;
}
.ld-compare-render > :first-child { margin-top: 0; }
.ld-compare-render > :last-child { margin-bottom: 0; }
.ld-compare-source > pre {
  margin: 0;
  border-radius: 0.25rem;
  font-size: 0.85em;
  background-color: #fff;
  color: #24292e;
}
@media (max-width: 640px) {
  .ld-compare { grid-template-columns: 1fr; }
  .ld-compare-source {
    border-right: none;
    border-bottom: 1px solid rgb(229 231 235);
  }
}
/* ── Tag markers, Mermaid diagrams and Kanban boards ── */
.ld-tag-marker {
  display: inline-block;
  white-space: nowrap;
  font-size: 0.8em;
  line-height: 1.4;
  padding: 0 0.45em;
  margin: 0 0.15em;
  vertical-align: 0.1em;
  border-radius: 999px;
  background: #fde047;
  color: #713f12;
  cursor: help;
}
.ld-mermaid { margin: 1em 0; text-align: center; overflow-x: auto; }
.ld-mermaid > svg { max-width: 100%; height: auto; }
.ld-mermaid[class*="ld-code-width-"] { max-width: 100%; }
.ld-mermaid.ld-code-width-full { width: 100%; }
.ld-mermaid.ld-code-width-three-quarters { width: 75%; }
.ld-mermaid.ld-code-width-two-thirds { width: 66.6667%; }
.ld-mermaid.ld-code-width-half { width: 50%; }
.ld-mermaid.ld-code-width-third { width: 33.3333%; }
.ld-mermaid.ld-code-width-quarter { width: 25%; }
.ld-mermaid.ld-code-align-left { margin-left: 0; margin-right: auto; }
.ld-mermaid.ld-code-align-center { margin-left: auto; margin-right: auto; }
.ld-mermaid.ld-code-align-right { margin-left: auto; margin-right: 0; }
.ld-mermaid-error {
  text-align: left;
  border: 1px solid #ef4444;
  border-left-width: 4px;
  background: #fef2f2;
  color: #7f1d1d;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  white-space: pre-wrap;
}
.ld-mermaid-error + pre { text-align: left; }
.ld-kanban {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(10rem, 1fr);
  gap: 0.75rem;
  overflow-x: auto;
  margin: 1em 0;
}
.ld-kanban-column {
  --kanban-bg: #f8fafc;
  --kanban-border: #cbd5e1;
  --kanban-title: #334155;
  min-height: 120px;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--kanban-border);
  border-radius: 10px;
  background: var(--kanban-bg);
}
.ld-kanban-column-title { font-weight: 600; font-size: 0.9em; color: var(--kanban-title); }
.ld-kanban-sky { --kanban-bg: #f0f9ff; --kanban-border: #bae6fd; --kanban-title: #075985; }
.ld-kanban-amber { --kanban-bg: #fffbeb; --kanban-border: #fde68a; --kanban-title: #92400e; }
.ld-kanban-emerald { --kanban-bg: #ecfdf5; --kanban-border: #a7f3d0; --kanban-title: #065f46; }
.ld-kanban-rose { --kanban-bg: #fff1f2; --kanban-border: #fecdd3; --kanban-title: #9f1239; }
.ld-kanban-violet { --kanban-bg: #f5f3ff; --kanban-border: #ddd6fe; --kanban-title: #5b21b6; }
.ld-kanban-slate { --kanban-bg: #f8fafc; --kanban-border: #cbd5e1; --kanban-title: #334155; }`;
