// Editing in the HTML page (spec html-generation rules 8-9), the DOM part: which block of the page is under the
// pointer, the in-place edit of a paragraph or heading, the Markdown field for the other blocks. The page lives in a
// shadow root: the selection comes from it. What is written, and where, is decided by the caller (`htmlEdits.ts`).

import type { TextRange } from "../lib/edits.ts";

const ELEMENT_NODE = 1;
const INLINE_BLOCKS = new Set(["p", "h2", "h3", "h4"]);
const SOURCE_BLOCKS = new Set(["pre", "ul", "ol", "blockquote", "table"]);
// Their lines mean something only as written: wrapping would hide their shape.
const UNWRAPPED_SOURCE_BLOCKS = new Set(["pre", "table"]);
// One Markdown element each: their content is not text to type into.
const ATOMIC_ELEMENTS = "img, mark, sup";
const HEADING_MARKER = /^#+ *$/;
const NO_BREAK_SPACE = " ";
const SOURCE_INDENT = "  ";
// Fixed colours: the field sits in the template's page (a shadow root with its own light colours), not under the View's theme variables.
const SOURCE_FIELD_STYLE = [
  "display: block", "box-sizing: border-box", "width: 100%", "margin: 1rem 0", "padding: .75rem",
  "border: 2px solid #2563eb", "border-radius: 6px", "outline: none", "resize: none", "overflow-y: hidden",
  "background: #fff", "color: #111827", "font: .9rem/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
].join("; ");

export interface EditableBlock {
  block: HTMLElement;
  /** The block's `data-src` range in the Document's text. */
  range: TextRange;
  /** In the page for a paragraph or heading, as Markdown in a field for what has no plain text form. */
  mode: "inline" | "source";
}

/** What `commit` answers: "saved" closes the edit (the page is drawn again), "unchanged" restores the block, the others leave the edit open. */
export type CommitResult = "saved" | "unchanged" | "stay";

export interface EditHandlers {
  /** An empty text removes the block. */
  onCommit: (markdown: string) => Promise<CommitResult>;
  /** The edit ended: restored, or saved. */
  onClose: () => void;
}

export interface InlineHandlers extends EditHandlers {
  /** The block's current Markdown, null when it no longer converts. */
  read: () => string | null;
  /** The edit stays open: what was typed is not lost. */
  onUnconvertible: () => void;
  /** The Project's setting: with it, a line ending alone is a line break, without it the break needs two spaces. */
  softBreaks: boolean;
}

/** The range of a `data-src="from-to"` attribute. */
export function rangeOf(element: Element | null): TextRange | null {
  const match = /^(\d+)-(\d+)$/.exec(element?.getAttribute("data-src") ?? "");
  return match ? { from: Number(match[1]), to: Number(match[2]) } : null;
}

/** The top-level block of the page (a child of the lead or of a section) holding `target`; a table's wrapper stands for the table. */
export function topLevelBlock(target: EventTarget | null): HTMLElement | null {
  let node = target as Element | null;
  if (node?.nodeType !== ELEMENT_NODE) return null;
  while (node && !(node.parentElement?.matches(".ld-lead, section.ld-section") ?? false)) node = node.parentElement;
  if (!node) return null;
  if (node.matches("div.overflow-x-auto")) return node.querySelector<HTMLElement>(":scope > table");
  return node as HTMLElement;
}

export function editableBlockAt(target: EventTarget | null): EditableBlock | null {
  const block = topLevelBlock(target);
  if (!block) return null;
  const mode = INLINE_BLOCKS.has(block.localName) ? "inline" : SOURCE_BLOCKS.has(block.localName) ? "source" : null;
  const range = rangeOf(block);
  return mode && range ? { block, range, mode } : null;
}

/** The selection of the page: a shadow root has its own in Chromium. */
export function selectionOf(root: Node): Selection | null {
  return (root as unknown as { getSelection?: () => Selection | null }).getSelection?.() ?? document.getSelection();
}

export function hasSelectedText(root: Node): boolean {
  const selection = selectionOf(root);
  return !!selection && !selection.isCollapsed && selection.toString().trim() !== "";
}

interface Session {
  /** Null when the edit cannot be read as Markdown. */
  read: () => string | null;
  unchanged: (edited: string) => boolean;
  restore: () => void;
  onShiftEnter: (event: KeyboardEvent) => void;
  onUnconvertible?: () => void;
}

/** Same keys and same saving for both modes: Enter or leaving saves, Shift+Enter is a line, Escape cancels. */
function wire(field: HTMLElement, session: Session, handlers: EditHandlers): AbortSignal {
  const controller = new AbortController();
  const { signal } = controller;
  let committing = false;

  function finish() {
    controller.abort();
    session.restore();
    handlers.onClose();
  }

  async function commit() {
    if (committing) return;
    const edited = session.read();
    if (edited === null) {
      session.onUnconvertible?.();
      return;
    }
    if (session.unchanged(edited)) {
      finish();
      return;
    }
    committing = true;
    const result = await handlers.onCommit(edited);
    committing = false;
    if (result === "unchanged") finish();
    else if (result === "saved") {
      // The page is drawn again: it takes this edit with it.
      controller.abort();
      handlers.onClose();
    }
  }

  field.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!committing) finish();
    } else if (event.key === "Enter" && event.shiftKey && !event.metaKey && !event.ctrlKey) {
      session.onShiftEnter(event);
    } else if (event.key === "Enter") {
      event.preventDefault();
      void commit();
    }
  }, { signal });
  // Focus moving to something inside the block (a link of the text) is not leaving it.
  field.addEventListener("blur", (event) => {
    if (!field.contains(event.relatedTarget as Node | null)) void commit();
  }, { signal });
  return signal;
}

export function startInlineEdit(block: HTMLElement, handlers: InlineHandlers): void {
  const root = block.getRootNode();
  const originalHtml = block.innerHTML;
  const baseline = handlers.read();

  const signal = wire(block, {
    // Browsers type spaces at the end of a text as no-break spaces: only those of the source are kept.
    read: () => {
      const markdown = handlers.read();
      if (markdown === null) return null;
      const text = (baseline?.includes(NO_BREAK_SPACE) ? markdown : markdown.replaceAll(NO_BREAK_SPACE, " ")).trim();
      return HEADING_MARKER.test(text) ? "" : text;
    },
    unchanged: (edited) => edited === baseline?.trim(),
    restore: () => {
      block.innerHTML = originalHtml;
      block.removeAttribute("contenteditable");
      block.style.removeProperty("white-space");
    },
    onShiftEnter: (event) => {
      event.preventDefault();
      // A Markdown heading holds one line; without soft breaks, a hard break needs its two spaces to show.
      if (block.localName === "p") {
        if (!handlers.softBreaks) document.execCommand("insertText", false, "  ");
        document.execCommand("insertLineBreak");
      }
    },
    onUnconvertible: handlers.onUnconvertible,
  }, handlers);

  // A block stays one Markdown block: no blank line and no formatting from outside.
  block.addEventListener("paste", (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain").replace(/\s*[\r\n]+\s*/g, " ") ?? "";
    document.execCommand("insertText", false, text);
  }, { signal });
  block.addEventListener("drop", (event) => event.preventDefault(), { signal });

  // The double click selected the word under the pointer: focusing must not lose it.
  const selection = selectionOf(root);
  const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  block.querySelectorAll(ATOMIC_ELEMENTS).forEach((element) => element.setAttribute("contenteditable", "false"));
  block.style.setProperty("white-space", "pre-wrap");
  block.setAttribute("contenteditable", "plaintext-only");
  block.focus({ preventScroll: true });
  if (range) {
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
}

/** Shows the block's own lines in a field in its place: nothing is converted, so nothing can differ. */
export function startSourceEdit(block: HTMLElement, source: string, label: string, handlers: EditHandlers): void {
  const field = document.createElement("textarea");
  // A field reads its line endings as \n whatever the file uses.
  const baseline = source.replace(/\r\n/g, "\n").trimEnd();
  field.value = source;
  field.spellcheck = false;
  field.setAttribute("aria-label", label);
  field.style.cssText = SOURCE_FIELD_STYLE;
  if (UNWRAPPED_SOURCE_BLOCKS.has(block.localName)) field.wrap = "off";

  function fit() {
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`;
  }

  const signal = wire(field, {
    read: () => (field.value.trim() ? field.value.trimEnd() : ""),
    unchanged: (edited) => edited === baseline,
    restore: () => {
      field.remove();
      block.style.removeProperty("display");
    },
    onShiftEnter: () => {},
  }, handlers);

  field.addEventListener("input", fit, { signal });
  // Leaving the field saves: Tab stays in it, to indent a list or some code.
  field.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    if (!event.shiftKey) document.execCommand("insertText", false, SOURCE_INDENT);
  }, { signal });

  block.style.setProperty("display", "none");
  block.after(field);
  fit();
  field.focus({ preventScroll: true });
  field.setSelectionRange(0, 0);
}
