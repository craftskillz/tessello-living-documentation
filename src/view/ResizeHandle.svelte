<script lang="ts">
  // A handle on the edge of a resizable area (the sidebar, the table of contents): dragging it or pressing the arrow keys
  // on it changes the width, kept within its bounds and whole. The width shows live while dragged and is kept on release.
  import { clampWidth } from "../lib/projects.ts";

  /** The width a key press adds or takes away. */
  const STEP = 16;

  let {
    label,
    width,
    bounds,
    widens,
    left,
    onmove,
    onkept,
  }: {
    label: string;
    width: number;
    bounds: { min: number; max: number };
    /** The way the pointer (or arrow key) goes to widen the area: right for a handle on its right edge. */
    widens: "left" | "right";
    /** Where the handle sits, as a CSS `left`. */
    left: string;
    /** The width while dragged, at each move. */
    onmove: (width: number) => void;
    /** The width to keep: on release after a drag, or at each arrow key. */
    onkept: (width: number) => void;
  } = $props();

  const sign = $derived(widens === "right" ? 1 : -1);
  const clamp = (value: number) => clampWidth(value, bounds);

  /** Dragging follows the pointer over the whole window, so it holds wherever the pointer goes. */
  function down(event: PointerEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    let moved: number | null = null;
    const move = (each: PointerEvent) => {
      moved = clamp(startWidth + sign * (each.clientX - startX));
      onmove(moved);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (moved !== null) onkept(moved);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  function key(event: KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    onkept(clamp(width + sign * (event.key === "ArrowRight" ? STEP : -STEP)));
  }
</script>

<!-- A focusable separator is a widget in ARIA (it has a value the keys change); Svelte counts every separator as static. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
<div
  class="handle"
  role="separator"
  tabindex="0"
  aria-orientation="vertical"
  aria-label={label}
  aria-valuenow={width}
  aria-valuemin={bounds.min}
  aria-valuemax={bounds.max}
  style:left
  onpointerdown={down}
  onkeydown={key}
></div>

<style>
  /* No background transition: one delayed a storage write enough for an immediate reload to lose it (ticket 29). */
  .handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 6px;
    z-index: 6;
    cursor: col-resize;
    touch-action: none;
  }
  .handle:hover {
    background: var(--line);
  }
  .handle:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
</style>
