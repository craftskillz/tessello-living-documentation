<script lang="ts">
  // The snippets dialog: a picker of the kinds of snippet, then the form of the chosen kind with the Markdown it writes. It only
  // shows and asks: the caller puts the Markdown where it belongs (an editor's selection, or a block of the reading view).
  import { onMount, tick } from "svelte";
  import { searchEmojis, EMOJI_GROUPS } from "../lib/emojis.ts";
  import { t, type MessageKey } from "../lib/i18n.ts";
  import { ALIGNS, buildSnippet, COLUMN_COUNTS, GAPS, KANBAN_COLORS, MAX_TREE_LEVEL, MERMAID_CHARTS, newSnippet, NOTE_POSITIONS, parseSnippet, QUOTE_TYPES, SEQUENCE_ARROWS, SNIPPET_CATEGORIES, showsPreview, SWATCHES, type Swatch, type SnippetData, type SnippetKind, TABLE_BORDERS, TABLE_COLORS, TABLE_FILLS, TABLE_STYLES, TEXT_ALIGNS, VERTICAL_ALIGNS, WIDTHS } from "../lib/snippets.ts";
  import { snippetTexts, type Heading, type SnippetFailure } from "./snippetDialog.ts";

  let {
    start,
    mode,
    documents,
    headings,
    headingsOf,
    onsubmit,
    onattach,
    ondelete,
    focusCell,
    onclose,
  }: {
    /** Picker first (insert), or straight on a form (a selection recognized, or editing a block: no Back, no picker). */
    start: { kind: "picker" } | { kind: "form"; data: SnippetData };
    /** "insert": title "Insert a snippet", button Insert; "edit": title "Edit snippet", button Save, plus "Delete block" when `ondelete` is given. */
    mode: "insert" | "edit";
    documents: { path: string; title: string }[];
    /** Headings of the Document being edited (its current text, the section draft included). */
    headings: Heading[];
    /** Headings of another Document (Link to document with anchor); rejects on failure. */
    headingsOf: (path: string) => Promise<Heading[]>;
    /** Writes the Markdown; resolves null when done (the dialog closes) or with a failure to show inside the dialog. */
    onsubmit: (markdown: string, data: SnippetData) => Promise<SnippetFailure | null>;
    /** File attachment: saves the chosen file (under files/) and resolves with the link Markdown, or rejects. */
    onattach: (file: File) => Promise<string>;
    /** "stay": the User gave up (the confirmation was cancelled), the dialog stays as it is. */
    ondelete?: () => Promise<SnippetFailure | null | "stay">;
    /** A table form opens with this cell focused (a double-click on a cell of the reading view). */
    focusCell?: { row: number; column: number };
    onclose: () => void;
  } = $props();

  const texts = snippetTexts();
  // The dialog is opened afresh for each start: only its first value counts.
  // svelte-ignore state_referenced_locally
  const fromPicker = start.kind === "picker";
  // svelte-ignore state_referenced_locally
  let data = $state<SnippetData | null>(start.kind === "form" ? start.data : null);
  let query = $state("");
  let search = $state<HTMLInputElement>();
  let busy = $state(false);
  let failure = $state<SnippetFailure | null>(null);
  let lastWasDelete = false;
  let copied = $state<"" | "done" | "failed">("");

  const ICONS: Record<SnippetKind, string> = {
    "heading-1": "H1", "heading-2": "H2", "heading-3": "H3", "heading-4": "H4", separator: "―", collapsible: "▸", "unordered-list": "•", "ordered-list": "🔢", table: "▦", kanban: "📋",
    tree: "🌳", "code-block": "💻", compare: "⚖️",
    "colored-text": "🖍", "colored-section": "🎨", blockquote: "❝", emojis: "😀", mermaid: "🧜‍♀️", columns: "◫", attachment: "📎",
    link: "🔗", "doc-link": "📄", "anchor-link": "⚓", "anchor-doc-link": "📄⚓", image: "🖼",
  };
  const name = (kind: SnippetKind) => t(`snKind_${kind}`);
  const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const visible = $derived(
    SNIPPET_CATEGORIES.map((category) => ({ key: category.key, kinds: category.kinds.filter((kind) => fold(name(kind)).includes(fold(query.trim()))) })).filter((category) => category.kinds.length > 0),
  );

  function choose(kind: SnippetKind) {
    data = newSnippet(kind, texts);
    failure = null;
  }

  function back() {
    data = null;
    failure = null;
    query = "";
    void tick().then(() => search?.focus());
  }

  const markdown = $derived(data ? buildSnippet(data, texts) : "");

  async function run(action: () => Promise<SnippetFailure | null | "stay">) {
    busy = true;
    failure = null;
    copied = "";
    try {
      const result = await action();
      if (result === null) onclose();
      else if (result !== "stay") failure = result;
    } finally {
      busy = false;
    }
  }
  const submit = () => run(() => onsubmit(markdown, $state.snapshot(data!) as SnippetData));

  // ── File attachment ──
  let fileInput = $state<HTMLInputElement>();
  /** The file chosen, and its link once saved (so that a Retry after a refused submit does not save it twice). */
  let attached: { file: File; link: string | null } | null = null;
  const choosing = $derived(data?.kind === "attachment" && mode === "insert" && fromPicker);

  async function attach(file: File) {
    attached = { file, link: null };
    await saveAttached();
  }
  async function saveAttached() {
    const current = attached!;
    busy = true;
    failure = null;
    copied = "";
    try {
      if (current.link === null) {
        try {
          current.link = await onattach(current.file);
        } catch {
          failure = { message: t("snAttachFailed"), copy: null, retry: true };
          return;
        }
      }
      const result = await onsubmit(current.link, parseSnippet("attachment", current.link));
      if (result === null) onclose();
      else failure = result;
    } finally {
      busy = false;
    }
  }
  const remove = () => run(ondelete!);

  async function copy() {
    try {
      await navigator.clipboard.writeText(failure!.copy!);
      copied = "done";
    } catch {
      copied = "failed";
    }
  }

  /** Opens the `<dialog>` as a modal when it appears (the Host's frame blocks window.confirm). */
  function modal(node: HTMLDialogElement) {
    node.showModal();
  }

  // ── Table grid ──
  let grid = $state<HTMLElement>();
  let menu = $state<{ x: number; y: number; row: number; column: number } | null>(null);
  type TableData = Extract<SnippetData, { kind: "table" }>;

  async function focusCellAt(row: number, column: number) {
    await tick();
    grid?.querySelector<HTMLInputElement>(`[data-cell="${row}-${column}"]`)?.focus();
  }
  onMount(() => {
    if (focusCell) void focusCellAt(focusCell.row, focusCell.column);
  });

  function cellKey(event: KeyboardEvent, table: TableData, row: number, column: number) {
    const input = event.currentTarget as HTMLInputElement;
    const rows = table.rows.length;
    const columns = table.rows[0]!.length;
    const go = (r: number, c: number) => {
      event.preventDefault();
      void focusCellAt(r, c);
    };
    const addRow = () => table.rows.push(Array.from({ length: columns }, () => ""));
    const addColumn = () => table.rows.forEach((each) => each.push(""));
    if (event.key === "Enter" && event.shiftKey) {
      // A line break in the cell: a GFM row stays on one line, so the cell gets a <br> at the caret.
      event.preventDefault();
      const from = input.selectionStart ?? input.value.length;
      const to = input.selectionEnd ?? from;
      table.rows[row]![column] = input.value.slice(0, from) + "<br>" + input.value.slice(to);
      void tick().then(() => input.setSelectionRange(from + 4, from + 4));
    } else if (event.key === "Tab" && !event.shiftKey) {
      if (column < columns - 1) go(row, column + 1);
      else if (row < rows - 1) go(row + 1, 0);
      else {
        addRow();
        go(row + 1, 0);
      }
    } else if (event.key === "Tab" && event.shiftKey) {
      if (column > 0) go(row, column - 1);
      else if (row > 0) go(row - 1, columns - 1);
    } else if (event.key === "ArrowDown") {
      if (row === rows - 1) addRow();
      go(row + 1, column);
    } else if (event.key === "ArrowUp" && row > 0) go(row - 1, column);
    else if (event.key === "ArrowRight" && input.selectionStart === input.value.length && input.selectionEnd === input.value.length) {
      if (column === columns - 1) addColumn();
      go(row, column + 1);
    } else if (event.key === "ArrowLeft" && input.selectionStart === 0 && input.selectionEnd === 0 && column > 0) go(row, column - 1);
  }

  function deleteRow(table: TableData, row: number) {
    table.rows.splice(row, 1);
    menu = null;
  }
  function deleteColumn(table: TableData, column: number) {
    table.rows.forEach((each) => each.splice(column, 1));
    menu = null;
  }

  // ── Tree ──
  type TreeData = Extract<SnippetData, { kind: "tree" }>;
  function indent(tree: TreeData, index: number, by: 1 | -1) {
    const item = tree.items[index]!;
    const max = index === 0 ? 0 : tree.items[index - 1]!.depth + 1;
    item.depth = Math.max(0, Math.min(max, item.depth + by));
  }
  function removeItem(tree: TreeData, index: number) {
    tree.items.splice(index, 1);
    for (let i = 0; i < tree.items.length; i++) tree.items[i]!.depth = Math.min(tree.items[i]!.depth, i === 0 ? 0 : tree.items[i - 1]!.depth + 1);
  }

  // ── Kanban ──

  // ── Links ──
  const withoutMd = (path: string) => path.replace(/\.md$/i, "");
  let remote = $state<{ path: string; headings: Heading[] | null; failed: boolean }>({ path: "", headings: null, failed: false });
  $effect(() => {
    const current = data;
    if (current?.kind !== "anchor-doc-link" || current.path === "") return;
    const path = current.path;
    if (remote.path === path) return;
    remote = { path, headings: null, failed: false };
    headingsOf(path).then(
      (found) => {
        if (remote.path === path) remote = { path, headings: found, failed: false };
      },
      () => {
        if (remote.path === path) remote = { path, headings: [], failed: true };
      },
    );
  });
  const indented = (heading: Heading) => `${"  ".repeat(Math.max(0, heading.depth - 1))}${heading.text}`;

  // ── Emojis ──
  let emojiQuery = $state("");
  const matching = $derived(new Set(searchEmojis(emojiQuery).map((each) => each.e)));
  const emojiGroups = $derived(EMOJI_GROUPS.map((group) => ({ key: group.key, emojis: group.emojis.filter((each) => matching.has(each.e)) })).filter((group) => group.emojis.length > 0));

  const SWATCH_KEYS = Object.keys(SWATCHES) as Swatch[];
  const title = $derived(mode === "insert" ? t("snInsertTitle") : t("snEditTitle"));
</script>

<svelte:window onpointerdown={() => (menu = null)} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  use:modal
  class="ld-form"
  class:wide={data !== null}
  aria-labelledby="snippets-title"
  oncancel={(event) => {
    event.preventDefault();
    event.stopPropagation();
    onclose();
  }}
  onkeydown={(event) => {
    if (event.key === "Escape") event.stopPropagation();
  }}
  onclick={(event) => {
    if (event.target === event.currentTarget) onclose();
  }}
>
  <div class="body">
    <header>
      <h2 id="snippets-title">{title}</h2>
      <button type="button" class="close" aria-label={t("close")} title={t("close")} onclick={onclose}>×</button>
    </header>

    {#if data === null}
      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="search"
        class="search"
        autofocus
        bind:this={search}
        bind:value={query}
        placeholder={t("snSearch")}
        aria-label={t("snSearch")}
        onkeydown={(event) => {
          if (event.key === "Enter" && visible[0]) {
            event.preventDefault();
            choose(visible[0].kinds[0]!);
          }
        }}
      />
      {#each visible as category (category.key)}
        <fieldset>
          <legend>{t(`snCat_${category.key}`)}</legend>
          <div class="cards">
            {#each category.kinds as kind (kind)}
              <button type="button" class="card" onclick={() => choose(kind)}><span class="icon" aria-hidden="true">{ICONS[kind]}</span><span>{name(kind)}</span></button>
            {/each}
          </div>
        </fieldset>
      {:else}
        <p class="hint muted">{t("snNoMatch")}</p>
      {/each}
    {:else}
      {#if fromPicker}
        <div><button type="button" onclick={back}>{t("snBack")}</button></div>
      {/if}
      <fieldset>
        <legend>{name(data.kind)}</legend>

        {#if data.kind === "heading-1" || data.kind === "heading-2" || data.kind === "heading-3" || data.kind === "heading-4"}
          <label class="field">{t("snHeadingText")}<input type="text" bind:value={data.text} placeholder={texts.heading} /></label>
        {:else if data.kind === "collapsible"}
          <label class="field">{t("snSummary")}<input type="text" bind:value={data.summary} /></label>
          <label class="field">{t("snBody")}<textarea rows="6" bind:value={data.body} placeholder={texts.collapsibleBody}></textarea></label>
        {:else if data.kind === "unordered-list" || data.kind === "ordered-list"}
          <label class="field">{t("snItems")}<textarea rows="10" class="mono" bind:value={data.items} placeholder={t("snItemsPlaceholder")}></textarea></label>
        {:else if data.kind === "table"}
          {@const table = data}
          <label class="field">
            {t("snTableStyle")}
            <select bind:value={table.style}>
              <option value="">{t("snStyleDefault")}</option>
              {#each TABLE_STYLES as style (style)}<option value={style}>{t(`snStyle_${style}`)}</option>{/each}
            </select>
          </label>
          <div class="checks">
            {#each TABLE_BORDERS as border (border)}
              <label class="check"><input type="checkbox" checked={table.border === border} onchange={(event) => (table.border = event.currentTarget.checked ? border : "")} /> {t(`snBorder_${border}`)}</label>
            {/each}
            <label class="check"><input type="checkbox" bind:checked={table.rounded} /> {t("snRounded")}</label>
            {#each TABLE_FILLS as fill (fill)}
              <label class="check"><input type="checkbox" checked={table.fill === fill} onchange={(event) => (table.fill = event.currentTarget.checked ? fill : "")} /> {t(`snFill_${fill}`)}</label>
            {/each}
          </div>
          <label class="field">
            {t("snTableColor")}
            <select bind:value={table.color}>
              <option value="">{t("snColorNone")}</option>
              {#each TABLE_COLORS as color (color)}<option value={color}>{t(`snColor_${color}`)}</option>{/each}
            </select>
          </label>
          <div class="document grid" bind:this={grid} role="group" aria-label={t("snGrid")}>
            <table
              class:table-style-compact={table.style === "compact"}
              class:table-style-intermediate={table.style === "intermediate"}
              class:table-fill-striped={table.fill === "striped"}
              class:table-fill-full={table.fill === "full"}
              class:table-border-bordered={table.border === "bordered"}
              class:table-border-soft-bordered={table.border === "soft-bordered"}
              class:table-rounded={table.rounded}
              class={table.color ? `table-color-${table.color}` : ""}
            >
              {#each [{ tag: "thead", from: 0, to: 1 }, { tag: "tbody", from: 1, to: table.rows.length }] as part (part.tag)}
                <svelte:element this={part.tag}>
                {#each table.rows.slice(part.from, part.to) as row, i (i)}
                  {@const r = part.from + i}
                  <tr>
                    {#each row as _cell, c (c)}
                      <svelte:element this={r === 0 ? "th" : "td"}>
                        <input
                          type="text"
                          data-cell="{r}-{c}"
                          aria-label={t("snCell", { row: r + 1, column: c + 1 })}
                          bind:value={table.rows[r]![c]}
                          onkeydown={(event) => cellKey(event, table, r, c)}
                          oncontextmenu={(event) => {
                            event.preventDefault();
                            menu = { x: event.clientX, y: event.clientY, row: r, column: c };
                          }}
                        />
                      </svelte:element>
                    {/each}
                  </tr>
                {/each}
                </svelte:element>
              {/each}
            </table>
          </div>
          <p class="hint muted">{t("snTableHint")}</p>
          {#if menu}
            <div class="menu" role="menu" tabindex="-1" style="left:{menu.x}px;top:{menu.y}px" onpointerdown={(event) => event.stopPropagation()}>
              <button type="button" role="menuitem" disabled={table.rows.length <= 1} onclick={() => deleteRow(table, menu!.row)}>{t("snDeleteRow")}</button>
              <button type="button" role="menuitem" disabled={table.rows[0]!.length <= 1} onclick={() => deleteColumn(table, menu!.column)}>{t("snDeleteColumn")}</button>
            </div>
          {/if}
        {:else if data.kind === "kanban"}
          {@const board = data}
          {#each board.columns as column, i (i)}
            <div class="row">
              <input type="text" aria-label={t("snColumnName")} bind:value={column.label} />
              <select aria-label={t("snColumnColor")} bind:value={column.color}>
                {#each KANBAN_COLORS as color (color)}<option value={color}>{t(`snKanban_${color}`)}</option>{/each}
              </select>
              <button type="button" disabled={board.columns.length <= 1} onclick={() => board.columns.splice(i, 1)}>{t("snRemoveColumn")}</button>
            </div>
          {/each}
          <div><button type="button" disabled={board.columns.length >= 6} onclick={() => board.columns.push({ label: "", color: KANBAN_COLORS[board.columns.length % 6]! })}>{t("snAddColumn")}</button></div>
          <p class="hint muted">{t("snKanbanHint")}</p>
        {:else if data.kind === "tree"}
          {@const tree = data}
          {#each tree.items as item, i (i)}
            <div class="row">
              <button type="button" aria-label={t("snOutdent")} title={t("snOutdent")} onclick={() => indent(tree, i, -1)}>←</button>
              <button type="button" aria-label={t("snIndent")} title={t("snIndent")} onclick={() => indent(tree, i, 1)}>→</button>
              <span class="depth" title={t("snDepth")}>{item.depth}</span>
              <input type="text" class="mono" aria-label={t("snItemName")} bind:value={item.name} style="margin-left:{item.depth * 1.2}rem" />
              <button type="button" aria-label={t("snRemove")} title={t("snRemove")} onclick={() => removeItem(tree, i)}>×</button>
            </div>
          {/each}
          <div><button type="button" onclick={() => tree.items.push({ name: "", depth: tree.items.at(-1)?.depth ?? 0 })}>{t("snAddItem")}</button></div>
          <p class="hint muted">{t("snTreeHint")}</p>
        {:else if data.kind === "code-block"}
          <label class="field">{t("snLanguage")}<input type="text" class="mono" bind:value={data.language} placeholder={t("snLanguageHint")} /></label>
          <label class="field">
            {t("snWidth")}
            <select bind:value={data.width}>
              <option value="">{t("snWidthDefault")}</option>
              {#each WIDTHS as width (width)}<option value={width}>{t(`snWidth_${width}`)}</option>{/each}
            </select>
          </label>
          <label class="field">
            {t("snAlign")}
            <select bind:value={data.align}>
              <option value="">{t("snAlignDefault")}</option>
              {#each ALIGNS as align (align)}<option value={align}>{t(`snAlign_${align}`)}</option>{/each}
            </select>
          </label>
          <label class="field">{t("snCode")}<textarea rows="12" class="mono" bind:value={data.code} placeholder={texts.code}></textarea></label>
          <p class="hint muted">{t("snCodeHint")}</p>
        {:else if data.kind === "compare"}
          <label class="field">{t("snCompareContent")}<textarea rows="8" class="mono" bind:value={data.content}></textarea></label>
        {:else if data.kind === "colored-text" || data.kind === "colored-section"}
          <div role="radiogroup" aria-label={t("snColor")} class="swatches">
            {#each SWATCH_KEYS as swatch (swatch)}
              <label><input type="radio" name="swatch" value={swatch} bind:group={data.color} /><span class="chip" style="background:{SWATCHES[swatch].bg};border-color:{SWATCHES[swatch].border}"></span> {t(`snColor_${swatch}`)}</label>
            {/each}
          </div>
          {#if data.kind === "colored-text"}
            <label class="field">{t("snText")}<input type="text" bind:value={data.text} placeholder={texts.coloredText} /></label>
          {:else}
            <label class="field">{t("snContent")}<textarea rows="4" bind:value={data.content} placeholder={texts.coloredSection}></textarea></label>
          {/if}
        {:else if data.kind === "blockquote"}
          <label class="field">
            {t("snQuoteType")}
            <select bind:value={data.type}>
              <option value="">{t("snQuoteNone")}</option>
              {#each QUOTE_TYPES as type (type)}<option value={type}>{t(`snQuote_${type}`)}</option>{/each}
            </select>
          </label>
          <label class="check"><input type="checkbox" bind:checked={data.icon} /> {t("snShowIcon")}</label>
          <label class="field">{t("snQuoteTitle")}<input type="text" bind:value={data.title} /></label>
          <label class="field">{t("snContent")}<textarea rows="6" bind:value={data.content} placeholder={texts.quote}></textarea></label>
        {:else if data.kind === "emojis"}
          {@const emojis = data}
          <label class="field">{t("snEmojiSelected")}<input type="text" bind:value={emojis.value} /></label>
          <div><button type="button" onclick={() => (emojis.value = "")}>{t("snEmojiClear")}</button></div>
          <input type="search" aria-label={t("snEmojiSearch")} placeholder={t("snEmojiSearch")} bind:value={emojiQuery} />
          <div class="emojis">
            {#each emojiGroups as group (group.key)}
              <h3>{t(`snEmoji_${group.key}`)}</h3>
              <div class="cards">
                {#each group.emojis as emoji (emoji.e)}
                  <button type="button" class="emoji" title={emoji.t} onclick={() => (emojis.value += emoji.e)}>{emoji.e}</button>
                {/each}
              </div>
            {:else}
              <p class="hint muted">{t("snEmojiNone")}</p>
            {/each}
          </div>
        {:else if data.kind === "link"}
          <label class="field">{t("snLinkText")}<input type="text" bind:value={data.text} placeholder={texts.linkText} /></label>
          <label class="field">{t("snUrl")}<input type="text" class="mono" bind:value={data.url} placeholder="https://…" /></label>
        {:else if data.kind === "doc-link"}
          {@const link = data}
          <label class="field">
            {t("snDocument")}
            <select
              value={link.path}
              onchange={(event) => {
                link.path = event.currentTarget.value;
                link.title = documents.find((each) => each.path === link.path)?.title ?? "";
              }}
            >
              <option value="">{t("snChoose")}</option>
              {#each documents as document (document.path)}<option value={document.path}>{document.title}</option>{/each}
            </select>
          </label>
          <label class="field">{t("snLinkText")} <span class="muted">{t("snTextOptional")}</span><input type="text" bind:value={link.text} placeholder={link.title} /></label>
        {:else if data.kind === "anchor-link"}
          {@const link = data}
          <label class="field">{t("snLinkText")}<input type="text" bind:value={link.text} placeholder={texts.anchorText} /></label>
          {#if headings.length > 0}
            <label class="field">
              {t("snAnchor")} <span class="muted">{t("snAnchorPick")}</span>
              <select bind:value={link.anchor}>
                <option value="">{t("snChoose")}</option>
                {#each headings as heading, i (i)}<option value={heading.id}>{indented(heading)}</option>{/each}
              </select>
            </label>
          {:else}
            <p class="hint muted">{t("snNoHeadings")}</p>
          {/if}
        {:else if data.kind === "anchor-doc-link"}
          {@const link = data}
          <label class="field">
            {t("snTargetDocument")}
            <select bind:value={link.path} onchange={() => (link.anchor = "")}>
              <option value="">{t("snChoose")}</option>
              {#each documents as document (document.path)}<option value={document.path}>{document.title}</option>{/each}
            </select>
          </label>
          <label class="field">{t("snLinkText")}<input type="text" bind:value={link.text} placeholder={texts.anchorText} /></label>
          {#if link.path !== ""}
            {#if remote.path === link.path && remote.headings === null}
              <p class="hint muted" role="status">{t("snLoading")}</p>
            {:else if remote.failed}
              <p class="invalid" role="alert">{t("snHeadingsFailed")}</p>
            {:else if remote.headings && remote.headings.length > 0}
              <label class="field">
                {t("snAnchor")}
                <select bind:value={link.anchor}>
                  <option value="">{t("snChoose")}</option>
                  {#each remote.headings as heading, i (i)}<option value={heading.id}>{indented(heading)}</option>{/each}
                </select>
              </label>
            {:else}
              <p class="hint muted">{t("snNoHeadings")}</p>
            {/if}
          {/if}
        {:else if data.kind === "columns"}
          {@const layout = data}
          {@const reopened = layout.body !== null}
          <label class="field">
            {t("snColumnsCount")}
            <select bind:value={layout.count} disabled={reopened}>
              {#each reopened ? [...new Set([...COLUMN_COUNTS, layout.count])].sort((a, b) => a - b) : COLUMN_COUNTS as count (count)}<option value={count}>{count}</option>{/each}
            </select>
          </label>
          {#if reopened}<p class="hint muted">{t("snColumnsKept")}</p>{/if}
          <label class="field">
            {t("snVAlign")}
            <select value={layout.verticalAlign === "center" ? "" : layout.verticalAlign} onchange={(event) => (layout.verticalAlign = event.currentTarget.value as typeof layout.verticalAlign)}>
              <option value="">{t("snVAlign_center")}</option>
              {#each VERTICAL_ALIGNS.filter((each) => each !== "center") as align (align)}<option value={align}>{t(`snVAlign_${align}`)}</option>{/each}
            </select>
          </label>
          <label class="field">
            {t("snTextAlign")}
            <select bind:value={layout.textAlign}>
              <option value="">{t("snTextAlignDefault")}</option>
              {#each TEXT_ALIGNS as align (align)}<option value={align}>{t(`snAlign_${align}`)}</option>{/each}
            </select>
          </label>
          <label class="field">
            {t("snGap")}
            <select value={layout.gap === "md" ? "" : layout.gap} onchange={(event) => (layout.gap = event.currentTarget.value as typeof layout.gap)}>
              <option value="">{t("snGap_md")}</option>
              {#each GAPS.filter((each) => each !== "md") as gap (gap)}<option value={gap}>{t(`snGap_${gap}`)}</option>{/each}
            </select>
          </label>
          <label class="field">{t("snRatio")}<input type="text" class="mono" bind:value={layout.ratio} placeholder={t("snRatioPlaceholder")} /></label>
          <p class="hint muted">{t("snLayoutHint")}</p>
        {:else if data.kind === "mermaid"}
          {@const chart = data}
          <label class="field">
            {t("snMermaidType")}
            <select bind:value={chart.chart}>
              {#each MERMAID_CHARTS as each (each)}<option value={each}>{t(`snMermaid_${each}`)}</option>{/each}
            </select>
          </label>
          {#if chart.chart === "pie"}
            <label class="field">{t("snMermaidTitle")}<input type="text" bind:value={chart.pieTitle} /></label>
            {#each chart.pie as row, i (i)}
              <div class="row">
                <input type="text" aria-label={t("snMmLabel", { n: i + 1 })} bind:value={row.label} />
                <input type="number" min="0" step="any" class="narrow" aria-label={t("snMmWeight", { n: i + 1 })} bind:value={row.value} />
                <button type="button" aria-label={t("snMmRemoveRow", { n: i + 1 })} title={t("snRemove")} disabled={chart.pie.length <= 1} onclick={() => chart.pie.splice(i, 1)}>×</button>
              </div>
            {/each}
            <div><button type="button" onclick={() => chart.pie.push({ label: "", value: 10 })}>{t("snMmAddItem")}</button></div>
          {:else if chart.chart === "timeline"}
            <label class="field">{t("snMermaidTitle")}<input type="text" bind:value={chart.timelineTitle} /></label>
            {#each chart.timeline as row, i (i)}
              <div class="row">
                <input type="text" class="narrow" aria-label={t("snMmPeriod", { n: i + 1 })} bind:value={row.period} />
                <input type="text" aria-label={t("snMmEvent", { n: i + 1 })} bind:value={row.event} />
                <button type="button" aria-label={t("snMmRemoveRow", { n: i + 1 })} title={t("snRemove")} disabled={chart.timeline.length <= 1} onclick={() => chart.timeline.splice(i, 1)}>×</button>
              </div>
            {/each}
            <div><button type="button" onclick={() => chart.timeline.push({ period: chart.timeline.at(-1)?.period ?? "", event: "" })}>{t("snMmAddEvent")}</button></div>
          {:else if chart.chart === "tree-view"}
            {#each chart.tree as row, i (i)}
              <div class="row">
                <input type="number" min="0" max={MAX_TREE_LEVEL} step="1" class="narrow" aria-label={t("snMmLevel", { n: i + 1 })} bind:value={row.level} />
                <input type="text" class="mono" aria-label={t("snMmNode", { n: i + 1 })} bind:value={row.label} />
                <input type="text" class="mono" aria-label={t("snMmDecorator", { n: i + 1 })} placeholder={t("snMmDecoratorPlaceholder")} bind:value={row.decorator} />
                <input type="text" aria-label={t("snMmNote", { n: i + 1 })} bind:value={row.note} />
                <button type="button" aria-label={t("snMmRemoveRow", { n: i + 1 })} title={t("snRemove")} disabled={chart.tree.length <= 1} onclick={() => chart.tree.splice(i, 1)}>×</button>
              </div>
            {/each}
            <div><button type="button" onclick={() => chart.tree.push({ level: Math.min(MAX_TREE_LEVEL, chart.tree.at(-1)?.level ?? 0), label: "", decorator: "", note: "" })}>{t("snMmAddNode")}</button></div>
          {:else}
            {#each chart.sequence as row, i (i)}
              <div class="row">
                {#if row.type === "message"}
                  <input type="text" aria-label={t("snMmFrom", { n: i + 1 })} bind:value={row.from} />
                  <select aria-label={t("snMmArrow", { n: i + 1 })} bind:value={row.arrow}>
                    {#each SEQUENCE_ARROWS as arrow (arrow)}<option value={arrow}>{arrow}</option>{/each}
                  </select>
                  <input type="text" aria-label={t("snMmTo", { n: i + 1 })} bind:value={row.to} />
                  <input type="text" aria-label={t("snMmMessage", { n: i + 1 })} bind:value={row.message} />
                {:else}
                  <select aria-label={t("snMmNotePosition", { n: i + 1 })} bind:value={row.position}>
                    {#each NOTE_POSITIONS as position (position)}<option value={position}>{t(`snMmPos_${position.split(" ")[0] as "left" | "right" | "over"}`)}</option>{/each}
                  </select>
                  <input type="text" aria-label={t("snMmParticipant", { n: i + 1 })} bind:value={row.participant} />
                  <input type="text" aria-label={t("snMmNoteText", { n: i + 1 })} bind:value={row.text} />
                {/if}
                <button type="button" aria-label={t("snMmRemoveRow", { n: i + 1 })} title={t("snRemove")} disabled={chart.sequence.length <= 1} onclick={() => chart.sequence.splice(i, 1)}>×</button>
              </div>
            {/each}
            <div class="actions">
              <button type="button" onclick={() => chart.sequence.push({ type: "message", from: "", arrow: "->>", to: "", message: "" })}>{t("snMmAddMessage")}</button>
              <button type="button" onclick={() => chart.sequence.push({ type: "note", position: "right of", participant: "", text: "" })}>{t("snMmAddNote")}</button>
            </div>
          {/if}
        {:else if data.kind === "attachment"}
          {@const attachment = data}
          {#if choosing}
            <p class="hint muted">{t("snAttachHelp")}</p>
            <p class="hint muted">{t("snAttachTip")}</p>
          {:else}
            <label class="field">{t("snAttachText")}<input type="text" bind:value={attachment.text} placeholder={texts.attachment} /></label>
            <label class="field">{t("snAttachTarget")}<input type="text" class="mono" bind:value={attachment.url} placeholder={texts.attachmentUrl} /></label>
          {/if}
        {:else if data.kind === "image"}
          <label class="field">
            {t("snWidth")}
            <select bind:value={data.width}>
              <option value="">{t("snWidthDefault")}</option>
              {#each WIDTHS as width (width)}<option value={width}>{t(`snWidth_${width}`)}</option>{/each}
            </select>
          </label>
          <label class="field">
            {t("snAlign")}
            <select bind:value={data.align}>
              <option value="">{t("snAlignDefault")}</option>
              {#each ALIGNS as align (align)}<option value={align}>{t(`snAlign_${align}`)}</option>{/each}
            </select>
          </label>
          <label class="field">{t("snImageAlt")}<input type="text" bind:value={data.alt} placeholder={texts.imageAlt} /></label>
          <label class="field">{t("snImageUrl")}<input type="text" class="mono" bind:value={data.url} placeholder={texts.imageUrl} /></label>
        {/if}
      </fieldset>

      {#if showsPreview(data.kind)}
        <fieldset>
          <legend>{t("snPreview")}</legend>
          <pre class="mono preview" role="region" aria-label={t("snPreview")}>{markdown}</pre>
        </fieldset>
      {/if}

      {#if failure}
        <div class="failure">
          <p class="invalid" role="alert">{failure.message}</p>
          <div class="actions">
            {#if failure.retry}<button type="button" disabled={busy} onclick={() => void (ondelete && mode === "edit" && lastWasDelete ? remove() : attached ? saveAttached() : submit())}>{t("snRetry")}</button>{/if}
            {#if failure.copy !== null}<button type="button" onclick={() => void copy()}>{t("snCopyMarkdown")}</button>{/if}
            {#if copied === "done"}<span class="muted" role="status">{t("snCopied")}</span>{/if}
            {#if copied === "failed"}<span class="invalid" role="alert">{t("snCopyFailed")}</span>{/if}
          </div>
        </div>
      {/if}

      {#if choosing}
        <input
          type="file"
          class="hidden"
          tabindex="-1"
          aria-hidden="true"
          bind:this={fileInput}
          onchange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void attach(file);
          }}
        />
      {/if}

      <div class="actions end">
        {#if mode === "edit" && ondelete}<button type="button" class="danger" disabled={busy} onclick={() => ((lastWasDelete = true), void remove())}>{t("snDelete")}</button>{/if}
        <button type="button" disabled={busy} onclick={onclose}>{t("snCancel")}</button>
        <button type="button" class="primary" disabled={busy} onclick={() => ((lastWasDelete = false), choosing ? (attached && failure ? void saveAttached() : fileInput?.click()) : void submit())}>{mode === "insert" ? t("snInsert") : t("snSave")}</button>
      </div>
    {/if}
  </div>
</dialog>

<style>
  /* The form look comes from .ld-form (base.css, docs/ui.md); only the dialog's own layout is here. */
  dialog {
    box-sizing: border-box;
    width: min(94vw, 40rem);
    max-height: 90vh;
    padding: 0;
    color: var(--ink);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.25);
  }
  /* A snippet's form (a table, a list…) takes 80% of the window; the picker keeps its narrow width. */
  dialog.wide {
    width: 80vw;
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.35);
  }
  .body {
    display: grid;
    gap: 0.6rem;
    padding: 0.8rem 1rem;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  h2 {
    margin: 0;
    font-size: 1.1em;
  }
  h3 {
    margin: 0.5rem 0 0.2rem;
    font-size: 0.85em;
    color: var(--muted);
  }
  .close {
    border: 0;
    background: transparent;
    font-size: 1.3em;
    line-height: 1;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
    gap: 0.4rem;
  }
  /* A light grey card, so that the choices stand out from the dialog's background (light and dark). */
  .card {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    text-align: left;
    background: color-mix(in srgb, var(--ink) 6%, var(--panel));
  }
  .card:hover {
    background: color-mix(in srgb, var(--ink) 11%, var(--panel));
  }
  .icon {
    min-width: 1.6em;
    text-align: center;
  }
  .emojis {
    max-height: 14rem;
    overflow: auto;
  }
  .emojis .cards {
    grid-template-columns: repeat(auto-fill, 2.2rem);
  }
  .emoji {
    padding: 0.2em;
    font-size: 1.2em;
    line-height: 1.2;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .row input {
    flex: 1;
    min-width: 0;
  }
  .narrow {
    flex: 0 0 6rem;
  }
  .hidden {
    display: none;
  }
  .depth {
    min-width: 1.2em;
    text-align: center;
    color: var(--muted);
  }
  .swatches {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
    gap: 0.3rem;
  }
  .chip {
    width: 1rem;
    height: 1rem;
    border: 2px solid;
    border-radius: 4px;
  }
  .grid {
    overflow: auto;
    max-height: 18rem;
  }
  .grid table {
    margin: 0;
  }
  .grid :is(th, td) {
    cursor: text;
  }
  /* The inputs take the look of the cell they sit in: the Document's styles decide the rest. */
  .grid input {
    display: block;
    width: 100%;
    min-width: 6rem;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    outline-offset: 2px;
  }
  .grid input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .checks {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
  }
  .menu {
    position: fixed;
    z-index: 30;
    display: grid;
    padding: 0.25rem;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.25);
  }
  .menu button {
    border: 0;
    text-align: left;
  }
  .preview {
    margin: 0;
    padding: 0.5rem;
    overflow: auto;
    max-height: 12rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 6px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .actions.end {
    justify-content: flex-end;
  }
  .danger {
    margin-right: auto;
    color: light-dark(#c0392b, #f87171);
    border-color: light-dark(#c0392b, #f87171);
  }
</style>
