// The DOM side of annotations: the text of the reading view as the placement sees it, a selection turned into the
// passage and its surrounding text, and the highlights drawn over the placed passages. All offsets are into the text
// of `textNodes(root)`, so the placement, the selection and the marks always agree.

import { normalizeSpaces, type AnnotationDraft, type Placement } from "../lib/annotations.ts";

/** Characters kept before and after a passage to find it again. */
export const CONTEXT_LENGTH = 30;

/** What is not Document text: drawn diagrams (and their source or error), scripts, styles and the View's own buttons. */
const SKIPPED = "svg, script, style, button, [data-mermaid]";

/** The text nodes of `root` in Document order, without the skipped parts. */
export function textNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest(SKIPPED) && root.contains(node.parentElement.closest(SKIPPED)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  return nodes;
}

/** The text the placement works on. */
export const articleText = (root: HTMLElement): string => textNodes(root).map((node) => node.data).join("");

/** The offset into the article's text of a point of the DOM. */
function offsetOf(nodes: Text[], container: Node, offset: number): number {
  const before = document.createRange();
  before.setStart(container, offset);
  before.collapse(true);
  let position = 0;
  for (const node of nodes) {
    if (node === container) return position + offset;
    // The node ends before the point: it is all before it.
    const end = document.createRange();
    end.setStart(node, node.length);
    end.collapse(true);
    if (before.compareBoundaryPoints(Range.START_TO_START, end) >= 0) position += node.length;
    else break;
  }
  return position;
}

/** The passage a range selects and its surrounding text, taken from the article's text; null when the passage is blank. */
export function draftOfRange(root: HTMLElement, range: Range): Omit<AnnotationDraft, "note"> | null {
  const nodes = textNodes(root);
  const text = nodes.map((node) => node.data).join("");
  const start = offsetOf(nodes, range.startContainer, range.startOffset);
  const end = offsetOf(nodes, range.endContainer, range.endOffset);
  const selectedText = normalizeSpaces(text.slice(start, end));
  if (!selectedText) return null;
  return {
    selectedText,
    contextBefore: text.slice(Math.max(0, start - CONTEXT_LENGTH), start),
    contextAfter: text.slice(end, end + CONTEXT_LENGTH),
  };
}

/** Takes the highlights off: each mark gives its text back to its parent. */
export function clearHighlights(root: HTMLElement): void {
  for (const mark of root.querySelectorAll("mark.ld-annotation")) {
    const parent = mark.parentNode;
    if (!parent) continue;
    mark.replaceWith(...mark.childNodes);
    parent.normalize();
  }
}

/** Marks each placed passage, splitting across formatted parts; the previous marks go first. */
export function applyHighlights(root: HTMLElement, placements: Placement[]): void {
  clearHighlights(root);
  for (const placement of placements) {
    if (placement.state === "orphan") continue;
    let position = 0;
    const slices: { node: Text; from: number; to: number }[] = [];
    for (const node of textNodes(root)) {
      const nodeStart = position;
      position += node.length;
      if (position <= placement.start) continue;
      if (nodeStart >= placement.end) break;
      slices.push({ node, from: Math.max(0, placement.start - nodeStart), to: Math.min(node.length, placement.end - nodeStart) });
    }
    for (const { node, from, to } of slices) {
      if (!node.data.slice(from, to).trim()) continue;
      const target = from > 0 ? node.splitText(from) : node;
      if (to - from < target.length) target.splitText(to - from);
      const mark = document.createElement("mark");
      mark.className = "ld-annotation";
      mark.dataset.annotationId = placement.annotation.id;
      target.replaceWith(mark);
      mark.append(target);
    }
  }
}
