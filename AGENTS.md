# AGENTS.md

Instructions for coding agents working on this repo or a fork. Read `README.md` for the human view.

## Shape

- `public/index.html` is the entire site. It has no build step, no package imports and no external requests. Everything is inline: CSS, the JavaScript engine and the YAML scenes in `<script type="text/yaml" data-scene="…">`.
- `wrangler.jsonc` describes an **assets-only** Cloudflare Worker that serves `public/` on `moldandyeast.com/*`. It uses a zone route because the apex already had a DNS record; a fork on a fresh hostname should use `{ "pattern": "host", "custom_domain": true }`. Keep it assets-only: do not add a `main` script unless the user asks, because static assets are free and unmetered.
- `public/_headers` sets the CSP, the `Link` header and content types. Cloudflare reads it and does not serve it.
- `public/llms.txt`, `public/index.md`, `public/robots.txt` and `public/sitemap.xml` are the agent-facing copies of the page. **Whenever you change the heading or links in `index.html`, update `llms.txt` and `index.md` to match.**

## Invariants

1. **Content lives in HTML.** `<main id="site">` is the source of truth. The room's JavaScript reads `#links a` (`data-label`, `data-host`, `href`) and the `<h1>`, so content changes need no JS edits.
2. **The JavaScript is frozen by checksum.** `scripts/piece-js.sha256` is the SHA-256 of every `<script>` block except the JSON-LD one, concatenated in order. `npm run check` fails if they drift. Only regenerate it when the user asked for a JS change (the command is in README.md).
3. **No third-party requests.** Do not add webfonts from Google Fonts, CDN scripts, analytics, remote images or `fetch` calls to other origins. The CSP will block them anyway. If a webfont is really needed: subset it to the codepoints the page uses, inline it as base64 woff2 in `@font-face`, and commit its licence under `fonts/`.
4. **The credits bar** (`<nav id="credits">`) is styled with the site's own tokens (`--mono`, `--ink`, `--ink-2`, `--hair`, `--bg`, `--panel`). It shows on the text page and in the room, and hides in the studio (`html.studio`), in fullscreen and in print. CSS alone controls it: do not add JS for it.
5. **Modes are classes on `<html>`.** `can-room` means the room is available, `room` means the 3D room is showing, and `studio` means the instrument is open. Style against these classes rather than adding new state.

## Commands

```sh
npm install
npm run dev       # local server on :8787; applies _headers like production
npm run check     # offline checks: JS checksum, no external resources, files present
npm run deploy    # = wrangler deploy (manual; there is no CI). Uses the existing `wrangler login` session
npm run verify    # offline checks + live: DNS via 1.1.1.1, byte-identical HTML/llms.txt/index.md, credits links all 200
```

Deploying is manual and outward-facing: pushing a branch publishes nothing. Only run `npm run deploy` when the user asks for it.

## Verifying a deploy

- Use `npm run verify`, or `dig @1.1.1.1 +short <host>` followed by `curl --resolve <host>:443:<ip> https://<host>/`. A local resolver may cache an NXDOMAIN from before the first deploy, so a failing plain `curl` right after deploying can be a false alarm.
- The live `/` must be byte-identical to `public/index.html`.
- Every link in the credits bar must return 200.
- If you could not see the page render in a real browser, say so.

## Forking checklist

Edit `<main id="site">`, `<head>` metadata and JSON-LD, the credits bar, the four agent files, then `name` and `routes` in `wrangler.jsonc`. Run `npm run check`, deploy, then run `npm run verify`.
