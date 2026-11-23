<script lang="ts">
  // What the User does with the pictures and tables of the article: Shift or Cmd + click enlarges an image in a modal
  // dialog; a right-click on an image or a table opens a small menu to copy it. Elsewhere the browser's own menu stays.
  import type { TextRange } from "../lib/edits.ts";
  import { t } from "../lib/i18n.ts";
  import { copyImage, copyTable } from "./copy.ts";

  let {
    article,
    notify,
    fail,
    sectionAt,
    onsection,
  }: {
    article: HTMLElement | undefined;
    notify: (message: string) => void;
    fail: (message: string, reason?: unknown) => void;
    /** The section holding an offset of the Document; null: none, or the Document cannot be edited. */
    sectionAt: (offset: number) => TextRange | null;
    onsection: (range: TextRange) => void;
  } = $props();

  let menu = $state<{ x: number; y: number; target: HTMLImageElement | HTMLTableElement | null; section: TextRange | null } | null>(null);
  let enlarged = $state<{ src: string; alt: string } | null>(null);
  let dialog = $state<HTMLDialogElement>();
  let menuElement = $state<HTMLElement>();

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
      const target = (event.target as Element).closest<HTMLImageElement | HTMLTableElement>("img, table");
      // Shift keeps the browser's own menu for the sections; the copy items stay.
      const source = event.shiftKey ? null : /^(\d+)-\d+$/.exec((event.target as Element).closest("[data-src]")?.getAttribute("data-src") ?? "");
      const section = source ? sectionAt(Number(source[1])) : null;
      if (!target && !section) return;
      event.preventDefault();
      menu = { x: event.clientX, y: event.clientY, target, section };
    };
    root.addEventListener("click", click, true);
    root.addEventListener("contextmenu", contextmenu);
    return () => {
      root.removeEventListener("click", click, true);
      root.removeEventListener("contextmenu", contextmenu);
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
    {#if menu.target}
      <button role="menuitem" onclick={copy}>{menu.target instanceof HTMLImageElement ? t("copyImage") : t("copyTable")}</button>
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
