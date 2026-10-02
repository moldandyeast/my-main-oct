#!/usr/bin/env node
// Checks the site before and after a deploy. No dependencies beyond Node.
//
//   node scripts/verify.mjs --local   offline checks only (run before deploying)
//   node scripts/verify.mjs           offline checks, then the live site
//
// Live checks resolve the hostname through 1.1.1.1 rather than your own resolver,
// which may still cache an NXDOMAIN from before the first deploy (same idea as
// `dig @1.1.1.1` + `curl --resolve`).

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import https from 'node:https';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url);
const read = p => readFileSync(new URL(p, root));
const sha256 = b => createHash('sha256').update(b).digest('hex');
const local = process.argv.includes('--local');

let failed = 0;
const ok = msg => console.log(`  ok    ${msg}`);
const bad = msg => { failed++; console.log(`  FAIL  ${msg}`); };
const check = (cond, msg) => (cond ? ok(msg) : bad(msg));

const html = read('public/index.html').toString('utf8');

// The executable code: every <script> except the JSON-LD metadata block.
const pieceJs = s => (s.match(/<script(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/g) || []).join('');
const creditLinks = [...(html.match(/<p class="colophon">[\s\S]*?<\/p>/) || [''])[0].matchAll(/href="([^"]+)"/g)].map(m => m[1]);
const built = existsSync(new URL('dist/index.html', root)) ? read('dist/index.html') : null;
const wrangler = read('wrangler.jsonc').toString('utf8');
const host = (wrangler.match(/^\s*\{ "pattern":\s*"([^"/]+)/m) || [])[1];

console.log('Offline');
check(sha256(pieceJs(html)) === read('scripts/piece-js.sha256').toString('utf8').trim(), 'piece JS matches scripts/piece-js.sha256');
check(!/<(script|img|iframe|video|audio|source|embed)\b[^>]*\bsrc=["']?(https?:)?\/\//i.test(html), 'no external src= attributes');
check(!/<link\b(?![^>]*\brel=["']?(canonical|me|alternate|help)\b)[^>]*\bhref=["']?(https?:)?\/\//i.test(html), 'no external stylesheets, icons or preloads');
check(!/@import|url\(\s*["']?(https?:)?\/\//i.test(html), 'no external CSS imports or url()');
check(!/fonts\.(googleapis|gstatic)\.com|cdn\.|unpkg\.com|jsdelivr/i.test(html), 'no font or CDN hosts mentioned');
check(creditLinks.length >= 2, `colophon has ${creditLinks.length} links`);
// Dinamo licence §10: the font must never be in this (public) repository, not even as base64.
let tracked = [];
try { tracked = execFileSync('git', ['ls-files'], { cwd: root.pathname }).toString().split('\n').filter(Boolean); } catch { }
check(!tracked.some(f => /\.(woff2?|ttf|otf|zip)$/i.test(f)), 'no font files tracked in git');
check(!tracked.some(f => existsSync(new URL(f, root)) && /data:font\/[\w-]+;base64,[A-Za-z0-9+/]{200}/.test(read(f).toString('latin1'))), 'no inlined font data in tracked files');
check(Boolean(built), 'dist/index.html built (npm run build)');
if (built) {
  const b = built.toString('utf8');
  check(sha256(pieceJs(b)) === sha256(pieceJs(html)), 'dist JS identical to public/index.html JS');
  if (/font-family: "ABC Areal"; src: url\(data:font\/woff2/.test(b)) ok(`dist inlines the ABC Areal subset (${(b.length / 1024).toFixed(0)} KB page)`);
  else console.log('  note  dist has no ABC Areal subset (fonts/ABCArealVariable.woff2 missing), so the Arial fallback applies');
}
for (const f of ['public/llms.txt', 'public/index.md', 'public/robots.txt', 'public/sitemap.xml', 'public/_headers']) check(existsSync(new URL(f, root)), `${f} exists`);
check(Boolean(host), `hostname in wrangler.jsonc: ${host}`);

function get(url, { ip, redirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lookup = ip && u.hostname === host ? (_h, opts, cb) => (opts && opts.all ? cb(null, [{ address: ip, family: 4 }]) : cb(null, ip, 4)) : undefined;
    const req = https.get(u, { lookup, headers: { 'user-agent': 'Mozilla/5.0 (verify.mjs; +https://github.com/moldandyeast/my-main-oct)', accept: '*/*' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(get(new URL(res.headers.location, u).href, { ip, redirects: redirects - 1 }));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), url: u.href }));
    });
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

if (!local) {
  console.log(`Live: https://${host}/`);
  const resolver = new Resolver();
  resolver.setServers(['1.1.1.1']);
  let ip;
  try { [ip] = await resolver.resolve4(host); ok(`1.1.1.1 resolves ${host} to ${ip}`); }
  catch (e) { bad(`1.1.1.1 cannot resolve ${host} (${e.code})`); }

  if (ip) {
    for (const [path, file] of [['/', 'dist/index.html'], ['/llms.txt', 'public/llms.txt'], ['/index.md', 'public/index.md'], ['/robots.txt', 'public/robots.txt'], ['/sitemap.xml', 'public/sitemap.xml']]) {
      try {
        const r = await get(`https://${host}${path}`, { ip });
        check(r.status === 200 && r.body.equals(read(file)), `${path} → ${r.status}, ${r.body.equals(read(file)) ? 'byte-identical to' : 'DIFFERS from'} ${file}`);
        if (path === '/') check(sha256(pieceJs(r.body.toString('utf8'))) === read('scripts/piece-js.sha256').toString('utf8').trim(), 'live piece JS matches scripts/piece-js.sha256');
      } catch (e) { bad(`${path}: ${e.message}`); }
    }
  }

  console.log('Colophon links');
  for (const href of creditLinks) {
    try { const r = await get(href, { ip }); check(r.status === 200, `${href} → ${r.status}${r.url !== href ? ` (via ${r.url})` : ''}`); }
    catch (e) { bad(`${href}: ${e.message}`); }
  }
}

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
