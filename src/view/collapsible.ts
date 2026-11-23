// Long code blocks of a rendered Document fold to a fixed height, with a button to unfold them (as in the original).

const MAX_HEIGHT = 400;
const SLACK = 8;

/** Folds every `pre` of `root` taller than the limit and gives it a toggle button; the returned function undoes it. */
export function decorateCollapsible(root: HTMLElement, labels: { more: string; less: string }): () => void {
  const undo: (() => void)[] = [];
  for (const pre of root.querySelectorAll<HTMLElement>("pre")) {
    if (!pre.querySelector("code") || pre.scrollHeight <= MAX_HEIGHT + SLACK) continue;
    pre.classList.add("ld-collapsible");
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "ld-code-toggle";
    toggle.textContent = labels.more;
    toggle.addEventListener("click", () => {
      toggle.textContent = pre.classList.toggle("ld-expanded") ? labels.less : labels.more;
    });
    pre.append(toggle);
    undo.push(() => {
      toggle.remove();
      pre.classList.remove("ld-collapsible", "ld-expanded");
    });
  }
  return () => undo.forEach((fn) => fn());
}
