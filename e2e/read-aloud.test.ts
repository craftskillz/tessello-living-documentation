import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { until } from "@tessello/sdk/testing";
import type { Page } from "playwright";
import { openView, useBrowser, withProject, type Opened } from "./living-documentation.ts";

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
      type Utterance = { text: string; lang: string; rate: number; voice: { name: string } | null; onend: (() => void) | null; onerror: ((event: { error: string }) => void) | null };
      const state = { spoken: [] as { text: string; lang: string; rate: number; voice: string | null }[], current: null as Utterance | null };
      class FakeUtterance {
        text: string;
        lang = "";
        rate = 1;
        voice: { name: string } | null = null;
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
          state.spoken.push({ text: utterance.text, lang: utterance.lang, rate: utterance.rate, voice: utterance.voice?.name ?? null });
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

type Spoken = { text: string; lang: string; rate: number; voice: string | null };
const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __speech: { spoken(): Spoken[] } }).__speech.spoken());
const end = (page: Page) => page.evaluate(() => (window as unknown as { __speech: { end(): void } }).__speech.end());
const highlighted = (page: Page) =>
  page.evaluate(() => {
    const highlight = CSS.highlights.get("ld-reading");
    const block = document.querySelector(".ld-reading-block");
    return highlight ? [...highlight].map((range) => range.toString()).join("|") : block ? `[block] ${block.textContent?.trim().slice(0, 20)}` : null;
  });
/** The highlight inside the generated page's shadow root: the text, and whether it really sits in the shadow tree. */
const highlightedInPage = (page: Page) =>
  page.evaluate(() => {
    const root = document.querySelector(".page")?.shadowRoot;
    const highlight = CSS.highlights.get("ld-reading");
    if (highlight) {
      const ranges = [...highlight] as Range[];
      return { text: ranges.map((range) => range.toString()).join("|"), inPage: ranges.every((range) => range.startContainer.getRootNode() === root) };
    }
    const block = root?.querySelector(".ld-reading-block");
    return block ? { text: `[block] ${block.textContent?.trim().slice(0, 20)}`, inPage: true } : null;
  });
/** Selects `text` inside the first element matching `selector` (a Range over its text node), in the document or in the generated page's shadow root. */
const select = async (page: Page, selector: string, text: string, inPage = false) => {
  if (!inPage) await page.locator(selector).first().waitFor();
  return page.evaluate(
    ({ selector, text, inPage }) => {
      const root: ParentNode = inPage ? document.querySelector(".page")!.shadowRoot! : document;
      const element = root.querySelector(selector)!;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.textContent!.indexOf(text);
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + text.length);
        const selection = (inPage ? (root as unknown as ShadowRoot & { getSelection?: () => Selection }).getSelection?.() : null) ?? document.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      throw new Error(`no text ${text}`);
    },
    { selector, text, inPage },
  );
};
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

describe("Listen starts where the selection begins", () => {
  test("inside a sentence: from the selected word, the highlight covers only that part; then the next sentences", async () => {
    const { page } = await project({ "essai.md": FRENCH });
    await select(page, "article p", "conde phrase");
    await page.getByRole("button", { name: "Listen" }).click();
    assert.deepEqual(await waitSpoken(page, 1), ["seconde phrase utile."]);
    await until(async () => (await highlighted(page)) === "seconde phrase utile.", "the part of the sentence highlighted");
    await end(page);
    assert.equal((await waitSpoken(page, 2))[1], "Bloc de code.");
  });

  test("inside the code block: from its announcement", async () => {
    const { page } = await project({ "essai.md": FRENCH });
    await select(page, "article pre", "const");
    await page.getByRole("button", { name: "Listen" }).click();
    assert.deepEqual(await waitSpoken(page, 1), ["Bloc de code."]);
  });

  test("a selection outside the body starts at the beginning", async () => {
    const { page } = await project({ "essai.md": "---\ntitle: Essai\nlanguage: fr\ndescription: Un petit résumé\n---\n# Introduction\n\nLe début.\n" });
    await page.getByText("Un petit résumé").waitFor();
    await select(page, "body", "petit résumé");
    await page.getByRole("button", { name: "Listen" }).click();
    assert.deepEqual(await waitSpoken(page, 1), ["Introduction"]);
  });

  test("the start point is kept across the Reading language dialog", async () => {
    const { page } = await project({ "a.md": "# A\n\nFirst one. Second one here.\n" });
    await select(page, "article p", "ond one");
    await page.getByRole("button", { name: "Listen" }).click();
    await page.getByRole("dialog", { name: "Reading language" }).getByRole("button", { name: "English" }).click();
    assert.deepEqual(await waitSpoken(page, 1), ["Second one here."]);
    assert.equal((await spoken(page))[0]!.lang, "en");
  });
});

describe("Voice and speed", () => {
  const open = async (page: Page, name = "Reading voice and speed") => {
    await page.getByRole("button", { name }).click();
    return page.getByRole("dialog", { name });
  };

  test("a voice per language and a speed are kept; Browser default goes back to the browser's voice", async () => {
    const voices = [...VOICES, { name: "Amelie", lang: "fr-CA", default: true }];
    const files = { "essai.md": FRENCH };
    const first = await project(files, { voices });
    const panel = await open(first.page);
    await panel.getByLabel("Language").selectOption("fr");
    await panel.getByLabel("Voice", { exact: true }).selectOption("Thomas");
    await panel.getByLabel("Speed").fill("1.5");
    await until(async () => (await panel.getByText("1.5×").count()) === 1, "the speed shown");
    await first.page.keyboard.press("Escape");
    await first.page.getByRole("button", { name: "Listen" }).click();
    await waitSpoken(first.page, 1);
    assert.deepEqual([(await spoken(first.page))[0]!.voice, (await spoken(first.page))[0]!.rate], ["Thomas", 1.5]);

    // Another View on the same Host: the choices are kept in the Module's storage.
    const again = await openView({ host: first.host, init: fakeSpeech(voices) });
    watched = { page: again.page, address: again.page.url() };
    await again.page.getByRole("navigation", { name: "Documents" }).getByRole("link", { name: "essai.md", exact: true }).click();
    const kept = await open(again.page);
    await kept.getByLabel("Language").selectOption("fr");
    assert.equal(await kept.getByLabel("Voice", { exact: true }).inputValue(), "Thomas");
    await again.page.keyboard.press("Escape");
    await again.page.getByRole("button", { name: "Listen" }).click();
    await waitSpoken(again.page, 1);
    assert.deepEqual([(await spoken(again.page))[0]!.voice, (await spoken(again.page))[0]!.rate], ["Thomas", 1.5]);

    await again.page.getByRole("button", { name: "Stop reading" }).click();
    const reopened = await open(again.page);
    await reopened.getByLabel("Language").selectOption("fr");
    await reopened.getByLabel("Voice", { exact: true }).selectOption({ label: "Browser default" });
    await again.page.keyboard.press("Escape");
    await again.page.getByRole("button", { name: "Listen" }).click();
    await waitSpoken(again.page, 2);
    assert.equal((await spoken(again.page))[1]!.voice, "Amelie", "the browser's default French voice");
  });

  test("the panel is hidden with no voice, closes on Escape, and speaks French in the French interface", async () => {
    const { page } = await project({ "a.md": "# A\n\nText.\n" }, { voices: [] });
    await page.getByRole("button", { name: "Edit" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Reading voice and speed" }).count(), 0);

    const french = await project({ "a.md": "# A\n\nText.\n" }, { locale: "fr" });
    await french.page.getByRole("button", { name: "Voix et vitesse de lecture" }).click();
    const panel = french.page.getByRole("dialog", { name: "Voix et vitesse de lecture" });
    await panel.getByRole("group", { name: "Voix" }).waitFor();
    await panel.getByRole("group", { name: "Vitesse" }).waitFor();
    await panel.getByLabel("Langue").waitFor();
    await panel.getByRole("option", { name: "Voix du navigateur" }).waitFor({ state: "attached" });
    await french.page.keyboard.press("Escape");
    await until(async () => (await panel.count()) === 0, "the panel closed");
  });
});

describe("Listen in the HTML view", () => {
  const DOC = "---\nhtml_template: article\nlanguage: fr\n---\n# Titre\n\nIntro un.\n\n## Partie\n\nTexte deux.\n";
  const openHtml = async (files: Record<string, string>) => {
    const opened = await project(files);
    await opened.page.getByRole("button", { name: "View as HTML" }).click();
    await opened.page.getByRole("region", { name: "HTML view of the document" }).locator(".article-header").waitFor();
    return opened;
  };

  test("reads the main content only, highlights inside the page, Next section works and Stop clears", async () => {
    const { page } = await openHtml({ "a.md": DOC });
    await page.getByRole("button", { name: "Listen" }).click();
    const first = await waitSpoken(page, 1);
    assert.notEqual(first[0], "Titre", "the page title is not read");
    await until(async () => (await highlightedInPage(page))?.inPage === true, "the highlight inside the page");
    assert.equal((await highlightedInPage(page))!.text, first[0]);
    const controls = page.getByRole("group", { name: "Read aloud" });
    await controls.getByRole("button", { name: "Next section" }).click();
    await until(async () => (await highlightedInPage(page))?.text === "Partie", "the next section highlighted");
    await controls.getByRole("button", { name: "Stop reading" }).click();
    await until(async () => (await highlightedInPage(page)) === null, "the highlight cleared");
  });

  test("starts from a selection in the page", async () => {
    const { page } = await openHtml({ "a.md": DOC });
    await select(page, "main", "xte deux", true);
    await page.getByRole("button", { name: "Listen" }).click();
    assert.deepEqual(await waitSpoken(page, 1), ["Texte deux."]);
  });

  test("an in-place edit or a template change stops the reading", async () => {
    const { page } = await openHtml({ "a.md": DOC });
    await page.getByRole("button", { name: "Listen" }).click();
    await page.getByRole("group", { name: "Read aloud" }).waitFor();
    await page.getByRole("button", { name: "Change the HTML template" }).click();
    await page.getByRole("dialog", { name: "Choose an HTML template" }).getByRole("button", { name: /^Interview sheet/ }).click();
    await page.getByRole("region", { name: "HTML view of the document" }).locator(".sheet-header").waitFor();
    await page.getByRole("button", { name: "Listen" }).waitFor();
    assert.equal(await highlightedInPage(page), null);
  });

  test("an in-place edit stops the reading", async () => {
    const { page } = await openHtml({ "a.md": DOC });
    await page.getByRole("button", { name: "Listen" }).click();
    await page.getByRole("group", { name: "Read aloud" }).waitFor();
    await page.getByRole("region", { name: "HTML view of the document" }).locator("p", { hasText: "Texte deux." }).dblclick({ position: { x: 4, y: 6 } });
    await page.keyboard.type("Z");
    await page.keyboard.press("Control+Enter");
    await page.getByRole("button", { name: "Listen" }).waitFor();
  });

  test("Back to the Document stops the reading", async () => {
    const { page } = await openHtml({ "a.md": DOC });
    await page.getByRole("button", { name: "Listen" }).click();
    await page.getByRole("group", { name: "Read aloud" }).waitFor();
    await page.getByRole("button", { name: "← Document" }).click();
    await page.getByRole("button", { name: "Listen" }).waitFor();
    assert.equal(await highlighted(page), null);
  });

  test("a language to choose is written from the HTML view too", async () => {
    const { page, host, disk } = await openHtml({ "a.md": "---\nhtml_template: article\n---\n# T\n\nHello.\n" });
    await page.getByRole("button", { name: "Listen" }).click();
    await page.getByRole("dialog", { name: "Reading language" }).getByRole("button", { name: "English" }).click();
    await waitSpoken(page, 1);
    assert.match(host.folders.read(disk, "a.md") ?? "", /language: en/);
  });
});
