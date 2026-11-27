# Annotations are the tasks the User leaves for agents

The User needs one way to ask a coding agent for work on a passage of a Document, and to see what the agent did. Tag markers (`<add-footnote>`) did this inside the Document's text, where they clutter the Markdown, show as stray tags in other renderers and duplicate what annotations already offer: a note on a precise passage, outside the text, shared through the repository. So **every Annotation is a task**: it has a status, **to do** (the default, also for every existing annotation) or **done**, and a thread of **Replies**. An agent that carries out a task appends a Reply saying what it did and sets the status to done; the Module colors the annotation by status, and the User can reply, reopen or close it from its popup. Tag markers are retired in a later session.

The format stays additive (ADR 0003): `status` and `replies` are new optional keys of an entry in `.annotations.json`; the original ignores them, and the Module already keeps keys it does not know.

## Considered Options

- **Keep Tag markers as the agents' channel, annotations for people**: rejected. Two ways to say the same thing, and the one in the text pollutes the Document.
- **A task flag chosen when creating the annotation (task or plain note)**: rejected. One more choice at every annotation, for a distinction the User does not need: a plain remark is a task the agent answers with a Reply.
- **A single `reply` field, replaced at each pass**: rejected. A reopened task loses the exchange that led to it; the thread keeps it.

## Consequences

- An annotation's anchor is the reading view's text, not the Markdown (30 characters of context on each side). An agent that rewrites an annotated passage re-anchors the annotation on the new passage, written as rendered text; otherwise the done task shows as "surrounding text changed" or an orphan.
- The agent-facing rules (how to find tasks, reply, close and re-anchor) live in the `living-documentation` skill, which follows this format.
