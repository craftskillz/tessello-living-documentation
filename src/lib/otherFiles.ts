// The files of a Project that are not Documents: which are images, and how the others are shown when hidden items are
// shown. Pure: the bytes are read elsewhere.

/** A text longer than this is shown cut here (1 MB). */
export const MAX_TEXT_BYTES = 1024 * 1024;

/** A text file up to this size (256 KiB) offers Versions; a larger one would be slow to compare. */
export const MAX_VERSIONED_BYTES = 256 * 1024;

export type FilePreview =
  | { kind: "image"; mime: string }
  | { kind: "video"; mime: string }
  | { kind: "text"; text: string; truncated: boolean }
  | { kind: "binary" };

const IMAGES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  bmp: "image/bmp",
  avif: "image/avif",
};

const VIDEOS: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  ogv: "video/ogg",
};

/** Formats that are never text, whatever their first bytes look like. */
const BINARY = new Set(
  "pdf doc docx xls xlsx ppt pptx odt ods odp rtf pages numbers key zip gz tgz tar 7z rar bz2 xz mp3 wav flac ogg m4a".split(" "),
);

const extensionOf = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";

/** Whether the file named `name` is an image, by extension. */
export const isImageName = (name: string) => extensionOf(name) in IMAGES;

/** How the file named `name` holding `bytes` is shown. */
export function previewOf(name: string, bytes: Uint8Array): FilePreview {
  const extension = extensionOf(name);
  if (extension in IMAGES) return { kind: "image", mime: IMAGES[extension]! };
  if (extension in VIDEOS) return { kind: "video", mime: VIDEOS[extension]! };
  if (BINARY.has(extension) || bytes.subarray(0, 8000).includes(0)) return { kind: "binary" };
  const truncated = bytes.length > MAX_TEXT_BYTES;
  // A cut inside a character leaves a replacement character at the end: drop it.
  const text = new TextDecoder().decode(truncated ? bytes.subarray(0, MAX_TEXT_BYTES) : bytes);
  return { kind: "text", text: truncated ? text.replace(/�$/, "") : text, truncated };
}

/** Whether an other file of `size` bytes shown as `preview` offers Versions: a text file, not too large. */
export const hasVersions = (preview: FilePreview, size: number) => preview.kind === "text" && size <= MAX_VERSIONED_BYTES;
