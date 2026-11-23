// Which lines of the Markdown file a block comes from, for the header's Lines toggle.

/** The 1-based file lines covered by these source ranges (offsets in `text`, `to` exclusive): "7", or "7-9"; null when there is no range. */
export function lineLabel(text: string, ranges: Array<[from: number, to: number]>): string | null {
  if (ranges.length === 0) return null;
  const from = Math.min(...ranges.map(([start]) => start));
  const to = Math.max(...ranges.map(([, end]) => end));
  const first = lineAt(text, from);
  const last = lineAt(text, Math.max(from, to - 1));
  return first === last ? `${first}` : `${first}-${last}`;
}

/** The 1-based line holding the character at `offset`: one more than the line feeds before it. */
function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let at = text.indexOf("\n"); at !== -1 && at < offset; at = text.indexOf("\n", at + 1)) line++;
  return line;
}
