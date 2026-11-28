// Long code blocks of a rendered Document fold to a fixed height, with a button to unfold them (as in the original).

const MAX_HEIGHT = 400;
const SLACK = 8;

/**
 * Folds every `pre` of `root` taller than the limit and gives it a toggle button; the returned function undoes it.
 * `unfolded` holds the code blocks the User unfolded, by their place among the Document's code blocks: kept up to date
 * here, so that a new render of the same Document (after a write) leaves them unfolded and the page does not jump.
 */
export function decorateCollapsible(root: HTMLElement, labels: { more: string; less: string }, unfolded: Set<number> = new Set()): () => void {
  const undo: (() => void)[] = [];
  const blocks = [...root.querySelectorAll<HTMLElement>("pre")].filter((pre) => pre.querySelector("code"));
  for (const [index, pre] of blocks.entries()) {
    if (pre.scrollHeight <= MAX_HEIGHT + SLACK) continue;
    pre.classList.add("ld-collapsible");
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "ld-code-toggle";
    const show = (open: boolean) => {
      pre.classList.toggle("ld-expanded", open);
      toggle.textContent = open ? labels.less : labels.more;
      if (open) unfolded.add(index);
      else unfolded.delete(index);
    };
    show(unfolded.has(index));
    toggle.addEventListener("click", () => show(!pre.classList.contains("ld-expanded")));
    pre.append(toggle);
    undo.push(() => {
      toggle.remove();
      pre.classList.remove("ld-collapsible", "ld-expanded");
    });
  }
  return () => undo.forEach((fn) => fn());
}
