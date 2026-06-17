#!/usr/bin/env node
/**
 * Generate apps/cli/npm-shrinkwrap.json for @minimalcorp/tsunagi.
 *
 * 目的 (サプライチェーン対策):
 *   package-lock.json は publish 時に必ず tarball から除外されるため、
 *   利用者の `npx @minimalcorp/tsunagi` / `npm i -g` では package.json の
 *   `^` レンジが「インストール時点の最新一致版」に解決されてしまう。
 *   汚染された patch/minor が自動で取り込まれる窓を塞ぐため、
 *   publish に含められる唯一のロックファイルである npm-shrinkwrap.json を
 *   同梱し、利用者側でも exact version + integrity ハッシュで固定する。
 *
 * 生成方式:
 *   このパッケージは npm workspaces の一員なので、apps/cli 内で直接
 *   `npm install` するとリポジトリ root の workspace として解決され、
 *   利用者が受け取る「単独インストール時のツリー」にならない。
 *   そこで一時ディレクトリに production 依存だけの package.json を複製し、
 *   workspace の外で `npm install --package-lock-only` を実行して
 *   単独インストール相当のツリーを解決する。生成された package-lock.json を
 *   npm-shrinkwrap.json として apps/cli/ に配置する。
 *
 *   - devDependencies は consumer install で入らないため除外する。
 *   - root .npmrc を引き継ぎ legacy-peer-deps 等の解決条件を揃える。
 *   - --ignore-scripts で生成中に install script を一切走らせない。
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const CLI_DIR = path.resolve(SCRIPTS_DIR, '..');
const REPO_ROOT = path.resolve(CLI_DIR, '..', '..');

function log(msg) {
  console.log(`[shrinkwrap] ${msg}`);
}

async function main() {
  const pkgRaw = await fs.readFile(path.join(CLI_DIR, 'package.json'), 'utf8');
  const pkg = JSON.parse(pkgRaw);

  // consumer install で入らない devDependencies / scripts は除外し、
  // 利用者が実際に受け取る production ツリーだけを解決対象にする。
  const prodPkg = { ...pkg };
  delete prodPkg.devDependencies;
  delete prodPkg.scripts;

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tsunagi-shrinkwrap-'));
  log(`temp dir: ${tmpDir}`);
  try {
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify(prodPkg, null, 2) + '\n');

    // legacy-peer-deps 等の解決条件を root .npmrc から引き継ぐ。
    const rootNpmrc = path.join(REPO_ROOT, '.npmrc');
    try {
      await fs.copyFile(rootNpmrc, path.join(tmpDir, '.npmrc'));
      log('copied root .npmrc');
    } catch {
      log('root .npmrc not found; proceeding without it');
    }

    log('resolving dependency tree (npm install --package-lock-only --omit=dev --ignore-scripts)');
    execFileSync(
      'npm',
      [
        'install',
        '--package-lock-only',
        '--omit=dev',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
      ],
      { cwd: tmpDir, stdio: 'inherit' }
    );

    const lockPath = path.join(tmpDir, 'package-lock.json');
    const lockRaw = await fs.readFile(lockPath, 'utf8');
    // 妥当性チェック: 解決ツリーが空でないこと。
    const lock = JSON.parse(lockRaw);
    const pkgCount = Object.keys(lock.packages || {}).length;
    if (pkgCount < 2) {
      throw new Error(`resolved tree looks empty (packages=${pkgCount})`);
    }
    log(`resolved ${pkgCount} package nodes`);

    const outPath = path.join(CLI_DIR, 'npm-shrinkwrap.json');
    await fs.writeFile(outPath, lockRaw);
    log(`wrote ${path.relative(REPO_ROOT, outPath)}`);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[shrinkwrap] failed:', err);
  process.exit(1);
});
