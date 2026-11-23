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
