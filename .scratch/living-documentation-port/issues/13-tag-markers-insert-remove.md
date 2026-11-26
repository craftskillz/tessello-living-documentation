# 13: Tag markers: insert and remove

**What to build:** In the reading view I insert a Tag marker at the clicked spot (located by the block's source range and offset; allowed in table cells; refused in code, diagrams, compare blocks and Kanban boards) and remove one; writes are version-checked and retried once at the same spot when its text is unchanged, else "This passage changed on disk; try again". Suggestions come from Project settings › Tag names and markers already used; invalid Tag names are named in an error and block saving the settings (brackets removed, lower case, duplicates removed, order kept).

**Blocked by:** 03 (Reading: Mermaid, Kanban blocks and Tag marker pills), 12 (Projects and Project settings)

**Status:** done (85011a9, ed3758a)

- [x] Insert and Remove at the clicked spot through source ranges
- [x] Refused where the spec refuses
- [x] Conflict retried once, else the message
- [x] Suggestions and the Tag names setting with its validation
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [x] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

## Comments

- Built in three seams. **Pure** (`tagMarkers.ts`, `render.ts`): `parseTagInput`, `normalizeTagNames`, `splitTagNames`; `locateClick(tree, block, offset)` maps the clicked character of a block (its `data-src` and the count of visible characters before it) to an offset in the Document through source positions kept on the rendered text nodes (escapes, entities, quote and list prefixes aligned); `markersOf(tree)`. **Writes** (`markerWrites.ts`): `insertMarker` / `removeMarker` version-checked, on a Conflict retried once on the disk's text when the guarded passage (the clicked block for Insert, the tag itself for Remove) is the same at the same offsets, else Refused `passageChanged` ("This passage changed on disk; try again."); `usedMarkerNames` renders every Document of the Project when the Insert popup opens. **View**: `src/view/TagMarkers.svelte` (Insert and Remove popups at the pointer), Tag names field in Project settings (`tagSuggestions` in `.living-doc.json`, the original's key), 9 journeys in `e2e/tag-markers.test.ts`. Unit 956/956; `tessello validate` installable (the three known warnings).
- Browser suite: 331/334 in the full run; the 3 failures (`e2e/editing.test.ts`: Revert without changes, right-click section edit, pending conflict) hung about 16 minutes each and pass alone (11/11). An earlier full run failed two other tests (`tree.test.ts` handle arrows, `view.test.ts` picker cancel), also green alone. Looks like flakiness under machine load, not proven against the previous commit.
- Shift + right-click on text or a pill is now the Tag marker gesture (as in the original); before, it kept the browser's own menu. On an image it still does.
- A Tag name that is a standard HTML element (`p`, `span`…) is refused both in the Insert popup and in the Tag names setting: by rule 1 of the port such a tag never shows as a marker. The original accepted them (Q-036).
- A hand-edited `.living-doc.json` with invalid names: they are dropped when read, without a message; the error naming them shows only when typing in Project settings.
- "Same spot" is taken literally: if an agent's change before the clicked passage shifts it, the retry is refused with the message even though the passage text is unchanged.
- A click that cannot be mapped (generated text such as footnote numbers or callout titles, raw HTML content) gives "The clicked spot could not be located in the source."
- Texts: "Insert a Tag marker", "Remove the <name> Tag marker?" (name in lower case, R4); no **b** glyph.
- Also fixed: the refusal message of `invalidAnnotations` was missing from the View's refusal map.
- Tried in the local Host by the User on 2026-11-26.
