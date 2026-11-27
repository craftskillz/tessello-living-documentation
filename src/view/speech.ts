// The browser's own voices (ADR 0009): the production Speaker of the Reader, over `speechSynthesis`.

import type { Speaker } from "../lib/reader.ts";
import type { VoiceInfo } from "../lib/readingScript.ts";

const synthesis = (): SpeechSynthesis | null => (typeof speechSynthesis === "undefined" ? null : speechSynthesis);

/** The browser's voices now; Chrome fills the list after a `voiceschanged` event, so `onchange` gets every later list. */
export function watchVoices(onchange: (voices: SpeechSynthesisVoice[]) => void): () => void {
  const speech = synthesis();
  if (!speech) {
    onchange([]);
    return () => {};
  }
  const update = () => onchange(speech.getVoices());
  update();
  speech.addEventListener("voiceschanged", update);
  return () => speech.removeEventListener("voiceschanged", update);
}

export const voiceInfo = (voice: SpeechSynthesisVoice): VoiceInfo => ({ name: voice.name, lang: voice.lang, default: voice.default });

/**
 * A Speaker reading in `lang` with `voice` (null: the browser's choice for the language) at the speed `rate()` gives when each utterance starts (1 = normal speed). Each utterance is kept
 * referenced until it ends (Chrome may otherwise drop its events), and a cancelled utterance's events are ignored.
 */
export function browserSpeaker(lang: string, voice: SpeechSynthesisVoice | null, rate: () => number = () => 1): Speaker {
  let current: SpeechSynthesisUtterance | null = null;
  return {
    speak(text, handlers) {
      const speech = synthesis();
      if (!speech) return handlers.onerror("speechSynthesis is not available");
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = rate();
      if (voice) utterance.voice = voice;
      utterance.onend = () => {
        if (current !== utterance) return;
        current = null;
        handlers.onend();
      };
      utterance.onerror = (event) => {
        if (current !== utterance) return;
        current = null;
        // Interrupted or cancelled by our own cancel(): not a failure.
        if (event.error === "interrupted" || event.error === "canceled") return;
        handlers.onerror(event.error);
      };
      current = utterance;
      speech.speak(utterance);
    },
    cancel() {
      current = null;
      synthesis()?.cancel();
    },
  };
}
