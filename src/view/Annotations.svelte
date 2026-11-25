<script lang="ts">
  // Annotations of the open Document (docs/spec/annotations.md): the passages highlighted in the article, the column of
  // buttons at the window's right edge, the reading popup, and (Marker Active) the creation popup. Nothing here opens
  // a Folder manifest, the editor, the section preview or the HTML view: the View mounts it for an ordinary Document's
  // reading only.
  import { untrack } from "svelte";
  import { type Annotation, type AnnotationDraft, type MarkerState, excerpt, normalizeSpaces, type Placement, placeAnnotations } from "../lib/annotations.ts";
  import { currentLocale, type MessageKey, t } from "../lib/i18n.ts";
  import { Conflict, Refused } from "../lib/project.ts";
  import { applyHighlights, articleText, clearHighlights, draftOfRange } from "./highlights.ts";

  let {
    article,
    html,
    path,
    marker,
    headerHeight,
    changeCount,
    read,
    add,
    edit,
    remove,
    fail,
  }: {
    article: HTMLElement | undefined;
    /** The rendered Document: the highlights are drawn again after each render. */
    html: string;
    path: string;
    marker: MarkerState;
    /** The sticky header's height: the column sits below it. */
    headerHeight: number;
    /** Changes when the Document or the annotations file changed on disk: the list is read again. */
    changeCount: number;
    read: () => Promise<Annotation[]>;
    add: (draft: AnnotationDraft) => Promise<Annotation>;
    edit: (id: string, note: string) => Promise<Annotation>;
    remove: (id: string) => Promise<void>;
    fail: (message: string, reason?: unknown) => void;
  } = $props();

  const POPUP_WIDTH = 320;
  const CLOSE_DELAY = 1500;

  /** The Document's annotations in the file's order, with the Document they belong to. */
  let list = $state.raw<{ path: string; items: Annotation[] }>({ path: "", items: [] });
  let placements = $state.raw<Placement[]>([]);

  async function reload() {
    const asked = path;
    try {
      const items = await read();
      if (asked === path) list = { path: asked, items };
    } catch (reason) {
      if (asked !== path) return;
      list = { path: asked, items: [] };
      fail(t("annotationsLoadFailed"), reason);
    }
  }

  // Annotations are read when a Document opens and when it or the file changed on disk.
  $effect(() => {
    path;
    changeCount;
    untrack(() => void reload());
  });

  // The highlights follow each render, each change of the list and of the Marker.
  $effect(() => {
    html;
    const items = list.path === path && marker !== "hidden" ? list.items : [];
    if (!article) return;
    const root = article;
    const placed = items.length > 0 ? placeAnnotations(articleText(root), items) : [];
    applyHighlights(root, placed);
    placements = placed;
    return () => clearHighlights(root);
  });

  // --- Reading popup ---
  type Opened = { id: string; left: number; top: number; bottom: number; right: number; from: "mark" | "button" };
  let reading = $state.raw<Opened | null>(null);
  let readingElement = $state<HTMLElement>();
  let readingHeight = $state(0);
  let closing: ReturnType<typeof setTimeout> | undefined;

  /** The popup reads; or it holds the edit form or the delete confirmation, which nothing closes but their own buttons and Escape. */
  let mode = $state<"read" | "edit" | "delete">("read");
  let editNote = $state("");
  let busy = $state(false);
  let editField = $state<HTMLTextAreaElement>();
  let confirmCancel = $state<HTMLButtonElement>();

  const cancelClose = () => clearTimeout(closing);
  const scheduleClose = () => {
    cancelClose();
    if (mode !== "read") return;
    closing = setTimeout(() => (reading = null), CLOSE_DELAY);
  };
  function closeReading() {
    cancelClose();
    mode = "read";
    reading = null;
  }
  function show(id: string, element: Element, from: Opened["from"]) {
    if (mode !== "read") return;
    cancelClose();
    const box = element.getBoundingClientRect();
    reading = { id, left: box.left, top: box.top, bottom: box.bottom, right: box.right, from };
  }

  const shown = $derived(reading ? placements.find((each) => each.annotation.id === reading!.id) : undefined);
  const readingStyle = $derived.by(() => {
    if (!reading) return "";
    const clamp = (value: number, max: number) => Math.max(8, Math.min(value, max));
    if (reading.from === "button") return `left:${clamp(reading.left - POPUP_WIDTH - 8, window.innerWidth - POPUP_WIDTH - 8)}px;top:${clamp(reading.top, window.innerHeight - readingHeight - 8)}px`;
    return `left:${clamp(reading.left, window.innerWidth - POPUP_WIDTH - 8)}px;top:${clamp(reading.bottom + 6, window.innerHeight - readingHeight - 8)}px`;
  });

  /** The message of a failed annotation write: the file keeps changing, is not valid, or the annotation is gone; else `fallback`. */
  function failureOf(reason: unknown, fallback: MessageKey): string {
    if (reason instanceof Conflict) return t("annotationsBusy");
    if (reason instanceof Refused && reason.reason === "invalidAnnotations") return t("annotationsInvalid");
    if (reason instanceof Refused && reason.reason === "missing") return t("annotationMissing");
    return t(fallback);
  }

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(currentLocale(), { dateStyle: "medium" }).format(date);
  };
  /** The creation date, and the last edit's when there is one. */
  const datesOf = (annotation: Annotation) => {
    const edited = annotation.updated ? formatDate(annotation.updated) : "";
    return formatDate(annotation.createdAt) + (edited ? t("annotationEdited", { date: edited }) : "");
  };

  function startEdit(annotation: Annotation) {
    cancelClose();
    editNote = annotation.note;
    mode = "edit";
  }
  $effect(() => {
    if (mode === "edit") editField?.focus();
  });
  $effect(() => {
    if (mode === "delete") confirmCancel?.focus();
  });
  // Escape cancels the form or the confirmation.
  $effect(() => {
    if (mode === "read") return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeReading();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  async function saveEdit() {
    if (!reading || !editNote.trim() || busy) return;
    busy = true;
    try {
      await edit(reading.id, editNote);
      await reload();
      closeReading();
    } catch (reason) {
      const missing = reason instanceof Refused && reason.reason === "missing";
      fail(failureOf(reason, "annotationSaveFailed"), reason);
      if (missing) await reload();
    } finally {
      busy = false;
    }
  }

  async function confirmDelete() {
    if (!reading || busy) return;
    busy = true;
    try {
      await remove(reading.id);
      await reload();
      closeReading();
    } catch (reason) {
      fail(failureOf(reason, "annotationDeleteFailed"), reason);
    } finally {
      busy = false;
    }
  }

  // Hovering a mark shows its popup; leaving it starts the delay; scrolling closes at once.
  $effect(() => {
    if (!article || marker === "hidden") return;
    const root = article;
    const over = (event: MouseEvent) => {
      const mark = (event.target as Element).closest<HTMLElement>("mark.ld-annotation");
      if (mark) show(mark.dataset.annotationId!, mark, "mark");
    };
    const out = (event: MouseEvent) => {
      if ((event.target as Element).closest("mark.ld-annotation")) scheduleClose();
    };
    const scrolled = (event: Event) => {
      if (mode !== "read" || (event.target instanceof Node && readingElement?.contains(event.target))) return;
      cancelClose();
      reading = null;
    };
    root.addEventListener("mouseover", over);
    root.addEventListener("mouseout", out);
    document.addEventListener("scroll", scrolled, true);
    return () => {
      root.removeEventListener("mouseover", over);
      root.removeEventListener("mouseout", out);
      document.removeEventListener("scroll", scrolled, true);
      closeReading();
    };
  });

  // --- Column ---
  let columnTop = $state(0);
  $effect(() => {
    headerHeight;
    const place = () => (columnTop = (article?.closest("main")?.getBoundingClientRect().top ?? 0) + headerHeight + 8);
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  });

  const label = (placement: Placement) => {
    const note = normalizeSpaces(placement.annotation.note);
    const cut = note.length > 60 ? `${note.slice(0, 60)}…` : note;
    const warning = placement.state === "orphan" ? t("annotationOrphan") : placement.state === "surroundingChanged" ? t("annotationChanged") : "";
    return warning ? `${warning} ${cut}` : cut;
  };

  /** Scrolls the mark of an annotation to the middle of the window, opening the folded sections around it first. */
  // A click focuses the button too: only keyboard focus shows the popup, so a click scrolls only (rule 9).
  function reveal(placement: Placement, button: Element) {
    if (placement.state === "orphan") return show(placement.annotation.id, button, "button");
    const mark = article?.querySelector(`mark[data-annotation-id="${CSS.escape(placement.annotation.id)}"]`);
    if (!mark) return;
    for (let each = mark.closest("details"); each; each = each.parentElement?.closest("details")) each.open = true;
    mark.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // --- Creation popup (Marker Active) ---
  let creating = $state.raw<{ draft: Omit<AnnotationDraft, "note">; left: number; bottom: number } | null>(null);
  let note = $state("");
  let saving = $state(false);
  let noteField = $state<HTMLTextAreaElement>();
  let creatingElement = $state<HTMLElement>();
  let creatingHeight = $state(0);

  $effect(() => {
    if (marker !== "active") creating = null;
  });
  $effect(() => {
    if (creating) noteField?.focus();
  });

  $effect(() => {
    if (marker !== "active" || !article) return;
    const root = article;
    const released = (event: MouseEvent) => {
      if (event.target instanceof Node && creatingElement?.contains(event.target)) return;
      const selection = getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
      const range = selection.getRangeAt(0);
      if (!root.contains(range.startContainer)) return;
      const draft = draftOfRange(root, range);
      if (!draft) return;
      const box = range.getBoundingClientRect();
      note = "";
      creating = { draft, left: box.left, bottom: box.bottom };
    };
    document.addEventListener("mouseup", released);
    return () => document.removeEventListener("mouseup", released);
  });

  const creatingStyle = $derived(
    creating
      ? `left:${Math.max(8, Math.min(creating.left, window.innerWidth - POPUP_WIDTH - 8))}px;top:${Math.max(8, Math.min(creating.bottom + 8, window.innerHeight - creatingHeight - 8))}px`
      : "",
  );

  function cancel() {
    creating = null;
    getSelection()?.removeAllRanges();
  }

  async function save() {
    if (!creating || !note.trim() || saving) return;
    saving = true;
    try {
      await add({ ...creating.draft, note });
      await reload();
      cancel();
    } catch (reason) {
      fail(failureOf(reason, "annotationSaveFailed"), reason);
    } finally {
      saving = false;
    }
  }
</script>

{#if marker !== "hidden" && placements.length > 0}
  <div class="column" role="group" aria-label={t("annotationsColumn")} style:top="{columnTop}px">
    {#each placements as placement (placement.annotation.id)}
      <button
        type="button"
        class="chip"
        data-state={placement.state}
        data-open={reading?.id === placement.annotation.id}
        aria-label={label(placement)}
        onmouseenter={(event) => show(placement.annotation.id, event.currentTarget, "button")}
        onmouseleave={scheduleClose}
        onfocus={(event) => { if (event.currentTarget.matches(":focus-visible")) show(placement.annotation.id, event.currentTarget, "button"); }}
        onblur={scheduleClose}
        onclick={(event) => reveal(placement, event.currentTarget)}
      >{placement.state === "orphan" ? "⚠" : "✎"}</button>
    {/each}
  </div>
{/if}

{#if reading && (shown || mode !== "read")}
  {#if mode === "read" && shown}
    <div
      class="popup reading"
      role="tooltip"
      style={readingStyle}
      bind:this={readingElement}
      bind:offsetHeight={readingHeight}
      onmouseenter={cancelClose}
      onmouseleave={scheduleClose}
    >
      <p class="date">✎ {datesOf(shown.annotation)}</p>
      {#if shown.state === "surroundingChanged"}<p class="changed">{t("annotationChanged")}</p>{/if}
      {#if shown.state === "orphan"}<p class="orphan">{t("annotationOrphan")}</p>{/if}
      <p class="note">{shown.annotation.note}</p>
      <div class="actions">
        <button type="button" onclick={() => startEdit(shown.annotation)}>{t("annotationEdit")}</button>
        <button type="button" class="danger" onclick={() => { cancelClose(); mode = "delete"; }}>{t("annotationDelete")}</button>
      </div>
    </div>
  {:else if mode === "edit"}
    <div
      class="ld-form popup form"
      role="dialog"
      aria-label={t("annotationEditTitle")}
      tabindex="-1"
      style={readingStyle}
      bind:this={readingElement}
      bind:offsetHeight={readingHeight}
      onkeydown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void saveEdit();
      }}
    >
      <strong>{t("annotationEditTitle")}</strong>
      <label class="field">
        <textarea rows="4" aria-label={t("annotationReading")} placeholder={t("annotationPlaceholder")} bind:value={editNote} bind:this={editField}></textarea>
      </label>
      <div class="actions">
        <button type="button" onclick={closeReading}>{t("cancel")}</button>
        <button type="button" class="primary" disabled={!editNote.trim() || busy} onclick={() => void saveEdit()}>{t("annotationSave")}</button>
      </div>
    </div>
  {:else if mode === "delete"}
    <div
      class="ld-form popup form"
      role="dialog"
      aria-label={t("annotationDeleteTitle")}
      tabindex="-1"
      style={readingStyle}
      bind:this={readingElement}
      bind:offsetHeight={readingHeight}
    >
      <strong>{t("annotationDeleteAsk")}</strong>
      <div class="actions">
        <button type="button" bind:this={confirmCancel} onclick={closeReading}>{t("cancel")}</button>
        <button type="button" class="danger" disabled={busy} onclick={() => void confirmDelete()}>{t("delete")}</button>
      </div>
    </div>
  {/if}
{/if}

{#if creating}
  <div
    class="ld-form popup form"
    role="dialog"
    aria-label={t("annotationNew")}
    tabindex="-1"
    style={creatingStyle}
    bind:this={creatingElement}
    bind:offsetHeight={creatingHeight}
    onkeydown={(event) => {
      if (event.key === "Escape") cancel();
      else if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void save();
    }}
  >
    <strong>{t("annotationTitle")}</strong>
    <em class="excerpt">{excerpt(creating.draft.selectedText)}</em>
    <label class="field">
      <textarea rows="4" aria-label={t("annotationReading")} placeholder={t("annotationPlaceholder")} bind:value={note} bind:this={noteField}></textarea>
    </label>
    <div class="actions">
      <button type="button" onclick={cancel}>{t("cancel")}</button>
      <button type="button" class="primary" disabled={!note.trim() || saving} onclick={() => void save()}>{t("annotationSave")}</button>
    </div>
  </div>
{/if}

<style>
  :global(mark.ld-annotation) {
    background: rgba(250, 204, 21, 0.5);
    color: inherit;
    border-radius: 2px;
    cursor: pointer;
    padding: 0 1px;
  }
  .column {
    position: fixed;
    right: 14px;
    z-index: 6;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: calc(100vh - 80px);
    overflow-y: auto;
  }
  .chip {
    width: 32px;
    height: 32px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    color: #1f1300;
    background: #facc15;
  }
  .chip[data-state="surroundingChanged"] {
    background: #fb923c;
  }
  .chip[data-state="orphan"] {
    background: #ef4444;
    color: #fff;
  }
  .chip[data-open="true"] {
    background: #eab308;
  }
  .chip[data-state="surroundingChanged"][data-open="true"] {
    background: #ea580c;
  }
  .chip[data-state="orphan"][data-open="true"] {
    background: #b91c1c;
  }
  .popup {
    position: fixed;
    z-index: 30;
    box-sizing: border-box;
    width: 320px;
    padding: 0.7rem 0.8rem;
    color: var(--ink);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
  }
  .popup p {
    margin: 0 0 0.4rem;
  }
  .date {
    color: var(--muted, #777);
    font-size: 0.85em;
  }
  .changed {
    color: light-dark(#b45309, #fb923c);
    font-size: 0.85em;
  }
  .orphan {
    color: light-dark(#c0392b, #f87171);
    font-size: 0.85em;
  }
  .note {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-height: 17em;
    overflow-y: auto;
    line-height: 1.4;
  }
  .form {
    display: grid;
    gap: 0.5rem;
  }
  .excerpt {
    color: var(--muted, #777);
    overflow-wrap: anywhere;
    font-size: 0.9em;
  }
  .danger {
    color: light-dark(#c0392b, #f87171);
    border-color: light-dark(#c0392b, #f87171);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
