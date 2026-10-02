#!/usr/bin/env node
// public/ → dist/. Wrangler runs this before every `wrangler deploy` / `wrangler dev`.
//
// If fonts/ABCArealVariable.woff2 exists, it is subset to the codepoints the page uses and
// inlined as base64 in @font-face, so the deployed page stays one self-contained file.
// The font is never committed: Dinamo's licence (§10) forbids fonts in public repositories.
// Without it, dist/ is a plain copy and the page falls back to Arial.
//
// Subsetting needs python3 with fonttools and brotli: pip3 install fonttools brotli

import { readFileSync, writeFileSync, existsSync, rmSync, cpSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const FONT = join(root, 'fonts', 'ABCArealVariable.woff2');
const MARKER = /\/\*@font-face ABC Areal:[^*]*\*\//;

rmSync(join(root, 'dist'), { recursive: true, force: true });
cpSync(join(root, 'public'), join(root, 'dist'), { recursive: true });

const htmlPath = join(root, 'dist', 'index.html');
const html = readFileSync(htmlPath, 'utf8');
if (!MARKER.test(html)) throw new Error('build: @font-face marker missing from public/index.html');

if (!existsSync(FONT)) {
  console.warn('build: fonts/ABCArealVariable.woff2 not found, so dist/ uses the Arial fallback (see fonts/README.md)');
  process.exit(0);
}

// Every character in the file: text, labels the canvas draws from JS strings, the studio docs.
const codepoints = [...new Set([...html].map(c => c.codePointAt(0)))].filter(cp => cp >= 0x20).sort((a, b) => a - b);
const tmp = mkdtempSync(join(tmpdir(), 'areal-'));
const out = join(tmp, 'areal-subset.woff2');
execFileSync('python3', ['-m', 'fontTools.subset', FONT,
  '--unicodes=' + codepoints.map(cp => cp.toString(16)).join(','),
  '--layout-features=kern,liga,clig,calt,ccmp,locl,mark,mkmk,case,tnum,lnum,pnum,frac,numr,dnom',
  '--name-IDs=*', '--name-languages=*', '--notdef-outline',
  '--flavor=woff2', '--output-file=' + out], { stdio: 'inherit' });
const font = readFileSync(out);
rmSync(tmp, { recursive: true, force: true });

const face = `@font-face { font-family: "ABC Areal"; src: url(data:font/woff2;base64,${font.toString('base64')}) format("woff2"); font-weight: 400 700; font-style: normal; font-display: swap; } /* ABC Areal by Dinamo Typefaces GmbH, https://abcdinamo.com/typefaces/areal, free fonts licence (not redistributable) */`;
writeFileSync(htmlPath, html.replace(MARKER, () => face));
console.log(`build: inlined ABC Areal subset, ${codepoints.length} codepoints, ${(font.length / 1024).toFixed(1)} KB woff2`);
