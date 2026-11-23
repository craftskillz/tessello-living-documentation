// The Images of a rendered Document: the renderer leaves a Project image without `src`; the View reads its bytes through
// the Host and shows them from an object URL (GLOSSARY: Image).

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
};

/** The MIME type of an image file, from its extension; a generic one when unknown. */
export function mimeOf(path: string): string {
  return MIME[/\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

/**
 * Fills the `img[data-image]` of `root`. Each path is read once; an image that cannot be read becomes the renderer's
 * missing-image markup, titled by `missingTitle`. The returned function stops the work and revokes every object URL.
 */
export function loadImages(root: HTMLElement, read: (path: string) => Promise<Uint8Array>, missingTitle: (path: string) => string): () => void {
  let stopped = false;
  const urls: string[] = [];
  const images = [...root.querySelectorAll<HTMLImageElement>("img[data-image]")];
  const reads = new Map<string, Promise<string | null>>();
  for (const image of images) {
    const path = image.dataset.image!;
    if (!reads.has(path)) {
      reads.set(
        path,
        read(path).then(
          (bytes) => {
            if (stopped) return null;
            const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeOf(path) }));
            urls.push(url);
            return url;
          },
          () => null,
        ),
      );
    }
    void reads.get(path)!.then((url) => {
      if (stopped) return;
      if (url) image.src = url;
      else image.replaceWith(missing(image.alt, missingTitle(path)));
    });
  }
  return () => {
    stopped = true;
    for (const url of urls.splice(0)) URL.revokeObjectURL(url);
  };
}

function missing(alt: string, title: string): HTMLElement {
  const span = document.createElement("span");
  span.className = "image-missing";
  span.setAttribute("role", "img");
  span.setAttribute("aria-label", alt);
  span.title = title;
  span.textContent = alt;
  return span;
}
