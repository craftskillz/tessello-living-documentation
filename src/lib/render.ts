// A Document's body as HTML (docs/design.md §5), first version: CommonMark and GitHub tables, task lists and
// strikethrough. Raw HTML in the Document is left out; directives, Tag markers and source positions come later.

import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeStringify);

export function renderMarkdown(body: string): string {
  return String(processor.processSync(body));
}
