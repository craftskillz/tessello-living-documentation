<script lang="ts">
  // Listen (docs/spec/read-aloud.md): reads the rendered Document with the browser's voices (ADR 0009), highlights the
  // spoken sentence and keeps it centred. Hidden when the browser has no voice. Unmounting (editing, leaving) stops it.
  import { onDestroy, onMount, tick } from "svelte";
  import { currentLocale, readingLabels, t } from "../lib/i18n.ts";
  import { createReader, type ReaderState } from "../lib/reader.ts";
  import { announcementLanguage, languagesWithVoice, readingCharacters, readingScript, voicesFor, type Segment } from "../lib/readingScript.ts";
  import { browserSpeaker, voiceInfo, watchVoices } from "./speech.ts";

  let {
    article,
    language,
    content,
    savelanguage,
    onfail,
  }: {
    /** The rendered Document. */
    article: HTMLElement | undefined;
    /** The Document's reading language (readingLanguage), null when it has none. */
    language: string | null;
    /** Changes whenever another Document opens or the rendering changes: the reading stops. */
    content: string;
    /** Writes `language: <code>` (version-checked); resolves to a translated failure, or null when written. */
    savelanguage: (code: string) => Promise<string | null>;
    onfail: (message: string) => void;
  } = $props();

  let voices = $state.raw<SpeechSynthesisVoice[]>([]);
  let reading = $state.raw<ReaderState>({ status: "idle", at: null, hasNextSection: false });
  let script: Segment[] = [];
  let asking = $state<{ saving: boolean; failure: string | null; chosen: string | null } | null>(null);

  const interfaceLanguage = () => (currentLocale().toLowerCase().startsWith("fr") ? "fr" : "en");
  const offered = $derived(languagesWithVoice(voices.map(voiceInfo), interfaceLanguage()));
  const names = $derived(new Intl.DisplayNames([currentLocale()], { type: "language" }));
  const nameOf = (code: string) => {
    try {
      const name = names.of(code) ?? code;
      return name.charAt(0).toLocaleUpperCase(currentLocale()) + name.slice(1);
    } catch {
      return code;
    }
  };

  const reader = createReader(
    { speak: (text, handlers) => speaker?.speak(text, handlers), cancel: () => speaker?.cancel() },
    {
      onchange(next) {
        reading = next;
        highlight();
      },
      onerror() {
        onfail(t("readingFailed"));
      },
    },
  );
  let speaker: ReturnType<typeof browserSpeaker> | null = null;

  onMount(() => watchVoices((list) => (voices = list)));
  onDestroy(() => {
    reader.stop();
    clearHighlight();
  });

  // Another Document, a new rendering: the reading stops.
  let seen: string | null = null;
  $effect(() => {
    const key = content;
    if (seen !== null && seen !== key) reader.stop();
    seen = key;
  });

  function listen() {
    if (language === null) {
      asking = { saving: false, failure: null, chosen: null };
      return;
    }
    read(language);
  }

  function read(code: string) {
    const match = voicesFor(code, voices.map(voiceInfo))[0];
    if (!match || !article) {
      if (!match) onfail(t("readingNoVoice", { language: code }));
      return;
    }
    speaker = browserSpeaker(code, voices.find((voice) => voice.name === match.name && voice.lang === match.lang) ?? null);
    script = readingScript(article, code, readingLabels(announcementLanguage(code, interfaceLanguage())));
    reader.start(script);
  }

  async function choose(code: string) {
    if (!asking || asking.saving) return;
    asking = { saving: true, failure: null, chosen: code };
    const failure = await savelanguage(code);
    if (failure) {
      asking = { saving: false, failure, chosen: code };
      return;
    }
    asking = null;
    // The written language changes the Document: let its rendering settle before the script is taken from it.
    await tick();
    seen = content;
    read(code);
  }

  const HIGHLIGHT = "ld-reading";
  let block: Element | null = null;

  function clearHighlight() {
    if (typeof CSS !== "undefined" && "highlights" in CSS) CSS.highlights.delete(HIGHLIGHT);
    block?.classList.remove("ld-reading-block");
    block = null;
  }

  /** Highlights the spoken sentence (the whole element for an announced block) and scrolls it to the centre. */
  function highlight() {
    clearHighlight();
    const at = reading.at;
    if (!at) return;
    const segment = script[at.segment];
    const sentence = segment?.sentences[at.sentence];
    if (!segment || !sentence) return;
    const element = segment.element as unknown as Element;
    let target: Range | Element = element;
    if (segment.announced || typeof CSS === "undefined" || !("highlights" in CSS)) {
      block = element;
      element.classList.add("ld-reading-block");
    } else {
      const characters = readingCharacters(segment.element);
      const first = characters[sentence.start];
      const last = characters[sentence.end - 1];
      if (first && last) {
        const range = document.createRange();
        range.setStart(first.node as unknown as Node, first.offset);
        range.setEnd(last.node as unknown as Node, last.offset + 1);
        CSS.highlights.set(HIGHLIGHT, new Highlight(range));
        target = range;
      }
    }
    centre(target, element);
  }

  /** Scrolls the nearest scrolling ancestor so that `target` sits in its middle. */
  function centre(target: Range | Element, from: Element) {
    let scroller: Element | null = from.parentElement;
    while (scroller && !(/(auto|scroll)/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight)) scroller = scroller.parentElement;
    const box = target.getBoundingClientRect();
    const frame = scroller ? scroller.getBoundingClientRect() : { top: 0, height: window.innerHeight };
    const delta = box.top + box.height / 2 - (frame.top + frame.height / 2);
    (scroller ?? document.scrollingElement)?.scrollBy({ top: delta, behavior: "smooth" });
  }

  function modal(node: HTMLDialogElement) {
    node.showModal();
  }
  const close = () => {
    if (!asking?.saving) asking = null;
  };
</script>

{#if voices.length > 0}
  {#if reading.status === "idle"}
    <button title={t("listenHint")} onclick={listen}>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" /></svg>
      {t("listen")}
    </button>
  {:else}
    <span class="controls" role="group" aria-label={t("readingControls")}>
      {#if reading.status === "paused"}
        <button class="icon" aria-label={t("readingResume")} title={t("readingResume")} onclick={() => reader.resume()}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z" /></svg>
        </button>
      {:else}
        <button class="icon" aria-label={t("readingPause")} title={t("readingPause")} onclick={() => reader.pause()}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
        </button>
      {/if}
      <button class="icon" aria-label={t("readingNext")} title={t("readingNext")} disabled={!reading.hasNextSection} onclick={() => reader.nextSection()}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4l10 8-10 8zM16 4h3v16h-3z" /></svg>
      </button>
      <button class="icon" aria-label={t("readingStop")} title={t("readingStop")} onclick={() => reader.stop()}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z" /></svg>
      </button>
    </span>
  {/if}
{/if}

{#if asking}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <dialog
    use:modal
    class="ld-form"
    aria-labelledby="reading-language-title"
    oncancel={(event) => {
      event.preventDefault();
      close();
    }}
    onclick={(event) => {
      if (event.target === event.currentTarget) close();
    }}
  >
    <div class="body">
      <h2 id="reading-language-title">{t("readingLanguageTitle")}</h2>
      <p class="hint muted">{t("readingLanguageText")}</p>
      {#if offered.length === 0}
        <p class="hint muted">{t("readingLanguageNone")}</p>
      {:else}
        <div class="languages">
          {#each offered as code (code)}
            <button type="button" disabled={asking.saving} onclick={() => void choose(code)}>{nameOf(code)}</button>
          {/each}
        </div>
      {/if}
      {#if asking.failure}<p class="invalid" role="alert">{asking.failure}</p>{/if}
      <div class="actions">
        {#if asking.failure && asking.chosen}
          <button type="button" class="primary" onclick={() => void choose(asking!.chosen!)}>{t("readingRetry")}</button>
        {/if}
        <button type="button" disabled={asking.saving} onclick={close}>{t("cancel")}</button>
      </div>
    </div>
  </dialog>
{/if}

<style>
  .controls {
    display: inline-flex;
    gap: 0.25rem;
  }
  .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  dialog {
    color: var(--ink);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0;
    width: min(28rem, 92vw);
  }
  .body {
    padding: 1rem 1.2rem;
  }
  h2 {
    margin: 0 0 0.5rem;
    font-size: 1.1rem;
  }
  .languages {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    max-height: 40vh;
    overflow: auto;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
  }
</style>
