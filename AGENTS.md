# Living Documentation (Tessello Module)

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### UI conventions

Before building or restyling a panel, dialog, form or sidebar element of the View or Widget, read `docs/ui.md`.

## Working a ticket

- Tickets live in `.scratch/living-documentation-port/issues/`; the spec is `.scratch/living-documentation-port/spec.md`. Start only a ticket whose blockers are all `Status: done`.
- When a ticket is finished: tick its criteria, set `**Status:** done (<commit>)`, and add a `## Comments` note with anything that differs from the spec or is left over.
- The View is an `about:srcdoc` page in the Tessello Host: no URL or hash routing, no `href` that resolves to an address. The SDK Test Host runs the View top-level, so keep the e2e check that the page address never changes, and try the ticket in the local Host before calling it done.
- The Module uses the published SDK and CLI from npm, at exact versions (`@tessello/sdk` 0.3.0, `tessello` 0.6.0). A change that needs a new Host capability is made first in the sibling `tessello` repository and published there.
