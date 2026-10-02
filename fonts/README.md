# Fonts

The site is set in **[ABC Areal](https://abcdinamo.com/typefaces/areal)** by [Dinamo](https://abcdinamo.com), a free revival of Arial (v2.82, as it shipped in early web browsers), originally made for [Are.na](https://www.are.na/editorial/introducing-areal-are-nas-new-typeface).

**The font files are not in this repository, and must never be added.** Areal is free for everyone, but its licence ([Dinamo Licensing Terms](https://abcdinamo.com/licenses), §9.12 free fonts licence) lists among its restrictions (§10):

> Put the fonts in public repositories
>
> Use the fonts to create letterform-shaped objects

So:

- `.gitignore` ignores everything in `fonts/` except this README, and `npm run check` fails if a font file or inlined font data is ever tracked.
- The 3D letters in the room ("HI. I AM RAMON") are extruded from **Arial**, never from Areal, because they are letterform-shaped objects. Areal is used only for text: the HTML, the panel, crate labels and the studio UI.

## Using Areal in your build

1. Download Areal for free from https://abcdinamo.com/typefaces/areal and accept the licence.
2. Copy `ABC Areal/WOFF2/ABCArealVariable.woff2` from the download into this folder.
3. Install the subsetter once: `pip3 install fonttools brotli`.
4. `npm run build` (also run automatically by `wrangler dev` and `wrangler deploy`).

`scripts/build.mjs` subsets the variable font to the codepoints the page uses (about 140; weight 400–700 and the `DRKM` dark-mode axis are kept, along with the font's copyright and licence strings), then inlines it as base64 WOFF2 in `@font-face` in `dist/index.html`. §9.5 allows self-hosting and subsetting WOFF2 with `@font-face`. The deployed page stays one self-contained file with no third-party requests.

Without the font, the build copies `public/` unchanged and everything falls back to Arial, which Areal is drawn from, so the page looks very nearly the same.
