# Favorites

Atlas page: `features/favorites.md` (business rules R1–R12). Atlas answers: Q-091 to Q-095. Decision: ADR 0007. Rules of the original not changed here are kept.

1. **Personal, per Project**, in the Module's storage; seeded once from `.living-doc.json` when the Project is first opened; the file is never written for favorites.
2. Documents only, starred with the header's **Favorite** button (not on the Folder manifest). New favorites go to the bottom; a Document appears at most once; at most 200 entries.
3. Each favorite shows the Document's **current displayed title**; the stored title is a fallback when the Document cannot be read.
4. A favorite whose file is missing stays in the list, greyed, as **Missing**, with **Remove**; never removed automatically. Opening a Project skips missing favorites.
5. Moves, renames and deletes made in the Module update or remove favorites (R6, R7).
6. The **Favorites** menu closes with Escape; Alt + ↑ / ↓ on a focused row reorders it, as does mouse drag.
7. A failed save restores the previous list and shows a message.
8. The top existing favorite is what the Widget lists first and what opens when a Project opens without a deep link or a last-open Document.
