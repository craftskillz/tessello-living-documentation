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

/** Maps an old Project path (POSIX, relative to the Project folder) to its new path; null when it does not move. */
export type PathMapper = (oldPath: string) => string | null;

/** The mapper of the entry `from` → `to` and, for a Folder, of every path below it. */
export function entryMapper(from: string, to: string, isFolder: boolean): PathMapper {
  return (oldPath) => (oldPath === from || (isFolder && oldPath.startsWith(`${from}/`)) ? to + oldPath.slice(from.length) : null);
}

/**
 * The Markdown `text` of the file that was at `fileOldPath` (and is now at `map(fileOldPath) ?? fileOldPath`) with its
 * links rewritten; byte for byte `text` when nothing changes.
 */
export function rewriteLinks(text: string, fileOldPath: string, map: PathMapper): string {
  const fileNewPath = map(fileOldPath) ?? fileOldPath;
  const rewrite = (target: string) => rewriteTarget(target, fileOldPath, fileNewPath, map);
  return editOutsideFences(text, (line) =>
    line
      .replace(/(\]\()([^)\s]+)/g, (_m, open: string, target: string) => open + rewrite(target))
      .replace(/^(\s{0,3}\[[^\]]+\]:\s*)(\S+)/, (_m, open: string, target: string) => open + rewrite(target)),
  );
}

const dirOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")).split("/") : []);

/** The segments of `base` followed by the (decoded) `reference`, `.` and `..` applied; null when it climbs above the root. */
function resolveFrom(base: string[], reference: string): string[] | null {
  const out: string[] = [];
  for (const each of [...base, ...reference.split("/").map(decode)]) {
    if (each === "" || each === ".") continue;
    if (each === "..") {
      if (out.length === 0) return null;
      out.pop();
    } else out.push(each);
  }
  return out;
}

/** Encodes a segment like `like`: percent-encoded if it was, spaces always. */
const encodeSegment = (name: string, like: string) => (like.includes("%") ? encodeURIComponent(name) : name.replace(/ /g, "%20"));

/** The relative path from the folder `fromDir` to `to` (both as segments); "" when they are the same. */
function relativePath(fromDir: string[], to: string[]): string {
  let common = 0;
  while (common < fromDir.length && common < to.length && fromDir[common] === to[common]) common++;
  return [...fromDir.slice(common).map(() => ".."), ...to.slice(common)].join("/");
}

/**
 * One link target written in the file that was at `fileOldPath` and is now at `fileNewPath`. A target that still
 * resolves to the same entry is kept as written; else renamed segments are replaced in place (keeping `.`, `..` and the
 * encoding); only when that is not enough is the path recomputed from the new location.
 */
function rewriteTarget(target: string, fileOldPath: string, fileNewPath: string, map: PathMapper): string {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(target)) return target;

  const doc = /([?&]doc=)([^&#]+)/.exec(target);
  if (doc) {
    const next = map(`${decode(decode(doc[2]!))}.md`);
    if (next === null) return target;
    return target.replace(doc[0], doc[1]! + encodeURIComponent(encodeURIComponent(next.slice(0, -3))));
  }

  const cut = target.search(/[?#]/);
  const pathPart = cut === -1 ? target : target.slice(0, cut);
  const suffix = target.slice(pathPart.length);
  if (!pathPart) return target;
  const absolute = pathPart.startsWith("/");
  const oldBase = absolute ? [] : dirOf(fileOldPath);
  const newBase = absolute ? [] : dirOf(fileNewPath);
  const oldTarget = resolveFrom(oldBase, pathPart)?.join("/");
  if (oldTarget === undefined) return target;
  const newTarget = map(oldTarget) ?? oldTarget;
  if (resolveFrom(newBase, pathPart)?.join("/") === newTarget) return target;

  let base = oldBase;
  const renamed = pathPart
    .split("/")
    .map((segment, i) => {
      if (i === 0 && absolute) return segment;
      const resolved = resolveFrom(base, decode(segment));
      if (resolved === null) return segment;
      base = resolved;
      if (segment === "" || segment === "." || segment === "..") return segment;
      const name = map(resolved.join("/"))?.split("/").at(-1);
      return name === undefined || name === resolved.at(-1) ? segment : encodeSegment(name, segment);
    })
    .join("/");
  if (resolveFrom(newBase, renamed)?.join("/") === newTarget) return renamed + suffix;

  const encode = (path: string) => path.split("/").map((segment) => (segment === ".." ? segment : encodeSegment(segment, pathPart))).join("/");
  const trailing = pathPart.endsWith("/") ? "/" : "";
  if (absolute) return `/${encode(newTarget)}${trailing}${suffix}`;
  let relative = encode(relativePath(newBase, newTarget.split("/").filter(Boolean)) || ".");
  if (pathPart.startsWith("./") && !relative.startsWith("..")) relative = `./${relative}`;
  return relative + trailing + suffix;
}

/** Applies `edit` to every line outside fenced code (``` or ~~~). */
function editOutsideFences(text: string, edit: (line: string) => string): string {
  let fence: string | null = null;
  return text
    .split("\n")
    .map((line) => {
      const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
      if (marker) {
        if (fence === null) fence = marker[1]![0]!;
        else if (marker[1]![0] === fence) fence = null;
        return line;
      }
      return fence === null ? edit(line) : line;
    })
    .join("\n");
}
