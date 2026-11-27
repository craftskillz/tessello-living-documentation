<script lang="ts">
  // Listen (docs/spec/read-aloud.md): reads the rendered Document with the browser's voices (ADR 0009), highlights the
  // spoken sentence and keeps it centred. Hidden when the browser has no voice. Unmounting (editing, leaving) stops it.
  import { onDestroy, onMount, tick } from "svelte";
  import { currentLocale, readingLabels, t } from "../lib/i18n.ts";
  import { createReader, type ReaderState } from "../lib/reader.ts";
  import { READING_RATE, type ReadingPreferences } from "../lib/projects.ts";
  import { announcementLanguage, chooseVoice, primaryLanguage as primary, languagesWithVoice, readingCharacters, readingScript, readingStart, voicesFor, type Segment } from "../lib/readingScript.ts";
  import { browserSpeaker, voiceInfo, watchVoices } from "./speech.ts";

  let {
    article,
    selection,
    language,
    content,
    preferences,
    onvoice,
    onrate,
    savelanguage,
    onfail,
  }: {
    /** What is read: the rendered Document, or the main content of the generated page. */
    article: HTMLElement | undefined;
    /** The selection of the surface `article` is in (the document's, or its shadow root's). */
    selection: () => Selection | null;
    /** The voice kept per language and the speed. */
    preferences: ReadingPreferences;
    /** Keeps the voice for a language (primary code); null: the browser's default. */
    onvoice: (language: string, voice: string | null) => void;
    onrate: (rate: number) => void;
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


  // The voice and speed panel: the voice is chosen per language, the language shown first being the Document's.
  let shown = $state(false);
  let liveRate = $state<number | null>(null);
  let panel = $state<HTMLElement>();
  let cog = $state<HTMLButtonElement>();
  let panelLanguage = $state<string | null>(null);
  const forLanguage = $derived.by(() => {
    const wanted = panelLanguage ?? (language ? primary(language) : null);
    return wanted && offered.includes(wanted) ? wanted : (offered[0] ?? null);
  });
  const voiceNames = $derived(forLanguage ? voicesFor(forLanguage, voices.map(voiceInfo)) : []);
  const keptVoice = $derived(forLanguage ? preferences.voices[forLanguage] : undefined);
  const speed = (value: number) => `${Number(value.toFixed(2))}×`;

  function onwindowkey(event: KeyboardEvent) {
    if (shown && event.key === "Escape") {
      shown = false;
      cog?.focus();
    }
  }
  function onwindowpointer(event: PointerEvent) {
    if (shown && panel && !panel.contains(event.target as Node)) shown = false;
  }

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

  /** Where the selection begins, as child indexes from the root: the Document is rendered again when its language is written, so a node would not survive. */
  let capturedStart: { path: number[]; offset: number } | null = null;

  function capture() {
    capturedStart = null;
    const range = selection();
    if (!article || !range || range.rangeCount === 0 || range.isCollapsed) return;
    const { startContainer: node, startOffset: offset } = range.getRangeAt(0);
    if (!article.contains(node)) return;
    const path: number[] = [];
    for (let at: Node = node; at !== article; at = at.parentNode!) path.unshift([...at.parentNode!.childNodes].indexOf(at as ChildNode));
    capturedStart = { path, offset };
  }

  function resolve(root: HTMLElement): { node: Node; offset: number } | null {
    if (!capturedStart) return null;
    let node: Node = root;
    for (const index of capturedStart.path) {
      const next = node.childNodes[index];
      if (!next) return null;
      node = next;
    }
    return { node, offset: capturedStart.offset };
  }

  function listen() {
    capture();
    if (language === null) {
      asking = { saving: false, failure: null, chosen: null };
      return;
    }
    read(language);
  }

  function read(code: string) {
    const match = chooseVoice(code, voices.map(voiceInfo), preferences.voices[primary(code)]);
    if (!match || !article) {
      if (!match) onfail(t("readingNoVoice", { language: code }));
      return;
    }
    speaker = browserSpeaker(code, voices.find((voice) => voice.name === match.name && voice.lang === match.lang) ?? null, () => preferences.rate);
    script = readingScript(article, code, readingLabels(announcementLanguage(code, interfaceLanguage())));
    const point = resolve(article);
    const from = point ? readingStart(article, script, point) : null;
    if (from) script = from.script;
    reader.start(script, from?.from);
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
    // A generated page lives in a shadow root: its scroller is above the host.
    const up = (element: Element): Element | null => element.parentElement ?? (element.getRootNode() instanceof ShadowRoot ? (element.getRootNode() as ShadowRoot).host : null);
    let scroller: Element | null = up(from);
    while (scroller && !(/(auto|scroll)/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight)) scroller = up(scroller);
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

<svelte:window onkeydown={onwindowkey} onpointerdown={onwindowpointer} />

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
  <span class="settings" bind:this={panel}>
    <button type="button" class="icon" bind:this={cog} aria-label={t("readingSettings")} title={t("readingSettings")} aria-haspopup="dialog" aria-expanded={shown} onclick={() => {
        shown = !shown;
        liveRate = null;
      }}>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        ><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg
      >
    </button>
    {#if shown}
      <div class="panel ld-form" role="dialog" aria-label={t("readingSettings")}>
        <fieldset>
          <legend>{t("readingVoice")}</legend>
          <label class="field">
            <span id="reading-language-label">{t("readingVoiceLanguage")}</span>
            <select aria-labelledby="reading-language-label" value={forLanguage ?? ""} onchange={(event) => (panelLanguage = event.currentTarget.value)}>
              {#each offered as code (code)}<option value={code}>{nameOf(code)}</option>{/each}
            </select>
          </label>
          <label class="field">
            <span id="reading-voice-label">{t("readingVoice")}</span>
            <select aria-labelledby="reading-voice-label" value={keptVoice ?? ""} onchange={(event) => forLanguage && onvoice(forLanguage, event.currentTarget.value || null)}>
              <option value="">{t("readingVoiceDefault")}</option>
              {#each voiceNames as voice (voice.name)}<option value={voice.name}>{voice.name}</option>{/each}
            </select>
          </label>
        </fieldset>
        <fieldset>
          <legend>{t("readingSpeed")}</legend>
          <input type="range" aria-label={t("readingSpeed")} min={READING_RATE.min} max={READING_RATE.max} step="0.05" value={preferences.rate} onchange={(event) => onrate(Number(event.currentTarget.value))} oninput={(event) => (liveRate = Number(event.currentTarget.value))} />
          <span class="muted" aria-live="polite">{speed(liveRate ?? preferences.rate)}</span>
        </fieldset>
      </div>
    {/if}
  </span>
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
  .settings {
    position: relative;
    display: inline-block;
  }
  .panel {
    position: absolute;
    z-index: 20;
    top: 100%;
    right: 0;
    width: min(18rem, 80vw);
    margin-top: 0.3rem;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.2);
    text-align: left;
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
