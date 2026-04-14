import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT_DIR = new URL('../out', import.meta.url).pathname;

// Default locale pages already have the correct lang="en" from root layout,
// so only non-default locales need patching.
const LOCALES = ['ja'];

async function collectHtmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectHtmlFiles(full)));
    } else if (entry.name.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

let totalFixed = 0;

for (const locale of LOCALES) {
  const localeDir = join(OUT_DIR, locale);
  let files;
  try {
    files = await collectHtmlFiles(localeDir);
  } catch {
    console.log(`Skipping locale "${locale}" — directory not found`);
    continue;
  }

  let count = 0;
  for (const file of files) {
    const html = await readFile(file, 'utf8');
    const updated = html.replace('<html lang="en"', `<html lang="${locale}"`);
    if (updated !== html) {
      await writeFile(file, updated);
      count++;
    }
  }
  console.log(`[fix-html-lang] ${locale}: patched ${count}/${files.length} files`);
  totalFixed += count;
}

console.log(`[fix-html-lang] Done — ${totalFixed} file(s) updated`);
