<script lang="ts">
  // The header of a Document being read: dates, Type, description, tags, and the warning of an invalid frontmatter.
  // It only shows and asks; writing the Type is the View's (version-checked) job.
  import { formatTreeDate } from "../lib/dates.ts";
  import { currentLocale, t } from "../lib/i18n.ts";

  let {
    created,
    modified,
    type,
    description,
    tags,
    invalid,
    suggest,
    onsave,
  }: {
    created: string | null;
    modified: number | null;
    type: string | null;
    description: string | null;
    tags: string[];
    /** The parser's message and line when the frontmatter is not valid YAML. */
    invalid: { line: number | null } | null;
    /** The Types used in the Project. */
    suggest: () => Promise<string[]>;
    /** Saves the Type; an empty value clears it. */
    onsave: (value: string) => Promise<void> | void;
  } = $props();

  let editing = $state(false);
  let value = $state("");
  let options = $state<string[]>([]);
  let input = $state<HTMLInputElement>();
  const listId = `ld-types-${Math.random().toString(36).slice(2)}`;

  async function open() {
    value = type ?? "";
    editing = true;
    options = [];
    try {
      options = await suggest();
    } catch {
      options = [];
    }
  }

  $effect(() => {
    if (editing) input?.focus();
  });

  async function save() {
    editing = false;
    await onsave(value);
  }

  async function clear() {
    editing = false;
    await onsave("");
  }

  function keydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      void save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      editing = false;
    }
  }
</script>

<header class="meta">
  <div class="line muted">
    {#if created}<span>{t("createdOn")} {formatTreeDate({ kind: "created", at: created }, currentLocale())}</span>{/if}
    {#if modified !== null}<span>{t("modifiedOn")} {formatTreeDate({ kind: "modified", at: modified }, currentLocale())}</span>{/if}
    {#if editing}
      <span class="editor ld-form">
        <label class="field">
          <span class="visually-hidden">{t("typeLabel")}</span>
          <input bind:this={input} bind:value type="text" list={listId} onkeydown={keydown} />
        </label>
        <datalist id={listId}>
          {#each options as option (option)}<option value={option}></option>{/each}
        </datalist>
        <button type="button" class="pill" aria-label={t("saveType")} title={t("saveType")} onclick={() => void save()}>✓</button>
        {#if type}<button type="button" class="pill quiet" onclick={() => void clear()}>{t("clearType")}</button>{/if}
      </span>
    {:else if type}
      <button type="button" class="pill type" aria-label={t("typeOf", { type })} onclick={() => void open()}>{type}</button>
    {:else}
      <button type="button" class="pill quiet" onclick={() => void open()}>{t("addType")}</button>
    {/if}
  </div>
  {#if invalid}
    <p class="warning" role="note">{t("frontmatterInvalid", { line: invalid.line ?? 1 })}</p>
  {/if}
  {#if description}<p class="description muted">{description}</p>{/if}
  {#if tags.length > 0}
    <ul class="tags" aria-label={t("tagsLabel")}>
      {#each tags as tag (tag)}<li class="pill tag">#{tag}</li>{/each}
    </ul>
  {/if}
</header>

<style>
  .meta {
    display: grid;
    gap: 0.4rem;
    margin-bottom: 1rem;
    font-size: 0.85rem;
  }
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.75rem;
  }
  .muted {
    color: var(--muted);
  }
  .description {
    margin: 0;
    font-size: 1.05rem;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .pill {
    font: inherit;
    font-size: 0.8rem;
    padding: 0.05rem 0.55rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
  }
  button.pill {
    cursor: pointer;
  }
  .pill.type {
    color: var(--accent);
    border-color: var(--accent);
  }
  .pill.quiet {
    border-style: dashed;
  }
  .editor {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .editor input {
    width: 10rem;
  }
  .warning {
    margin: 0;
    padding: 0.35rem 0.6rem;
    border: 1px solid light-dark(#c0392b, #f87171);
    border-radius: 6px;
    color: light-dark(#c0392b, #f87171);
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
</style>
