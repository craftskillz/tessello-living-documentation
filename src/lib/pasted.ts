// Names and links for an image or file pasted or dropped into a Document (GLOSSARY: Image, Link). Pure: the Host
// writes the bytes, this decides what they are called and what the Document says about them.

/** True for a MIME type that is an image. */
export function isImage(file: { type: string }): boolean {
  return file.type.startsWith("image/");
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "image/bmp": "bmp",
};

/** The extension (no dot) a pasted or dropped image is saved with: from its type, else from its file name, else png. */
export function imageExtension(type: string, fileName: string): string {
  return IMAGE_EXTENSIONS[type] ?? /[^.]\.([^.]+)$/.exec(fileName)?.[1]?.toLowerCase() ?? "png";
}

/** The proposed name of a pasted image: the local time as `YYYY-MM-DD_HH-mm-ss`. */
export function timestampName(date: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
  return `${day}_${two(date.getHours())}-${two(date.getMinutes())}-${two(date.getSeconds())}`;
}

/** `base` when `<base>.<extension>` is not among the file names `taken` (case ignored), else `<base>-2`, `-3`, … the first free one. */
export function freeName(base: string, extension: string, taken: string[]): string {
  const used = new Set(taken.map((name) => name.toLowerCase()));
  const exists = (name: string) => used.has((extension === "" ? name : `${name}.${extension}`).toLowerCase());
  if (!exists(base)) return base;
  let n = 2;
  while (exists(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** A file name split at its last dot; a leading or trailing dot does not make an extension. */
export function splitName(fileName: string): { base: string; extension: string } {
  const match = /^(.+)\.([^.]+)$/.exec(fileName);
  return match ? { base: match[1]!, extension: match[2]! } : { base: fileName, extension: "" };
}

/** A dropped file's name made acceptable to the naming rule: refused characters become `_`, edge spaces and dots go. */
export function cleanFileName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "_").replace(/^[ .]+|[ .]+$/g, "") || "file";
}

/** A path segment as written in a link destination: spaces, parentheses and percent signs escaped. */
const encodeSegment = (segment: string) =>
  segment.replace(/%/g, "%25").replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");

/**
 * The Markdown inserted in the Document at `documentPath` for the Image or Attachment at `savedPath` (both Project paths):
 * an image, or a paperclip link for any other file. The destination is relative to the Document's folder.
 */
export function pastedLink(documentPath: string, savedPath: string, kind: "image" | "file", label: string): string {
  const from = documentPath.split("/").slice(0, -1);
  const to = savedPath.split("/");
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++;
  const relative = [...from.slice(common).map(() => ".."), ...to.slice(common).map(encodeSegment)].join("/");
  const text = label.replace(/[[\]\\]/g, "\\$&");
  return kind === "image" ? `![${text}](${relative})` : `[📎 ${text}](${relative})`;
}
