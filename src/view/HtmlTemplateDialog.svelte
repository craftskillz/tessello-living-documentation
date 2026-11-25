<script lang="ts">
  // The dialog that chooses the HTML template of the open Document (docs/spec/html-generation.md). It only shows and asks:
  // View writes the choice. Escape, Close or a click outside close it without writing.
  import { t, type MessageKey } from "../lib/i18n.ts";
  import { HTML_TEMPLATES, type HtmlTemplateId } from "../lib/htmlTemplates.ts";

  let {
    current,
    unknown,
    saving,
    failure,
    onchoose,
    onclose,
  }: {
    /** The Document's template, when it is one of ours. */
    current: HtmlTemplateId | null;
    /** The Document's `html_template` value when it names no template of ours. */
    unknown: string | null;
    saving: boolean;
    /** The translated reason the last choice was not saved, if any. */
    failure: string | null;
    onchoose: (id: HtmlTemplateId) => void;
    onclose: () => void;
  } = $props();

  const NAMES: Record<HtmlTemplateId, [MessageKey, MessageKey]> = {
    "interview-sheet": ["htmlInterviewSheet", "htmlInterviewSheetText"],
    article: ["htmlArticle", "htmlArticleText"],
  };
  const FOLDERS = { interviews: "htmlFolderInterviews", articles: "htmlFolderArticles" } as const;
  const folders = (["interviews", "articles"] as const).map((folder) => ({ folder, templates: HTML_TEMPLATES.filter((each) => each.folder === folder) }));

  /** Opens the `<dialog>` as a modal when it appears (the Host's frame blocks window.confirm). */
  function modal(node: HTMLDialogElement) {
    node.showModal();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  use:modal
  class="ld-form"
  aria-labelledby="html-template-title"
  oncancel={(event) => {
    event.preventDefault();
    onclose();
  }}
  onclick={(event) => {
    if (event.target === event.currentTarget) onclose();
  }}
>
  <div class="body">
    <header>
      <h2 id="html-template-title">{t("htmlPickerTitle")}</h2>
      <button type="button" class="close" aria-label={t("close")} title={t("close")} onclick={onclose}>×</button>
    </header>
    <p class="hint muted">{t("htmlPickerIntro")}</p>
    {#if unknown !== null}<p class="hint muted name" role="note">{t("htmlUnknownNote", { name: unknown })}</p>{/if}
    {#each folders as { folder, templates } (folder)}
      <fieldset>
        <legend>{t(FOLDERS[folder])}</legend>
        {#each templates as template (template.id)}
          <button type="button" class="card" class:current={current === template.id} disabled={saving} onclick={() => onchoose(template.id)}>
            <strong>{t(NAMES[template.id][0])}</strong>
            <span class="muted">{t(NAMES[template.id][1])}</span>
            {#if current === template.id}<span class="mark">{t("htmlCurrent")}</span>{/if}
          </button>
        {/each}
      </fieldset>
    {/each}
    {#if failure}<p class="invalid" role="alert">{failure}</p>{/if}
  </div>
</dialog>

<style>
  /* The form look comes from .ld-form (base.css, docs/ui.md); only the dialog's own layout is here. */
  /* A template name written in the Document shows in full (docs/ui.md, Names). */
  .name {
    overflow-wrap: anywhere;
  }
  dialog {
    width: min(92vw, 30rem);
    padding: 0;
    color: var(--ink);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.25);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.35);
  }
  .body {
    padding: 0.8rem 1rem;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.4rem;
  }
  h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .close {
    line-height: 1;
  }
  .hint {
    margin: 0 0 0.7rem;
  }
  .card {
    display: grid;
    gap: 0.2rem;
    text-align: left;
    padding: 0.5rem 0.7rem;
    font: inherit;
    color: var(--ink);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 6px;
    cursor: pointer;
  }
  .card:hover:not(:disabled) {
    border-color: var(--accent);
  }
  .card:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .card.current {
    border-color: var(--accent);
  }
  .card span {
    font-size: 0.85em;
  }
  .card .mark {
    color: var(--accent);
    font-weight: 600;
  }
</style>
