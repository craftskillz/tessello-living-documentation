// Copying from the article to the clipboard: an image as a PNG, a table as clean HTML and tab-separated text
// (ported from the original's copyTable.ts and image copy).

const TABLE_STYLE = "border-collapse:collapse";
const CELL_STYLE = "border:1px solid #000000;padding:4px 8px";
const INLINE_TAGS = new Set(["A", "B", "BR", "CODE", "DEL", "EM", "I", "S", "STRONG", "SUB", "SUP", "U"]);
/** Tag markers and footnote references (links here carry `data-anchor`, not an `href`) stay out of a copy. */
const EXCLUDED = ".ld-tag-marker, sup:has(> a[data-footnote-ref]), a[data-footnote-ref]";

function appendCleanContent(source: Node, target: Node): void {
  for (const child of source.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      target.appendChild(child.cloneNode());
    } else if (child instanceof Element && !child.matches(EXCLUDED)) {
      if (child instanceof HTMLImageElement) {
        target.appendChild(document.createTextNode(child.alt));
      } else if (INLINE_TAGS.has(child.tagName)) {
        const element = document.createElement(child.tagName);
        // Only external links have an `href`; the others are data attributes and are not written.
        if (child instanceof HTMLAnchorElement && child.getAttribute("href")) element.setAttribute("href", child.href);
        if (child.tagName === "CODE") element.style.fontFamily = "monospace";
        appendCleanContent(child, element);
        target.appendChild(element);
      } else {
        appendCleanContent(child, target);
      }
    }
  }
}

function cleanCell(cell: HTMLTableCellElement): HTMLTableCellElement {
  const clean = document.createElement(cell.tagName.toLowerCase()) as HTMLTableCellElement;
  clean.style.cssText = CELL_STYLE;
  if (cell.tagName === "TH") clean.style.fontWeight = "bold";
  const align = cell.style.textAlign || cell.getAttribute("align");
  if (align) clean.style.textAlign = align;
  if (cell.colSpan > 1) clean.colSpan = cell.colSpan;
  if (cell.rowSpan > 1) clean.rowSpan = cell.rowSpan;
  appendCleanContent(cell, clean);
  return clean;
}

function cellText(cell: HTMLTableCellElement): string {
  const copy = cell.cloneNode(true) as HTMLTableCellElement;
  copy.querySelectorAll(EXCLUDED).forEach((each) => each.remove());
  copy.querySelectorAll("br").forEach((br) => br.replaceWith(" "));
  return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Writes the table as `text/html` (a minimal clean table) and `text/plain` (tab-separated rows) in one clipboard item. */
export function copyTable(table: HTMLTableElement): Promise<void> {
  const clean = document.createElement("table");
  clean.style.cssText = TABLE_STYLE;
  const lines: string[] = [];
  for (const section of [table.tHead, ...table.tBodies, table.tFoot]) {
    if (!section) continue;
    const target = clean.appendChild(document.createElement(section.tagName.toLowerCase()));
    for (const row of section.rows) {
      const cleanRow = target.appendChild(document.createElement("tr"));
      const cells = [...row.cells];
      for (const cell of cells) cleanRow.appendChild(cleanCell(cell));
      lines.push(cells.map(cellText).join("\t"));
    }
  }
  return navigator.clipboard.write([
    new ClipboardItem({
      "text/html": new Blob([clean.outerHTML], { type: "text/html" }),
      "text/plain": new Blob([lines.join("\n")], { type: "text/plain" }),
    }),
  ]);
}

/**
 * Writes the image as a PNG, at its displayed size times the device pixel ratio, on a white background. The clipboard
 * item gets the promise of the blob, so the write starts within the click; images are object URLs: the canvas is not tainted.
 */
export function copyImage(image: HTMLImageElement): Promise<void> {
  const blob = new Promise<Blob>((resolve, reject) => {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round((image.clientWidth || image.naturalWidth) * ratio);
    const height = Math.round((image.clientHeight || image.naturalHeight) * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context || width === 0 || height === 0) return reject(new Error("The image is not loaded"));
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    canvas.toBlob((png) => (png ? resolve(png) : reject(new Error("The image could not be encoded"))), "image/png");
  });
  return navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
