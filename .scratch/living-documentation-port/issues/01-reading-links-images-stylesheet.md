# 01: Reading: links, images and the document stylesheet

**What to build:** Reading an existing Living Documentation folder looks right for ordinary Markdown: a relative link to another Document (or the original's `?doc=<id>` link) opens it in the View, scrolled to its `#anchor`, with a back trail; external links open in a new tab; a link to a missing Document shows a message. Project Images show from the folder itself (read through the Host, shown from their bytes); a missing one shows its alt text and a mark. A stylesheet in the look of the original, light and dark from the Host theme. Every rendered block carries its source range for later tickets.

**Blocked by:** None (can start immediately)

**Status:** done (66157fd)

- [x] Relative `.md` links and `?doc=<id>` links open the target in the View, with `#anchor` scrolled to; Back returns
- [x] External `http(s)` links open in a new tab; nothing navigates the View
- [x] A link to a missing Document shows a message
- [x] Images of the Project show; a missing Image shows its alt text and a missing mark; object URLs are released when the Document changes
- [x] Headings, paragraphs, lists, quotes, code, tables, images and rules styled like the original, light and dark
- [x] Every rendered block carries its source range
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [x] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder) on an old Living Documentation folder; differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

## Comments

- **Built** (2026-11-23):
  - `src/lib/links.ts` resolves links and images.
  - `renderDocument` (`src/lib/render.ts`) gives every block `data-src="from-to"`, as offsets into the full text, and gives headings the original's ids. Internal links carry `data-doc` / `data-anchor` / `data-file` and no `href`. Project images carry `data-image` and no `src`.
  - `project.readImage` reads image bytes, and a `NotFound` error is raised for missing files.
  - `src/lib/images.ts` loads images from object URLs, released on every re-render.
  - `src/lib/document.css` is the stylesheet, light and dark through `data-mode` from the Host theme.
  - In the View: link clicks, the back trail and anchor scrolling.
  - Tests: 59 unit, 23 browser; `tessello validate` passes.
- **Trial in the local Host** (2026-11-23, an old Living Documentation folder): images, look (light and dark), address, relative / nested / `../` / `?doc=` links, anchors, same-Document anchors, external and `mailto:` links all work.
  - One difference found and fixed (66157fd): the missing-Document message showed at the top of the page, out of view when the reader had scrolled down. Failures are now a toast at the bottom right (Sonner-like), kept until closed or the next navigation. It sits outside the layout, so failures on the welcome and reconnect screens show too; before, they were silent.
- **Decisions where the spec is silent:**
  - Opening a Document from the Tree (or from the Host's params) clears the back trail.
  - Back reopens the Document at its top.
  - A link to the open Document only scrolls.
  - `mailto:` links are external like `http(s)`.
  - `data:` images are shown as they are.
  - Any href containing `?doc=`, even an absolute URL, opens a Document, as in the original.
  - A `..` that climbs above the Project folder leaves the link as plain text.
- **Differs from the original:**
  - A link to another file of the Project (not `.md`) shows "not available yet". Opening other files comes with ticket 10.
  - Failures show a translated message, with the raw reason as a detail only.
  - The stylesheet is hand-written in the look of Tailwind Typography's `prose` with the original's table rules, not Tailwind itself.
- **Test Host bug** (sibling `tessello`, `packages/sdk/src/testing.ts:245`): replies go through `JSON.stringify`, so `files.read(..., { as: "bytes" })` arrives as `{"0":137,…}`. `project.readImage` normalizes this. Remove the workaround once the Test Host keeps `Uint8Array`.
- `Tree.svelte`'s `.document` class was renamed `.entry` to stay clear of the document stylesheet.
