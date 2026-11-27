# Living Documentation

Keep your documentation as plain Markdown files in your project, where your coding agents and `git` can read them, and read, edit and organize them here.

1. Click **Connect a folder** and choose your documentation folder, for example your repository's `docs/`.
2. Allow Tessello to edit it when your browser asks.

After a browser restart, click **Reconnect** to allow the folder again.

## Work on it with your coding agents

Your documents are plain Markdown, so your coding agents already read them. The **living-documentation** skill teaches them the rest: to treat your annotations as tasks (do the work, reply in the thread, mark them done) and to write the block directives this Module reads, such as the width of a code block or a card, without a mistake that the reading view would silently ignore.

Install it from the root of your project, with the [skills CLI](https://github.com/vercel-labs/skills):

```sh
npx skills@latest add craftskillz/skill-living-documentation --skill living-documentation --agent claude-code
```

Add `codex` after `--agent` to install it for Codex too, or `-g` to install it for you rather than for the project. The agent loads it on its own when it writes in a Living Documentation folder; `/living-documentation` loads it by hand. Its source: https://github.com/craftskillz/skill-living-documentation
