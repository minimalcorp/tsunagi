/**
 * Patch Prisma 7 generated client files to add `.js` extensions to relative imports.
 *
 * Why: Prisma 7.6 の `prisma-client` generator は ESM 前提 (`import.meta.url` を
 * 使用) で .ts を生成するが、相対 import に `.js` 拡張子を付けないため
 * `moduleResolution: nodenext` + `"type": "module"` 環境では型解決に失敗し、
 * `@ts-nocheck` の影響で型エラーが握りつぶされて全てが `any` になる。
 *
 * This script rewrites every relative `import`/`export` specifier in
 * `generated/prisma/**\/*.ts` to append `.js`, making the files valid for
 * NodeNext resolution. It is intentionally idempotent.
 *
 * 呼び出し元: `db:generate` npm script (prisma generate 直後に実行)。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = path.resolve(THIS_DIR, '..', 'src', 'generated', 'prisma');

// Matches `from '...'` / `from "..."` specifiers that are relative (start with
// `./` or `../`) and do NOT already end with `.js` / `.mjs` / `.cjs` / `.json`.
// Only quoted string literals are matched so comments / template literals are
// untouched.
const IMPORT_RE = /(\bfrom\s*['"])(\.\.?\/[^'"]*?)(['"])/g;

function patchFile(filePath: string): boolean {
  const original = fs.readFileSync(filePath, 'utf8');
  const patched = original.replace(IMPORT_RE, (match, prefix, spec, suffix) => {
    if (/\.(js|mjs|cjs|json)$/.test(spec)) return match;
    return `${prefix}${spec}.js${suffix}`;
  });
  if (patched !== original) {
    fs.writeFileSync(filePath, patched, 'utf8');
    return true;
  }
  return false;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(p));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(p);
    }
  }
  return out;
}

function main(): void {
  if (!fs.existsSync(GENERATED_DIR)) {
    console.error(`[patch-prisma-generated] No generated dir at ${GENERATED_DIR}`);
    process.exit(1);
  }

  const files = walk(GENERATED_DIR);
  let changed = 0;
  for (const file of files) {
    if (patchFile(file)) changed += 1;
  }
  console.log(`[patch-prisma-generated] patched ${changed}/${files.length} file(s)`);
}

main();
