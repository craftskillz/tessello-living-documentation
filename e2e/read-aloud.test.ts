import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { until } from "@tessello/sdk/testing";
import type { Page } from "playwright";
import { useBrowser, withProject, type Opened } from "./living-documentation.ts";

useBrowser();

/** The open View and its address: after every journey, the address must not have changed (an about:srcdoc page in the Host). */
let watched: { page: Opened["page"]; address: string } | null = null;

/**
 * The browser's speech replaced by a fake: `voices` are its voices; every utterance spoken is recorded, and the test ends
 * the current one with `__speech.end()`. cancel() interrupts the current utterance as Chrome does.
 */
function fakeSpeech(voices: { name: string; lang: string; default?: boolean }[]) {
  return async (page: Page): Promise<void> => {
    await page.addInitScript((list) => {
      type Utterance = { text: string; lang: string; voice: unknown; onend: (() => void) | null; onerror: ((event: { error: string }) => void) | null };
      const state = { spoken: [] as { text: string; lang: string }[], current: null as Utterance | null };
      class FakeUtterance {
        text: string;
        lang = "";
        voice: unknown = null;
        onend: (() => void) | null = null;
        onerror: ((event: { error: string }) => void) | null = null;
        constructor(text: string) {
          this.text = text;
        }
      }
      const voiceObjects = list.map((voice) => ({ name: voice.name, lang: voice.lang, default: voice.default ?? false, localService: true, voiceURI: voice.name }));
      const synthesis = {
        getVoices: () => voiceObjects,
        speak(utterance: Utterance) {
          state.current = utterance;
          state.spoken.push({ text: utterance.text, lang: utterance.lang });
        },
        cancel() {
          const current = state.current;
          state.current = null;
          current?.onerror?.({ error: "interrupted" });
        },
        addEventListener() {},
        removeEventListener() {},
      };
      Object.defineProperty(window, "speechSynthesis", { value: synthesis, configurable: true });
      Object.defineProperty(window, "SpeechSynthesisUtterance", { value: FakeUtterance, configurable: true });
      (window as unknown as { __speech: unknown }).__speech = {
        spoken: () => state.spoken,
        end() {
          const current = state.current;
          state.current = null;
          current?.onend?.();
        },
      };
    }, voices);
  };
}

const VOICES = [
  { name: "Samantha", lang: "en-US", default: true },
  { name: "Thomas", lang: "fr-FR" },
  { name: "Anna", lang: "de-DE" },
];

async function project(files: Record<string, string>, options: { locale?: string; voices?: typeof VOICES } = {}) {
  const opened = await withProject(files, { locale: options.locale, init: fakeSpeech(options.voices ?? VOICES) });
  watched = { page: opened.page, address: opened.page.url() };
  return opened;
}

afterEach(() => {
  if (watched) assert.equal(watched.page.url(), watched.address);
  watched = null;
});

const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __speech: { spoken(): { text: string; lang: string }[] } }).__speech.spoken());
const end = (page: Page) => page.evaluate(() => (window as unknown as { __speech: { end(): void } }).__speech.end());
const highlighted = (page: Page) =>
  page.evaluate(() => {
    const highlight = CSS.highlights.get("ld-reading");
    const block = document.querySelector(".ld-reading-block");
    return highlight ? [...highlight].map((range) => range.toString()).join("|") : block ? `[block] ${block.textContent?.trim().slice(0, 20)}` : null;
  });
async function waitSpoken(page: Page, count: number) {
  await until(async () => (await spoken(page)).length === count, `${count} utterances`);
  return (await spoken(page)).map((each) => each.text);
}

const FRENCH = [
  "---",
  "title: Essai",
  "language: fr",
  "---",
  "# Introduction",
  "",
  "Le début. Une seconde phrase utile.",
  "",
  "```js",
  "const a = 1;",
  "```",
  "",
  "## Première section",
  "",
  "Texte de la section.",
  "",
  "## Sous-section",
  "",
  "Fin.",
  "",
].join("\n");

describe("Listen", () => {
  test("reads sentence by sentence with the highlight; code announced in the Document's language; Pause, Resume, Next section, Stop", async () => {
    const { page } = await project({ "essai.md": FRENCH });
    await page.getByRole("button", { name: "Listen" }).click();

    assert.deepEqual(await waitSpoken(page, 1), ["Introduction"]);
    assert.deepEqual((await spoken(page))[0]!.lang, "fr");
    await until(async () => (await highlighted(page)) === "Introduction", "the heading highlighted");
    await end(page);
    assert.deepEqual(await waitSpoken(page, 2), ["Introduction", "Le début."]);
    await until(async () => (await highlighted(page)) === "Le début.", "the first sentence highlighted");
    await end(page);
    await waitSpoken(page, 3);
    await end(page);
    // The interface is English, the Document French: the announcement is French.
    assert.equal((await waitSpoken(page, 4))[3], "Bloc de code.");
    await until(async () => ((await highlighted(page)) ?? "").startsWith("[block]"), "the code block highlighted whole");

    const controls = page.getByRole("group", { name: "Read aloud" });
    await controls.getByRole("button", { name: "Pause reading" }).click();
    await controls.getByRole("button", { name: "Next section" }).click();
    await until(async () => (await highlighted(page)) === "Première section", "the next heading highlighted while paused");
    assert.equal((await spoken(page)).length, 4, "nothing spoken while paused");
    await controls.getByRole("button", { name: "Resume reading" }).click();
    assert.equal((await waitSpoken(page, 5))[4], "Première section");

    await controls.getByRole("button", { name: "Next section" }).click();
    assert.equal((await waitSpoken(page, 6))[5], "Sous-section");
    assert.equal(await controls.getByRole("button", { name: "Next section" }).isDisabled(), true);

    await controls.getByRole("button", { name: "Stop reading" }).click();
    await page.getByRole("button", { name: "Listen" }).waitFor();
    assert.equal(await highlighted(page), null);
  });

  test("the reading ends by itself after the last sentence", async () => {
    const { page } = await project({ "a.md": "---\nlanguage: en\n---\n# A\n\nOnly one.\n" });
    await page.getByRole("button", { name: "Listen" }).click();
    await waitSpoken(page, 1);
    await end(page);
    await waitSpoken(page, 2);
    await end(page);
    await page.getByRole("button", { name: "Listen" }).waitFor();
    assert.equal(await highlighted(page), null);
  });

  test("hidden when the browser has no voice", async () => {
    const { page } = await project({ "a.md": "# A\n\nText.\n" }, { voices: [] });
    await page.getByRole("button", { name: "Edit" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Listen" }).count(), 0);
  });

  test("editing stops the reading", async () => {
    const { page } = await project({ "a.md": "---\nlang: English\n---\n# A\n\nText.\n" });
    await page.getByRole("button", { name: "Listen" }).click();
    await waitSpoken(page, 1);
    assert.equal((await spoken(page))[0]!.lang, "en");
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: "Listen" }).waitFor();
    assert.equal(await highlighted(page), null);
  });
});

describe("Listen stops", () => {
  test("opening another Document stops the reading", async () => {
    const { page } = await project({ "a.md": "---\nlanguage: en\n---\n# A\n\nText.\n", "b.md": "# B\n" });
    await page.getByRole("navigation", { name: "Documents" }).getByRole("link", { name: "a.md", exact: true }).click();
    await page.getByRole("heading", { level: 1, name: "A" }).waitFor();
    await page.getByRole("button", { name: "Listen" }).click();
    await page.getByRole("group", { name: "Read aloud" }).waitFor();
    await page.getByRole("navigation", { name: "Documents" }).getByRole("link", { name: "b.md", exact: true }).click();
    await page.getByRole("heading", { level: 1, name: "B" }).waitFor();
    await page.getByRole("button", { name: "Listen" }).waitFor();
    assert.equal(await highlighted(page), null);
  });
});

describe("Reading language", () => {
  test("a Document without a language asks among the languages with a voice, interface first, writes it in place, then reads", async () => {
    const text = "---\ntitle: Essai\ntags: [alpha, beta]\n---\n# Essai\n\nBonjour.\n";
    const { page, host, disk } = await project({ "a.md": text }, { locale: "fr" });
    await page.getByRole("button", { name: "Écouter" }).click();
    const dialog = page.getByRole("dialog", { name: "Langue de lecture" });
    await dialog.waitFor();
    const offered = await dialog.locator(".languages button").allTextContents();
    assert.deepEqual(offered.map((each) => each.trim()), ["Français", "Allemand", "Anglais"]);

    await dialog.getByRole("button", { name: "Français" }).click();
    await until(async () => (await dialog.count()) === 0, "the dialog closed");
    assert.equal(host.folders.read(disk, "a.md"), "---\ntitle: Essai\ntags: [alpha, beta]\nlanguage: fr\n---\n# Essai\n\nBonjour.\n");
    assert.deepEqual(await waitSpoken(page, 1), ["Essai"]);
    assert.equal((await spoken(page))[0]!.lang, "fr");
  });

  test("Cancel writes nothing and reads nothing", async () => {
    const { page, host, disk } = await project({ "a.md": "# A\n\nText.\n" });
    await page.getByRole("button", { name: "Listen" }).click();
    const dialog = page.getByRole("dialog", { name: "Reading language" });
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await until(async () => (await dialog.count()) === 0, "the dialog closed");
    assert.equal(host.folders.read(disk, "a.md"), "# A\n\nText.\n");
    assert.equal((await spoken(page)).length, 0);
  });

  test("a conflict overwrites nothing; the dialog stays open and Retry writes", async () => {
    const { page, host, disk } = await project({ "a.md": "# A\n\nMine.\n" });
    await page.getByRole("button", { name: "Listen" }).click();
    const dialog = page.getByRole("dialog", { name: "Reading language" });
    await dialog.waitFor();
    host.folders.write(disk, "a.md", "# A\n\nAgent.\n");

    await dialog.getByRole("button", { name: "English" }).click();
    await dialog.getByRole("alert").getByText("This document changed on disk. Try again.").waitFor();
    assert.equal(host.folders.read(disk, "a.md"), "# A\n\nAgent.\n");

    await dialog.getByRole("button", { name: "Retry" }).click();
    await until(async () => (await dialog.count()) === 0, "the dialog closed");
    assert.equal(host.folders.read(disk, "a.md"), "---\nlanguage: en\n---\n# A\n\nAgent.\n");
    await waitSpoken(page, 1);
  });

  test("invalid frontmatter: the message shows in the dialog and the file is untouched", async () => {
    const text = "---\ntitle: [oops\n---\n# A\n";
    const { page, host, disk } = await project({ "a.md": text });
    await page.getByRole("button", { name: "Listen" }).click();
    const dialog = page.getByRole("dialog", { name: "Reading language" });
    await dialog.getByRole("button", { name: "English" }).click();
    await dialog.getByRole("alert").getByText("Fix the frontmatter first").waitFor();
    assert.equal(host.folders.read(disk, "a.md"), text);
  });

  test("a language without a voice is reported and never overwritten", async () => {
    const text = "---\nlangue: es-MX\n---\n# A\n\nHola.\n";
    const { page, host, disk } = await project({ "a.md": text });
    await page.getByRole("button", { name: "Listen" }).click();
    await page.getByRole("status").getByText("No voice for “es-MX” on this computer", { exact: false }).waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(host.folders.read(disk, "a.md"), text);
    assert.equal((await spoken(page)).length, 0);
  });
});
