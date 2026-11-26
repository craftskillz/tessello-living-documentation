// What the snippet dialog and its callers share: its failure shape, the translated default texts, and how a snippet's Markdown
// is set into an editor's text (blank lines around a block).

import { t } from "../lib/i18n.ts";
import type { SnippetKind, SnippetTexts } from "../lib/snippets.ts";

/** A failure the dialog shows inside itself: the form stays as typed. */
export interface SnippetFailure {
  message: string;
  /** Markdown the User can copy ("Copy Markdown"); null: none. */
  copy: string | null;
  /** Whether Retry is offered. */
  retry: boolean;
}

export interface Heading {
  depth: number;
  text: string;
  id: string;
}

/** Every default and fallback text of the snippets, in the interface language. */
export function snippetTexts(): SnippetTexts {
  return {
    heading: t("snDef_heading"),
    collapsibleSummary: t("snDef_collapsibleSummary"),
    collapsibleBody: t("snDef_collapsibleBody"),
    item: t("snDef_item"),
    subItem: t("snDef_subItem"),
    subSubItem: t("snDef_subSubItem"),
    tableHeader: t("snDef_tableHeader"),
    treeFolder: t("snDef_treeFolder"),
    treeFile: t("snDef_treeFile"),
    treeEmpty: t("snDef_treeEmpty"),
    code: t("snDef_code"),
    quote: t("snDef_quote"),
    quoteAuthor: t("snDef_quoteAuthor"),
    imageAlt: t("snDef_imageAlt"),
    imageUrl: t("snDef_imageUrl"),
    linkText: t("snDef_linkText"),
    anchorText: t("snDef_anchorText"),
    anchor: t("snDef_anchor"),
    coloredText: t("snDef_coloredText"),
    coloredSection: t("snDef_coloredSection"),
    kanbanColumns: [t("snDef_todo"), t("snDef_doing"), t("snDef_done")],
  };
}

const INLINE_KINDS: ReadonlySet<SnippetKind> = new Set(["colored-text", "emojis", "link", "doc-link", "anchor-link", "anchor-doc-link"]);

/** Whether a snippet of `kind` is a block (its own paragraph) rather than text inside a line. */
export const isBlock = (kind: SnippetKind): boolean => !INLINE_KINDS.has(kind);

/**
 * The newlines a block snippet needs before and after it so that a blank line separates it from the text around it
 * (so `---` under a paragraph never makes a heading); none while the caret already sits on a blank line.
 */
export function blankLines(before: string, after: string): { lead: string; trail: string } {
  const lead = before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const trail = after === "" ? "\n" : after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  return { lead, trail };
}
