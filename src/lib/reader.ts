// The Reader (read aloud): drives a Speaker through a reading script. It knows nothing of the DOM
// and nothing is timed. Spec: docs/spec/read-aloud.md rules 10-11.

/** What the Reader reads: a structural subset of the reading script's segments. */
export interface ScriptSegment {
  /** "heading" starts a section. */
  kind: string;
  sentences: { pieces: string[] }[];
}

export interface Position {
  segment: number;
  sentence: number;
}

export type ReaderStatus = "idle" | "playing" | "paused";

export interface ReaderState {
  status: ReaderStatus;
  /** The sentence to highlight; null when idle. */
  at: Position | null;
  /** Whether a heading follows the current segment (Next section enabled). */
  hasNextSection: boolean;
}

/** The production adapter wraps speechSynthesis. Contract: after cancel(), no handler of an earlier speak() fires. */
export interface Speaker {
  speak(text: string, handlers: { onend(): void; onerror(message: string): void }): void;
  cancel(): void;
}

export interface Reader {
  /** Starts reading `script` from `from` (default the first sentence); a reading already going is stopped first. An empty script does nothing and stays idle. */
  start(script: ScriptSegment[], from?: Position): void;
  pause(): void;
  resume(): void;
  /** Jumps to the first sentence of the next heading segment after the current segment; keeps playing or paused. No-op when none follows. */
  nextSection(): void;
  /** Stops, cancels the Speaker, state back to idle. */
  stop(): void;
  readonly state: ReaderState;
}

interface Cursor extends Position {
  piece: number;
}

export function createReader(
  speaker: Speaker,
  events: { onchange(state: ReaderState): void; onerror(message: string): void },
): Reader {
  let script: ScriptSegment[] = [];
  let status: ReaderStatus = "idle";
  let cursor: Cursor | null = null;
  /** Identifies the utterance whose handlers may act; 0 means none. */
  let live = 0;
  let counter = 0;
  let last = JSON.stringify({ status: "idle", at: null, hasNextSection: false } satisfies ReaderState);

  const readable = (segment: number, sentence: number) => (script[segment]?.sentences[sentence]?.pieces.length ?? 0) > 0;

  /** The first sentence with pieces at or after `from`. */
  const firstReadable = (from: Position): Position | null => {
    for (let s = Math.max(0, from.segment); s < script.length; s++) {
      const sentences = script[s]!.sentences;
      for (let i = s === from.segment ? Math.max(0, from.sentence) : 0; i < sentences.length; i++) {
        if (readable(s, i)) return { segment: s, sentence: i };
      }
    }
    return null;
  };

  const nextHeading = (): Position | null => {
    if (!cursor) return null;
    for (let s = cursor.segment + 1; s < script.length; s++) {
      if (script[s]!.kind === "heading") {
        const target = firstReadable({ segment: s, sentence: 0 });
        if (target && target.segment === s) return target;
      }
    }
    return null;
  };

  const snapshot = (): ReaderState => ({
    status,
    at: cursor ? { segment: cursor.segment, sentence: cursor.sentence } : null,
    hasNextSection: nextHeading() !== null,
  });

  const notify = () => {
    const state = snapshot();
    const key = JSON.stringify(state);
    if (key === last) return;
    last = key;
    events.onchange(state);
  };

  const silence = () => {
    live = 0;
    speaker.cancel();
  };

  const speakCurrent = () => {
    if (!cursor) return;
    const id = ++counter;
    live = id;
    speaker.speak(script[cursor.segment]!.sentences[cursor.sentence]!.pieces[cursor.piece]!, {
      onend: () => {
        if (live === id) advance();
      },
      onerror: (message) => {
        if (live !== id) return;
        silence();
        status = "idle";
        cursor = null;
        notify();
        events.onerror(message);
      },
    });
  };

  const advance = () => {
    if (!cursor) return;
    const pieces = script[cursor.segment]!.sentences[cursor.sentence]!.pieces;
    if (cursor.piece + 1 < pieces.length) {
      cursor = { ...cursor, piece: cursor.piece + 1 };
    } else {
      const next = firstReadable({ segment: cursor.segment, sentence: cursor.sentence + 1 });
      if (!next) {
        live = 0;
        status = "idle";
        cursor = null;
        notify();
        return;
      }
      cursor = { ...next, piece: 0 };
    }
    speakCurrent();
    notify();
  };

  return {
    start(newScript, from = { segment: 0, sentence: 0 }) {
      if (status !== "idle") silence();
      script = newScript;
      const first = firstReadable(from);
      if (!first) {
        status = "idle";
        cursor = null;
        notify();
        return;
      }
      status = "playing";
      cursor = { ...first, piece: 0 };
      speakCurrent();
      notify();
    },
    pause() {
      if (status !== "playing") return;
      silence();
      status = "paused";
      notify();
    },
    resume() {
      if (status !== "paused") return;
      status = "playing";
      speakCurrent();
      notify();
    },
    nextSection() {
      const target = status === "idle" ? null : nextHeading();
      if (!target) return;
      if (status === "playing") silence();
      cursor = { ...target, piece: 0 };
      if (status === "playing") speakCurrent();
      notify();
    },
    stop() {
      if (status === "idle") return;
      silence();
      status = "idle";
      cursor = null;
      notify();
    },
    get state() {
      return snapshot();
    },
  };
}
