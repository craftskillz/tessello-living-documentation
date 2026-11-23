// Mermaid diagrams of a rendered Document are drawn into SVG after each render (rendering leaves a placeholder
// `[data-mermaid]` holding the source). A broken diagram shows its error and its source, never a blank.

import mermaid from "mermaid";

export interface DiagramOptions {
  /** The Document is on a dark background. */
  dark: boolean;
  /** The translated error message for mermaid's reason. */
  failed: (reason: string) => string;
}

let counter = 0;
let theme: "dark" | "default" | undefined;

function configure(dark: boolean) {
  const wanted = dark ? "dark" : "default";
  if (theme === wanted) return;
  theme = wanted;
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: wanted });
}

function showError(host: HTMLElement, source: string, message: string) {
  const error = document.createElement("div");
  error.className = "ld-mermaid-error";
  error.setAttribute("role", "alert");
  error.textContent = message;
  // A `pre` without `code`: the code folding leaves it alone.
  const pre = document.createElement("pre");
  pre.textContent = source;
  host.replaceChildren(error, pre);
}

/** Draws every diagram of `root`; the returned function ignores what is still being drawn. */
export function drawDiagrams(root: HTMLElement, options: DiagramOptions): () => void {
  let cancelled = false;
  const hosts = [...root.querySelectorAll<HTMLElement>("[data-mermaid]")];
  if (hosts.length === 0) return () => {};
  configure(options.dark);
  void (async () => {
    for (const host of hosts) {
      // The first draw replaces the source text; a redraw (theme change, same render) reads it back from here.
      const source = (host.dataset.mermaidSource ??= host.textContent ?? "");
      const id = `ld-mermaid-${++counter}`;
      try {
        const { svg } = await mermaid.render(id, source);
        if (cancelled) return;
        host.innerHTML = svg;
      } catch (reason) {
        if (cancelled) return;
        showError(host, source, options.failed(reason instanceof Error ? reason.message : String(reason)));
      } finally {
        // Mermaid can leave its error drawing (`d<id>`) in the page; the diagram itself holds the id.
        document.getElementById(`d${id}`)?.remove();
      }
    }
  })();
  return () => {
    cancelled = true;
  };
}
