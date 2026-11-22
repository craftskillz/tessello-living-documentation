# Read aloud uses the browser's own voices

The original speaks with Kokoro, run on the hub's computer through optional packages (`kokoro-js`, an espeak-ng build for French). A Tessello Module has no process of its own, so the port uses the browser's speech (Web Speech API) instead: it needs no network, no packages and no permission, and it reads any language that has a voice installed. Speech quality and the voice list therefore depend on the reader's computer; the reader picks a voice per language and a speed, kept in the Module's storage.

## Considered Options

- **Kokoro inside the browser (WASM/WebGPU)**: rejected for v1; an ~80 MB model download plus a French pronunciation engine, a network permission, large Module storage, and slow speech on CPU. May return after v1 if browser voices prove too poor.
- **A speech server on the local network**: rejected for the reasons of the Tessello ADR 0020 (shared `null` origin, sensitive permission, CORS).

## Consequences

- Listen is hidden when the browser has no voices; a Document whose language has no voice gets a message and keeps its value.
- Any language code is accepted, not only `en` and `fr`.
- A prototype (2026-11-22) confirmed speech inside the sandboxed View: 199 voices, English and French heard, a 47-second sentence spoken to the end.
