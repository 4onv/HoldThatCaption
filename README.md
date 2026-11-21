# HoldThatCaption

[Try the live studio](https://4onv.github.io/HoldThatCaption/) · [Demo walkthrough](DEMO.md)

A browser-based caption timing editor for comedy clips. Play the included nine-second short, select **grounded.**, and compare the original caption with a split at the spoken reveal.

## Run locally

Serve `dist/` with a static HTTP server that supports byte ranges so the preview can seek to a reveal. From this project directory with Node.js installed:

```sh
npx --yes http-server@14.1.1 dist -a 127.0.0.1 -p 4387 -c-1
```

Open http://127.0.0.1:4387/. The app uses native browser modules and requires no build step, account, or API key.

## Editing a clip

Import a browser-playable video and plain-text SRT or WebVTT captions with non-overlapping cues. Choose the first word to hold, pause at the reveal, and choose **Use playhead**. **Apply timing fix** plays the revision. Switch between Original and Edited, or remove the fix to restore that cue. Export SRT before closing the tab. The browser keeps media and edits in memory. Export includes all applied edits regardless of the preview mode.

The editor supports one reveal per source cue. It exports caption text and timing. WebVTT positioning and style markup are not retained. The creator chooses the spoken reveal.

## Source

- `dist/index.html` and `dist/studio.css` define the responsive studio.
- `dist/studio.js` handles playback, editing, and local file import/export.
- `dist/captions.mjs` parses caption files and splits cues using integer milliseconds.
- `dist/assets/` contains the original coffee animation and poster. Demo narration uses Microsoft Zira synthesized speech.

Run caption regression checks with `node --test tests/captions.test.mjs`.
