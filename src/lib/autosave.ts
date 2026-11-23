// Autosave for the editors: saves shortly after typing stops, never two saves at once, and the text typed during a
// save is saved next. The timer is injected so tests drive time by hand.

export interface Timer {
  set(run: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface AutosaveOptions {
  /** The text as last saved (or as read when editing started). */
  saved: string;
  /** Writes `text`; rejects on failure (e.g. a Conflict). Never called while a previous call is running. */
  save(text: string): Promise<void>;
  delay?: number;
  timer?: Timer;
  /** Called on every change of `saving`, `paused` or `dirty`. */
  onchange?(): void;
  /** Called with a failed save's reason; the text stays dirty. A caller may call pause() from here. */
  onerror?(reason: unknown): void;
}

export interface Autosave {
  typed(text: string): void;
  flush(): Promise<boolean>;
  pause(): void;
  resume(): void;
  reset(saved: string): void;
  stop(): Promise<void>;
  readonly saving: boolean;
  readonly paused: boolean;
  readonly dirty: boolean;
}

export function createAutosave(options: AutosaveOptions): Autosave {
  const delay = options.delay ?? 1000;
  const timer: Timer = options.timer ?? {
    set: (run, ms) => setTimeout(run, ms),
    clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  let saved = options.saved;
  let latest = options.saved;
  let handle: unknown;
  let paused = false;
  let stopped = false;
  let generation = 0;
  let current: Promise<boolean> | undefined;
  let snapshot = "";

  const state = () => `${current !== undefined}|${paused}|${latest !== saved}`;
  snapshot = state();
  const notify = () => {
    const now = state();
    if (now === snapshot) return;
    snapshot = now;
    options.onchange?.();
  };

  const cancel = () => {
    if (handle !== undefined) timer.clear(handle);
    handle = undefined;
  };

  // Saves the latest text until nothing is left; true when it all went through.
  const loop = async (): Promise<boolean> => {
    const mine = generation;
    try {
      while (latest !== saved && !paused && !stopped && mine === generation) {
        const text = latest;
        try {
          await options.save(text);
        } catch (reason) {
          if (mine === generation) options.onerror?.(reason);
          return false;
        }
        if (mine !== generation) return false;
        saved = text;
        notify();
      }
      return latest === saved;
    } finally {
      current = undefined;
      notify();
    }
  };

  const start = (): Promise<boolean> => {
    if (current) return current;
    if (latest === saved || paused || stopped) return Promise.resolve(latest === saved);
    current = loop(); // always suspends on the save, so it is set before the loop can end
    notify();
    return current;
  };

  return {
    typed(text) {
      if (stopped) return;
      latest = text;
      cancel();
      notify();
      if (text === saved || paused) return;
      handle = timer.set(() => {
        handle = undefined;
        void start();
      }, delay);
    },
    async flush() {
      cancel();
      if (paused) return false;
      if (current) await current;
      if (latest === saved) return true;
      if (paused || stopped) return false;
      return start();
    },
    pause() {
      paused = true;
      cancel();
      notify();
    },
    resume() {
      paused = false;
      notify();
    },
    reset(text) {
      generation++;
      cancel();
      saved = latest = text;
      stopped = false;
      notify();
    },
    async stop() {
      stopped = true;
      cancel();
      if (current) await current;
    },
    get saving() {
      return current !== undefined;
    },
    get paused() {
      return paused;
    },
    get dirty() {
      return latest !== saved;
    },
  };
}
