// Tag markers (docs/spec/documents-tag-markers.md): a lone opening tag written in a Document, such as `<add-footnote>`,
// is an instruction left for an LLM. Pure: this module says what a marker is and how its pill reads; render.ts finds
// them in the Document.

/** A lone tag as the original wrote it: a name, then free text after spaces or tabs without `<`, `>`, `=` or a line break. */
export const TAG_SOURCE = "<([A-Za-z][A-Za-z0-9-]*)(?:[ \\t]+([^<>=\\n]*?))?[ \\t]*>";

const HTML_ELEMENTS = new Set(
  (
    "a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col colgroup " +
    "data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 " +
    "head header hgroup hr html i iframe img input ins kbd label legend li link main map mark menu meta meter nav noscript " +
    "object ol optgroup option output p param picture pre progress q rp rt ruby s samp script search section select slot " +
    "small source span strong style sub summary sup table tbody td template textarea tfoot th thead time title tr track u " +
    "ul var video wbr " +
    "acronym applet basefont big blink center dir font frame frameset marquee nobr noembed noframes plaintext strike tt xmp " +
    "svg math"
  ).split(" "),
);

/** Whether the tag `name` is a marker: not a standard HTML element, and not closed anywhere in the Document text. */
export function isMarkerName(name: string, documentText: string): boolean {
  if (HTML_ELEMENTS.has(name.toLowerCase())) return false;
  return !new RegExp(`</${name}\\s*>`, "i").test(documentText);
}

const PILL_LENGTH = 20;

/** The name as written, cut to 20 characters (19 and an ellipsis when longer). */
export const pillLabel = (name: string): string => (name.length > PILL_LENGTH ? `${name.slice(0, PILL_LENGTH - 1)}…` : name);

const NAME = /^[A-Za-z][A-Za-z0-9-]*$/;

/** What the User typed in the Insert popup as the tag to write, or null when it is not a valid marker. */
export function parseTagInput(input: string): { tag: string; name: string } | null {
  let text = input.trim();
  if (text.startsWith("<") && text.endsWith(">")) text = text.slice(1, -1).trim();
  const match = /^([^ \t\n\r]+)(?:[ \t]+([\s\S]*))?$/.exec(text);
  if (!match || !NAME.test(match[1]!)) return null;
  const name = match[1]!.toLowerCase();
  if (HTML_ELEMENTS.has(name)) return null;
  const free = (match[2] ?? "").replace(/[ \t]+/g, " ").trim();
  if (/[<>=\r\n]/.test(free)) return null;
  const tag = free === "" ? `<${name}>` : `<${name} ${free}>`;
  return new RegExp(`^${TAG_SOURCE}$`).test(tag) ? { tag, name } : null;
}

/** The Project's tag names, as typed: brackets off, lower case, duplicates out (first kept); `invalid` as typed. */
export function normalizeTagNames(list: string[]): { names: string[]; invalid: string[] } {
  const names: string[] = [];
  const invalid: string[] = [];
  for (const item of list) {
    const typed = item.trim();
    const bare = typed.replace(/^<|>$/g, "").trim();
    if (bare === "") continue;
    const name = bare.toLowerCase();
    if (!NAME.test(name) || HTML_ELEMENTS.has(name)) invalid.push(typed);
    else if (!names.includes(name)) names.push(name);
  }
  return { names, invalid };
}

/** The items of the settings field: separated by commas, spaces or line breaks. */
export const splitTagNames = (text: string): string[] => text.split(/[,\s]+/).filter((item) => item !== "");
