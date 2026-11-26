<script lang="ts">
  // Tag markers in the article: Shift + right-click on a pill asks to remove it; on text it opens the Insert popup at that
  // character (docs/spec/documents-tag-markers.md). It only locates and asks: View writes and reports failures.
  import type { TextRange } from "../lib/edits.ts";
  import { t } from "../lib/i18n.ts";
  import type { DocumentText } from "../lib/project.ts";
  import { parseTagInput } from "../lib/tagMarkers.ts";
  import { textNodes } from "./highlights.ts";

  let {
    article,
    fail,
    base,
    locate,
    names,
    loadUsed,
    oninsert,
    onremove,
  }: {
    article: HTMLElement | undefined;
    fail: (message: string) => void;
    /** The text the article shows; null: markers cannot be edited here (a Folder manifest, a Kanban board, an editing session). */
    base: () => DocumentText | null;
    /** Where a click lands: `block` is the data-src range of the innermost block, `offset` the visible characters before it. */
    locate: (block: TextRange, offset: number) => { at: number } | { refused: true } | null;
    /** The Tag names of the Project settings. */
    names: string[];
    /** The names already used as markers in the Project. */
    loadUsed: () => Promise<string[]>;
    oninsert: (base: DocumentText, at: number, tag: string, block: TextRange) => void;
    onremove: (base: DocumentText, range: TextRange) => void;
  } = $props();

  type Popup =
    | { kind: "insert"; x: number; y: number; base: DocumentText; at: number; block: TextRange }
    | { kind: "remove"; x: number; y: number; base: DocumentText; name: string; range: TextRange };

  let popup = $state.raw<Popup | null>(null);
  let input = $state("");
  let invalid = $state(false);
  let used = $state<string[]>([]);
  let element = $state<HTMLElement>();
  let field = $state<HTMLInputElement>();
  let removeButton = $state<HTMLButtonElement>();

  const suggestions = $derived([...names, ...used.filter((name) => !names.includes(name))]);

  const rangeOf = (source: Element): TextRange | null => {
    const found = /^(\d+)-(\d+)$/.exec(source.getAttribute("data-src") ?? "");
    return found ? { from: Number(found[1]), to: Number(found[2]) } : null;
  };

  /** The text node and offset of the caret nearest to the point. */
  function caretAt(x: number, y: number): { node: Node; offset: number } | null {
    const doc = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const position = doc.caretPositionFromPoint?.(x, y);
    if (position) return { node: position.offsetNode, offset: position.offset };
    const range = doc.caretRangeFromPoint?.(x, y);
    return range ? { node: range.startContainer, offset: range.startOffset } : null;
  }

  /** The character whose box holds the pointer: the caret sits on the nearer edge, so it is the one after it or the one before it. */
  function characterAt(text: Text, caret: number, x: number, y: number): number | null {
    const last = text.data.length - 1;
    if (last < 0) return null;
    const candidates = [caret, caret - 1].filter((each) => each >= 0 && each <= last);
    for (const each of candidates) {
      const range = document.createRange();
      range.setStart(text, each);
      range.setEnd(text, each + 1);
      for (const box of range.getClientRects()) if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return each;
    }
    return candidates[0] ?? null;
  }

  function contextmenu(event: MouseEvent) {
    if (!event.shiftKey || !article) return;
    const target = event.target as Element;
    if (target.closest("img")) return;
    const text = base();
    if (!text) return;
    const pill = target.closest<HTMLElement>("mark.ld-tag-marker");
    const range = pill ? rangeOf(pill) : null;
    if (pill && range) {
      event.preventDefault();
      reset();
      popup = { kind: "remove", x: event.clientX, y: event.clientY, base: text, name: (pill.dataset.tag ?? "").toLowerCase(), range };
      return;
    }
    event.preventDefault();
    const caret = caretAt(event.clientX, event.clientY);
    const node = caret?.node;
    const index = node instanceof Text ? characterAt(node, caret!.offset, event.clientX, event.clientY) : null;
    const block = node?.parentElement?.closest<HTMLElement>("[data-src]:not(.ld-tag-marker)");
    const blockRange = block ? rangeOf(block) : null;
    const nodes = block ? textNodes(block) : [];
    const position = node instanceof Text ? nodes.indexOf(node) : -1;
    if (index === null || !block || !blockRange || position < 0) return refuse(t("tmNotLocated"));
    const offset = nodes.slice(0, position).reduce((sum, each) => sum + each.data.length, 0) + index;
    const found = locate(blockRange, offset);
    if (!found) return refuse(t("tmNotLocated"));
    if ("refused" in found) return refuse(t("tmRefused"));
    reset();
    popup = { kind: "insert", x: event.clientX, y: event.clientY, base: text, at: found.at, block: blockRange };
    used = [];
    const open = popup;
    loadUsed().then(
      (list) => {
        if (popup === open) used = list;
      },
      () => {},
    );
  }
  const refuse = (message: string) => {
    popup = null;
    fail(message);
  };

  $effect(() => {
    if (!article) return;
    const root = article;
    root.addEventListener("contextmenu", contextmenu);
    return () => {
      root.removeEventListener("contextmenu", contextmenu);
      popup = null;
    };
  });

  $effect(() => {
    if (!popup) return;
    if (popup.kind === "insert") field?.focus();
    else removeButton?.focus();
  });

  function reset() {
    input = "";
    invalid = false;
  }

  function submit(event: Event) {
    event.preventDefault();
    if (popup?.kind !== "insert") return;
    const parsed = parseTagInput(input);
    if (!parsed) {
      invalid = true;
      return;
    }
    const { base: text, at, block } = popup;
    popup = null;
    oninsert(text, at, parsed.tag, block);
  }

  function remove() {
    if (popup?.kind !== "remove") return;
    const { base: text, range } = popup;
    popup = null;
    onremove(text, range);
  }

  function outside(event: Event) {
    if (popup && !element?.contains(event.target as Node)) popup = null;
  }

  function key(event: KeyboardEvent) {
    if (popup && event.key === "Escape") popup = null;
  }

  /** Keeps the popup inside the View. */
  const left = (x: number) => Math.max(8, Math.min(x, window.innerWidth - 340));
  const top = (y: number) => Math.max(8, Math.min(y, window.innerHeight - 200));
</script>

<svelte:window onpointerdown={outside} onkeydown={key} />

{#if popup}
  {#if popup.kind === "insert"}
    <div class="ld-form popup" role="dialog" aria-label={t("tmInsertTitle")} bind:this={element} style:left="{left(popup.x)}px" style:top="{top(popup.y)}px">
      <form onsubmit={submit}>
        <fieldset>
          <legend>{t("tmInsertTitle")}</legend>
          <label class="field">
            <span class="visually-hidden">{t("tmName")}</span>
            <input
              type="text"
              class="mono"
              bind:this={field}
              bind:value={input}
              placeholder={t("tmPlaceholder")}
              list="tag-name-suggestions"
              spellcheck="false"
              autocomplete="off"
              oninput={() => (invalid = false)}
            />
          </label>
          <datalist id="tag-name-suggestions">
            {#each suggestions as name (name)}<option value={name}></option>{/each}
          </datalist>
          {#if invalid}<p class="invalid" role="alert">{t("tmInvalid")}</p>{/if}
        </fieldset>
        <div class="actions"><button type="submit">{t("tmInsert")}</button></div>
      </form>
    </div>
  {:else}
    <div class="ld-form popup" role="dialog" aria-label={t("tmRemoveTitle", { name: popup.name })} bind:this={element} style:left="{left(popup.x)}px" style:top="{top(popup.y)}px">
      <p class="question">{t("tmRemoveTitle", { name: popup.name })}</p>
      <div class="actions">
        <button type="button" bind:this={removeButton} onclick={remove}>{t("remove")}</button>
        <button type="button" onclick={() => (popup = null)}>{t("cancel")}</button>
      </div>
    </div>
  {/if}
{/if}

<style>
  /* The form look comes from .ld-form (base.css, docs/ui.md); only the popup's own layout is here. */
  .popup {
    position: fixed;
    z-index: 30;
    width: 20rem;
    max-width: calc(100vw - 1rem);
    padding: 0.75rem 0.9rem;
    color: var(--ink);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.18);
  }
  .question {
    margin: 0 0 0.6rem;
    overflow-wrap: anywhere;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.4rem;
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
</style>
