// The label filter: a pattern and a replacement that rewrite the labels the Tree shows.

/** A Project's label filter, as kept: empty pattern = no filter. */
export interface LabelFilter {
  pattern: string;
  replacement: string;
}

export const NO_LABEL_FILTER: LabelFilter = { pattern: "", replacement: "" };

/** The filter ready to use, or why its pattern is refused. */
export type CompiledLabelFilter =
  | { ok: true; apply: (label: string) => string }
  | { ok: false };

/** Compile a filter. Every match is replaced; a blank result shows the original label. */
export function compileLabelFilter(filter: LabelFilter): CompiledLabelFilter {
  if (filter.pattern === "") return { ok: true, apply: (label) => label };
  let regex: RegExp;
  try {
    regex = new RegExp(filter.pattern, "g");
  } catch {
    return { ok: false };
  }
  const { replacement } = filter;
  return {
    ok: true,
    apply: (label) => {
      // Replacing through the string keeps each call independent of `lastIndex`.
      const result = label.replace(regex, replacement);
      return result.trim() === "" ? label : result;
    },
  };
}
