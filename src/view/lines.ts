// The Lines display of the article: each top-level block carries the file lines it comes from, shown by CSS only.

import { lineLabel } from "../lib/lines.ts";

/** The `data-src` range of an element, as offsets in the Document's text. */
function rangeOf(element: Element): [number, number] | null {
  const match = /^(\d+)-(\d+)$/.exec(element.getAttribute("data-src") ?? "");
  return match ? [Number(match[1]), Number(match[2])] : null;
}

/** Labels every top-level block of `article` (but footnotes) with its lines in `text`; the returned function removes them. */
export function applyLineLabels(article: HTMLElement, text: string): () => void {
  const labelled: Element[] = [];
  for (const child of article.children) {
    if (child.matches("section[data-footnotes]")) continue;
    const ranges = [child, ...child.querySelectorAll("[data-src]")].map(rangeOf).filter((range) => range !== null);
    const label = lineLabel(text, ranges);
    if (label === null) continue;
    child.setAttribute("data-line-label", label);
    labelled.push(child);
  }
  return () => labelled.forEach((child) => child.removeAttribute("data-line-label"));
}
