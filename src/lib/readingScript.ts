// The reading script of read aloud: the rendered Document (DOM) in, what is spoken and what is highlighted out.
// Pure: it only uses the few DOM members of `ReadingNode`, so it runs on a browser Node and on test doubles alike.

/** The few DOM members the walk uses; a browser Node satisfies it structurally (Element has getAttribute, Text has data). */
export interface ReadingNode {
  nodeType: number; // 1 element, 3 text
  nodeName: string; // upper-case tag for elements, "#text" for text
  childNodes: ArrayLike<ReadingNode>;
  getAttribute?(name: string): string | null;
  data?: string;
}

export type SegmentKind = "heading" | "text" | "code" | "table" | "image" | "diagram";

export interface Sentence {
  /** The whole sentence (highlighted whole). */
  text: string;
  /** Offsets into the segment's text. */
  start: number;
  end: number;
  /** What is spoken, in order: `[text]` unless the sentence is overlong. */
  pieces: string[];
}

export interface Segment {
  kind: SegmentKind;
  /** Highlight target and range root. */
  element: ReadingNode;
  /** Code, table, image or diagram: announced by a label, highlighted as a whole element. */
  announced: boolean;
  text: string;
  sentences: Sentence[];
}

export interface ReadingLabels {
  code: string;
  table: string;
  diagram: string;
  /** "Image: {alt}." */
  image: string;
  /** "Image." */
  imageNoAlt: string;
}

export interface ReadingCharacter {
  node: ReadingNode;
  offset: number;
}

const ELEMENT = 1;
const HEADINGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);
/** Elements that are blocks of their own: the text of a block never includes them. */
const BLOCKS = new Set(["P", "UL", "OL", "LI", "DIV", "SECTION", "ARTICLE", "BLOCKQUOTE", "PRE", "TABLE", "DETAILS", "SUMMARY", "FIGURE", "HR", ...HEADINGS]);
const SKIPPED = new Set(["BUTTON", "SVG", "SCRIPT", "STYLE", "HR"]);

const children = (node: ReadingNode): ReadingNode[] => Array.from(node.childNodes);
const elementsOf = (node: ReadingNode) => children(node).filter((c) => c.nodeType === ELEMENT);
const attr = (node: ReadingNode, name: string) => node.getAttribute?.(name) ?? null;
const hasClass = (node: ReadingNode, name: string) => (attr(node, "class") ?? "").split(/\s+/).includes(name);
const isImage = (node: ReadingNode) => node.nodeName === "IMG" || hasClass(node, "image-missing");
const containsMermaid = (node: ReadingNode): boolean => node.nodeType === ELEMENT && (hasClass(node, "ld-mermaid") || children(node).some(containsMermaid));
const imagesIn = (node: ReadingNode): ReadingNode[] =>
  node.nodeType !== ELEMENT ? [] : isImage(node) ? [node] : children(node).flatMap(imagesIn);

/** A footnote marker or back-link, a button, an svg: never read. */
function isNotRead(node: ReadingNode): boolean {
  return SKIPPED.has(node.nodeName) || attr(node, "data-footnote-ref") !== null || attr(node, "data-footnote-backref") !== null;
}

function isBlock(node: ReadingNode): boolean {
  return BLOCKS.has(node.nodeName) || containsMermaid(node);
}

interface Chunk extends ReadingCharacter {
  char: string;
}

/**
 * The characters of an element's own text, normalised: runs of whitespace are one space, no leading or trailing
 * whitespace, nested blocks and unread elements left out. A `<br>` is a "\n" in the text; having no text node it
 * maps to the character before it, so a Range ending on it ends at that character. A space before a break, and
 * whitespace after it, are dropped.
 */
function chunksOf(element: ReadingNode): Chunk[] {
  const out: Chunk[] = [];
  const visit = (node: ReadingNode) => {
    if (node.nodeType === 3) {
      const data = node.data ?? "";
      for (let offset = 0; offset < data.length; offset++) {
        const space = /\s/.test(data[offset]);
        const last = out[out.length - 1];
        if (space && (!last || last.char === " " || last.char === "\n")) continue;
        out.push({ char: space ? " " : data[offset], node, offset });
      }
      return;
    }
    if (node.nodeType !== ELEMENT || isNotRead(node)) return;
    if (node.nodeName === "BR") {
      while (out.length && out[out.length - 1].char === " ") out.pop();
      const last = out[out.length - 1];
      if (last && last.char !== "\n") out.push({ char: "\n", node: last.node, offset: last.offset });
      return;
    }
    if (isBlock(node) || isImage(node)) return;
    children(node).forEach(visit);
  };
  children(element).forEach(visit);
  while (out.length && (out[out.length - 1].char === " " || out[out.length - 1].char === "\n")) out.pop();
  return out;
}

/** One entry per character of a non-announced segment's text: the text node and offset it comes from. */
export function readingCharacters(element: ReadingNode): ReadingCharacter[] {
  return chunksOf(element).map(({ node, offset }) => ({ node, offset }));
}

/** Sentence boundaries: Intl.Segmenter AND every line break; trimmed, empty ones dropped. "en" when `lang` is invalid. */
export function sentencesOf(text: string, lang: string): { start: number; end: number }[] {
  let segmenter: Intl.Segmenter;
  try {
    segmenter = new Intl.Segmenter(lang, { granularity: "sentence" });
  } catch {
    segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  }
  const out: { start: number; end: number }[] = [];
  let lineStart = 0;
  for (const line of text.split("\n")) {
    for (const { segment, index } of segmenter.segment(line)) {
      const start = lineStart + index + (segment.length - segment.trimStart().length);
      const end = lineStart + index + segment.trimEnd().length;
      if (end > start) out.push({ start, end });
    }
    lineStart += line.length + 1;
  }
  return out;
}

/** An overlong sentence cut in pieces of at most `max`: at the last comma, semicolon or colon, else the last space, else hard. */
export function piecesOf(sentence: string, max = 200): string[] {
  const pieces: string[] = [];
  let rest = sentence.trim();
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = Math.max(window.lastIndexOf(","), window.lastIndexOf(";"), window.lastIndexOf(":")) + 1;
    if (cut <= 0) cut = window.lastIndexOf(" ");
    if (cut <= 0) cut = max;
    const piece = rest.slice(0, cut).trim();
    if (piece) pieces.push(piece);
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces.length ? pieces : [sentence];
}

function textSegment(kind: SegmentKind, element: ReadingNode, lang: string): Segment | null {
  const text = chunksOf(element).map((c) => c.char).join("");
  if (!text) return null;
  const sentences = sentencesOf(text, lang).map(({ start, end }) => {
    const sentence = text.slice(start, end);
    return { text: sentence, start, end, pieces: piecesOf(sentence) };
  });
  return { kind, element, announced: false, text, sentences };
}

function announced(kind: SegmentKind, element: ReadingNode, label: string): Segment {
  return { kind, element, announced: true, text: label, sentences: [{ text: label, start: 0, end: label.length, pieces: [label] }] };
}

function imageSegment(element: ReadingNode, image: ReadingNode, labels: ReadingLabels): Segment {
  const alt = (attr(image, "alt") ?? attr(image, "aria-label") ?? "").trim();
  return announced("image", element, alt ? labels.image.replace("{alt}", alt) : labels.imageNoAlt);
}

/** The Document's reading script: the segments in document order. */
export function readingScript(root: ReadingNode, lang: string, labels: ReadingLabels): Segment[] {
  const out: Segment[] = [];
  const add = (segment: Segment | null) => segment && out.push(segment);

  const walk = (node: ReadingNode) => {
    for (const child of elementsOf(node)) {
      const tag = child.nodeName;
      if (isNotRead(child)) continue;
      if (hasClass(child, "ld-mermaid") || containsMermaid(child)) add(announced("diagram", child, labels.diagram));
      else if (tag === "PRE" || hasClass(child, "ld-compare-source") || (tag === "DIV" && elementsOf(child).some((c) => c.nodeName === "PRE")))
        add(announced("code", child, labels.code));
      else if (tag === "TABLE" || (tag === "DIV" && hasClass(child, "overflow-x-auto") && elementsOf(child).some((c) => c.nodeName === "TABLE")))
        add(announced("table", child, labels.table));
      else if (isImage(child)) add(imageSegment(child, child, labels));
      else if ((tag === "P" || tag === "FIGURE") && imagesIn(child).length === 1 && !chunksOf(child).length)
        add(imageSegment(child, imagesIn(child)[0], labels));
      else if (HEADINGS.has(tag)) add(textSegment("heading", child, lang));
      else if (tag === "P" || tag === "SUMMARY") add(textSegment("text", child, lang));
      else if (tag === "LI" || tag === "BLOCKQUOTE") {
        // Its own text is one segment; nested blocks (a sub-list, a paragraph) are walked, so nothing is read twice.
        add(textSegment("text", child, lang));
        walk(child);
      } else walk(child); // containers: UL, OL, DIV, SECTION, ARTICLE, DETAILS, ld-columns, ld-callout, ...
    }
  };
  walk(root);
  return out;
}

const ALIASES: Record<string, string> = { english: "en", anglais: "en", french: "fr", francais: "fr", "français": "fr" };

/** The Document's language from its frontmatter: `language`, `lang`, `locale`, `langue` (any key case), else null. */
export function readingLanguage(fields: Record<string, unknown>): string | null {
  for (const name of ["language", "lang", "locale", "langue"]) {
    const key = Object.keys(fields).find((k) => k.toLowerCase() === name);
    const value = key === undefined ? undefined : fields[key];
    if (typeof value !== "string" || !value.trim()) continue;
    const trimmed = value.trim();
    return ALIASES[trimmed.toLowerCase()] ?? trimmed;
  }
  return null;
}

const primary = (lang: string) => lang.toLowerCase().split(/[-_]/)[0];

/** The Document's primary subtag if it is `en` or `fr`, else the interface language. */
export function announcementLanguage(documentLang: string, interfaceLang: "en" | "fr"): "en" | "fr" {
  const code = primary(documentLang);
  return code === "en" || code === "fr" ? code : interfaceLang;
}

export interface VoiceInfo {
  name: string;
  lang: string;
  default: boolean;
}

/** The voices for `lang`: same language first, then same primary subtag; the default voice first in each group. */
export function voicesFor(lang: string, voices: VoiceInfo[]): VoiceInfo[] {
  const normal = (value: string) => value.toLowerCase().replace(/_/g, "-");
  const wanted = normal(lang);
  const byDefault = (a: VoiceInfo, b: VoiceInfo) => Number(b.default) - Number(a.default);
  const exact = voices.filter((v) => normal(v.lang) === wanted).sort(byDefault);
  const same = voices.filter((v) => normal(v.lang) !== wanted && primary(v.lang) === primary(lang)).sort(byDefault);
  return [...exact, ...same];
}

/** The distinct primary language codes that have a voice: the interface language first, the rest sorted. */
export function languagesWithVoice(voices: VoiceInfo[], interfaceLang: string): string[] {
  const codes = [...new Set(voices.map((v) => primary(v.lang)).filter(Boolean))].sort();
  const first = primary(interfaceLang);
  return codes.includes(first) ? [first, ...codes.filter((c) => c !== first)] : codes;
}
