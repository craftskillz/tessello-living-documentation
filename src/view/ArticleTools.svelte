<script lang="ts">
  // What the User does with the article: Shift or Cmd + click enlarges an image in a modal dialog; a right-click opens a
  // small menu: edit, delete or insert a snippet, copy an image or a table, edit the section. A double-click on a table cell
  // edits the table with that cell focused. Shift + right-click on text belongs to the Tag markers; elsewhere the browser's own menu stays.
  import type { TextRange } from "../lib/edits.ts";
  import { t, type MessageKey } from "../lib/i18n.ts";
  import type { DocumentText } from "../lib/project.ts";
  import { snippetAt, type SnippetBlock } from "../lib/snippetBlocks.ts";
  import { copyImage, copyTable } from "./copy.ts";

  let {
    article,
    notify,
    fail,
    sectionAt,
    onsection,
    base,
    onedit,
    oninsert,
    ondelete,
  }: {
    article: HTMLElement | undefined;
    notify: (message: string) => void;
    fail: (message: string, reason?: unknown) => void;
    /** The section holding an offset of the Document; null: none, or the Document cannot be edited. */
    sectionAt: (offset: number) => TextRange | null;
    onsection: (range: TextRange) => void;
    /** The text the article shows; null: the snippets cannot be edited here (a Folder manifest, a Kanban board, an editing session). */
    base: () => DocumentText | null;
    onedit: (base: DocumentText, block: SnippetBlock, cell?: { row: number; column: number }) => void;
    /** Insert after the block at `after`; null: at the end of the Document. */
    oninsert: (base: DocumentText, after: TextRange | null) => void;
    ondelete: (base: DocumentText, block: SnippetBlock) => void;
  } = $props();

  type Menu = {
    x: number;
    y: number;
    target: HTMLImageElement | HTMLTableElement | null;
    section: TextRange | null;
    base: DocumentText | null;
    block: SnippetBlock | null;
    /** Where Insert goes: null with `insert` is the end of the Document. */
    insert: { after: TextRange | null } | null;
  };

  let menu = $state<Menu | null>(null);
  let enlarged = $state<{ src: string; alt: string } | null>(null);
  let dialog = $state<HTMLDialogElement>();
  let menuElement = $state<HTMLElement>();

  const rangeOf = (element: Element): TextRange | null => {
    const source = /^(\d+)-(\d+)$/.exec(element.getAttribute("data-src") ?? "");
    return source ? { from: Number(source[1]), to: Number(source[2]) } : null;
  };

  /** The data-src ranges of `element` and its ancestors inside the article, innermost first. */
  function rangesFrom(root: HTMLElement, element: Element): TextRange[] {
    const ranges: TextRange[] = [];
    for (let each: Element | null = element; each && each !== root; each = each.parentElement) {
      const range = rangeOf(each);
      if (range) ranges.push(range);
    }
    return ranges;
  }

  $effect(() => {
    if (!article) return;
    const root = article;
    const click = (event: MouseEvent) => {
      const image = (event.target as Element).closest("img");
      if (!image || !(event.shiftKey || event.metaKey) || !image.src) return;
      event.preventDefault();
      event.stopPropagation();
      enlarged = { src: image.src, alt: image.alt };
    };
    const contextmenu = (event: MouseEvent) => {
      const element = event.target as Element;
      // Shift + right-click on text is the Tag markers' (TagMarkers.svelte); an image keeps its copy menu.
      if (event.shiftKey && !element.closest("img")) return;
      const target = element.closest<HTMLImageElement | HTMLTableElement>("img, table");
      const ranges = rangesFrom(root, element);
      // Shift keeps the browser's own menu for the sections and the snippets; the copy items stay.
      const section = !event.shiftKey && ranges.length > 0 ? sectionAt(ranges[0]!.from) : null;
      const text = event.shiftKey ? null : base();
      const block = text ? snippetAt(text.text, ranges) : null;
      // The clicked top-level block: the outermost range, when the block has one.
      const outer = ranges.at(-1);
      const insert = text && !block && outer ? { after: outer } : null;
      if (!target && !section && !block && !insert) return;
      event.preventDefault();
      menu = { x: event.clientX, y: event.clientY, target, section, base: text, block, insert };
    };
    const doubleClick = (event: MouseEvent) => {
      const cell = (event.target as Element).closest("td, th");
      const table = cell?.closest("table");
      const text = base();
      if (!cell || !table || !text || event.shiftKey) return;
      const block = snippetAt(text.text, rangesFrom(root, table));
      if (block?.kind !== "table") return;
      event.preventDefault();
      menu = null;
      onedit(text, block, { row: (cell.parentElement as HTMLTableRowElement).rowIndex, column: (cell as HTMLTableCellElement).cellIndex });
    };
    // The empty space under the last block: the page around the article, below its end.
    const space = root.closest("main");
    const below = (event: MouseEvent) => {
      const element = event.target as Element;
      const blank = element === space || element === root || element === root.parentElement || element === root.parentElement?.parentElement;
      if (event.defaultPrevented || event.shiftKey || !blank) return;
      const last = root.lastElementChild;
      if (last && event.clientY <= last.getBoundingClientRect().bottom) return;
      const text = base();
      if (!text) return;
      event.preventDefault();
      menu = { x: event.clientX, y: event.clientY, target: null, section: null, base: text, block: null, insert: { after: null } };
    };
    root.addEventListener("click", click, true);
    root.addEventListener("contextmenu", contextmenu);
    root.addEventListener("dblclick", doubleClick);
    space?.addEventListener("contextmenu", below);
    return () => {
      root.removeEventListener("click", click, true);
      root.removeEventListener("contextmenu", contextmenu);
      root.removeEventListener("dblclick", doubleClick);
      space?.removeEventListener("contextmenu", below);
      menu = null;
    };
  });

  $effect(() => {
    if (enlarged && dialog && !dialog.open) dialog.showModal();
  });

  $effect(() => {
    if (menu) menuElement?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  });

  function copy() {
    const target = menu!.target;
    menu = null;
    if (!target) return;
    if (target instanceof HTMLImageElement) {
      copyImage(target).then(() => notify(t("imageCopied")), (reason) => fail(t("imageCopyFailed"), reason));
    } else {
      copyTable(target).then(() => notify(t("tableCopied")), (reason) => fail(t("tableCopyFailed"), reason));
    }
  }

  function editSection() {
    const range = menu!.section!;
    menu = null;
    onsection(range);
  }

  function editBlock() {
    const { base: text, block } = menu!;
    menu = null;
    onedit(text!, block!);
  }

  function deleteBlock() {
    const { base: text, block } = menu!;
    menu = null;
    ondelete(text!, block!);
  }

  function insert() {
    const { base: text, insert: place } = menu!;
    menu = null;
    oninsert(text!, place!.after);
  }

  function closeMenu(event: Event) {
    if (menu && !(event.target as Element).closest?.("[role=menu]")) menu = null;
  }

  function key(event: KeyboardEvent) {
    if (event.key === "Escape") menu = null;
  }
</script>

<svelte:window onpointerdown={closeMenu} onkeydown={key} />

{#if menu}
  <div class="menu" role="menu" bind:this={menuElement} style:left="{menu.x}px" style:top="{menu.y}px">
    {#if menu.block}
      <button role="menuitem" onclick={editBlock}>{t(`snEdit_${menu.block.kind}` as MessageKey)}</button>
    {:else if menu.insert}
      <button role="menuitem" onclick={insert}>{t("snInsertHere")}</button>
    {/if}
    {#if menu.target}
      <button role="menuitem" onclick={copy}>{menu.target instanceof HTMLImageElement ? t("copyImage") : t("copyTable")}</button>
    {/if}
    {#if menu.block}
      <button role="menuitem" class="danger" onclick={deleteBlock}>{t(`snRemove_${menu.block.kind}` as MessageKey)}</button>
    {/if}
    {#if menu.section}
      <button role="menuitem" onclick={editSection}>{t("editSection")}</button>
    {/if}
  </div>
{/if}

{#if enlarged}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <dialog bind:this={dialog} aria-label={enlarged.alt || undefined} onclose={() => (enlarged = null)} onclick={() => dialog?.close()}>
    <img src={enlarged.src} alt={enlarged.alt} />
  </dialog>
{/if}

<style>
  .menu {
    position: fixed;
    z-index: 20;
    display: flex;
    flex-direction: column;
    min-width: 10rem;
    padding: 0.25rem;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.18);
  }
  .menu button {
    border: none;
    background: none;
    text-align: left;
  }
  .menu button.danger {
    color: light-dark(#c0392b, #f87171);
  }
  .menu button:hover,
  .menu button:focus {
    background: var(--line);
  }
  dialog {
    max-width: 95vw;
    max-height: 95vh;
    padding: 0.5rem;
    border: none;
    border-radius: 8px;
    background: var(--panel);
    cursor: zoom-out;
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.7);
  }
  img {
    display: block;
    max-width: 90vw;
    max-height: 90vh;
  }
</style>
