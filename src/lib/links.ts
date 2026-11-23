// Where a Document's links and images point (GLOSSARY: Link, Image). Pure: hrefs are never followed here, because the
// View is an about:srcdoc page and an address that resolves would navigate it away.

export type LinkTarget =
  | { kind: "document"; path: string; anchor: string | null }
  | { kind: "anchor"; anchor: string }
  | { kind: "external"; url: string }
  | { kind: "file"; path: string }
  | { kind: "none" };

export type ImageTarget = { kind: "project"; path: string } | { kind: "external"; url: string } | { kind: "none" };

/** Resolves `href`, written in the Document at path `from`, to what it points at. */
export function resolveLink(from: string, href: string): LinkTarget {
  const doc = /[?&]doc=([^&#]*)/.exec(href);
  if (doc) return { kind: "document", path: decode(doc[1]!) + ".md", anchor: anchorOf(href) };
  const written = href.trim();
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(written)?.[1]?.toLowerCase();
  if (scheme) return scheme === "http" || scheme === "https" || scheme === "mailto" ? { kind: "external", url: written } : { kind: "none" };
  const [target, hash] = split(written);
  if (target === "") return hash === "" ? { kind: "none" } : { kind: "anchor", anchor: hash };
  const path = projectPath(from, target);
  if (path === null || path === "") return { kind: "none" };
  return /\.md$/i.test(path) ? { kind: "document", path, anchor: hash === "" ? null : hash } : { kind: "file", path };
}

/** Resolves `src`, written in the Document at path `from`, to the image it names. */
export function resolveImage(from: string, src: string): ImageTarget {
  const written = src.trim();
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(written)?.[1]?.toLowerCase();
  if (scheme) return scheme === "http" || scheme === "https" || scheme === "data" ? { kind: "external", url: written } : { kind: "none" };
  const path = projectPath(from, split(written)[0]);
  return path === null || path === "" ? { kind: "none" } : { kind: "project", path };
}

/** The id of a heading, as the original computed it (accents are dropped, so existing `#anchor` links keep working). */
export function headingId(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
}

const decode = (text: string) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

function split(href: string): [string, string] {
  const hash = href.indexOf("#");
  return hash < 0 ? [href, ""] : [href.slice(0, hash), decode(href.slice(hash + 1))];
}

const anchorOf = (href: string) => split(href)[1] || null;

/** The Project path of a relative reference, `.` and `..` dropped; null when it climbs above the root. */
function projectPath(from: string, reference: string): string | null {
  const segments = reference.startsWith("/") ? [] : from.split("/").slice(0, -1);
  for (const each of reference.split("/")) {
    if (each === "" || each === ".") continue;
    if (each === "..") {
      if (segments.length === 0) return null;
      segments.pop();
    } else segments.push(decode(each));
  }
  return segments.join("/");
}
