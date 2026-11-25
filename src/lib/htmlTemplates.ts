// The built-in HTML templates (rule R1, docs/spec/html-generation.md): fixed, two folders, no custom templates in v1.

import { ARTICLE_CSS } from "./htmlTemplates/article.ts";
import { INTERVIEW_SHEET_CSS } from "./htmlTemplates/interviewSheet.ts";

export type HtmlTemplateId = "interview-sheet" | "article";

export interface HtmlTemplate {
  id: HtmlTemplateId;
  folder: "interviews" | "articles";
  /** The template's whole stylesheet: custom properties and body rules on `.ld-html-page`, no `:root`, `html` or `body`. */
  css: string;
}

/** In the dialog's order: interviews › interview-sheet, then articles › article. */
export const HTML_TEMPLATES: readonly HtmlTemplate[] = [
  { id: "interview-sheet", folder: "interviews", css: INTERVIEW_SHEET_CSS },
  { id: "article", folder: "articles", css: ARTICLE_CSS },
];

/** The template named by an `html_template` value; null for null or an unknown value. */
export function htmlTemplateOf(id: string | null): HtmlTemplate | null {
  return HTML_TEMPLATES.find((template) => template.id === id) ?? null;
}
