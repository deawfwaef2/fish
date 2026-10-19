import { build } from 'esbuild';
import { readFile, writeFile, rename } from 'node:fs/promises';

// Build an entirely self-contained HTML. Never destroy the last playable copy
// until bundling succeeds: the temporary file is renamed atomically at the end.
const output = process.argv.includes('--index') ? 'index.html' : '3d-preview.html';
const template = await readFile('src/3d-template.html', 'utf8');
const result = await build({
  entryPoints: ['src/arena3d.js'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  write: false,
  logLevel: 'warning',
});
if (result.errors.length) throw new Error('Bundle failed');
const code = result.outputFiles[0].text.replaceAll('</script', '<\\/script');
if (!template.includes('/* INLINED_GAME_BUNDLE */')) throw new Error('Bundle placeholder missing');
// Function replacer avoids JS's $& / $' / $$ replacement tokens altering minified bundle text.
const html = template.replace('/* INLINED_GAME_BUNDLE */', () => code)
  .replace(/[ \t]+(?=\r?$)/gm, ''); // Vendor shader templates may contain trailing blanks.
const temp = `${output}.tmp`;
await writeFile(temp, html);
await rename(temp, output);
console.log(`${output}: ${(Buffer.byteLength(html) / 1024).toFixed(1)} KiB, self-contained and offline-ready`);
