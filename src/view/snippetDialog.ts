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
    column: t("snDef_column"),
    card: t("snDef_card"),
    attachment: t("snDef_attachment"),
    attachmentUrl: t("snDef_attachmentUrl"),
    mermaidItem: t("snDef_mermaidItem"),
    mermaidPeriod: t("snDef_mermaidPeriod"),
    mermaidEvent: t("snDef_mermaidEvent"),
    mermaidNode: t("snDef_mermaidNode"),
    mermaidParticipant: t("snDef_mermaidParticipant"),
    mermaidMessage: t("snDef_mermaidMessage"),
    mermaid: {
      pieTitle: t("snDef_mmPieTitle"),
      pie: [{ label: t("snDef_mmPie1"), value: 50 }, { label: t("snDef_mmPie2"), value: 30 }, { label: t("snDef_mmPie3"), value: 20 }],
      timelineTitle: t("snDef_mmTimelineTitle"),
      timeline: [
        { period: "2023", event: t("snDef_mmTl1") },
        { period: "2024", event: t("snDef_mmTl2") },
        { period: "2024", event: t("snDef_mmTl3") },
        { period: "2025", event: t("snDef_mmTl4") },
        { period: "2026", event: t("snDef_mmTl5") },
      ],
      tree: [
        { level: 0, label: "knowledge-workspace/", decorator: "", note: "" },
        { level: 1, label: "documents/", decorator: "", note: "" },
        { level: 2, label: "getting-started.md", decorator: "", note: t("snDef_mmTreeNote1") },
        { level: 2, label: "operations.md", decorator: "", note: "" },
        { level: 1, label: "diagrams/", decorator: "", note: "" },
        { level: 1, label: "automation.json", decorator: "", note: t("snDef_mmTreeNote2") },
      ],
      sequence: [
        { type: "message", from: t("snDef_mmAuthor"), arrow: "->>", to: t("snDef_mmReviewer"), message: t("snDef_mmSeq1") },
        { type: "message", from: t("snDef_mmReviewer"), arrow: "-->>", to: t("snDef_mmAuthor"), message: t("snDef_mmSeq2") },
        { type: "note", position: "right of", participant: t("snDef_mmReviewer"), text: t("snDef_mmSeq3") },
        { type: "message", from: t("snDef_mmAuthor"), arrow: "->>", to: t("snDef_mmReviewer"), message: t("snDef_mmSeq4") },
        { type: "message", from: t("snDef_mmReviewer"), arrow: "->>", to: t("snDef_mmPublisher"), message: t("snDef_mmSeq5") },
        { type: "message", from: t("snDef_mmPublisher"), arrow: "->>", to: t("snDef_mmAuthor"), message: t("snDef_mmSeq6") },
        { type: "message", from: t("snDef_mmPublisher"), arrow: "-->>", to: t("snDef_mmReviewer"), message: t("snDef_mmSeq7") },
      ],
    },
  };
}

const INLINE_KINDS: ReadonlySet<SnippetKind> = new Set(["colored-text", "emojis", "link", "doc-link", "anchor-link", "anchor-doc-link", "attachment"]);

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
