#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
// node-pty の prebuilt spawn-helper に実行権限を付与する。
//
// 背景: node-pty v1.1.0 の npm tarball は spawn-helper を mode 0644 で
// 出荷しているため、展開しただけでは実行できず、PTY 起動時に
// `posix_spawnp failed` で失敗する。node-pty 自身の post-install.js は
// chmod を行わない（undocumented な packaging bug）。
//
// 探索先は monorepo の2箇所に限定する:
//   1. <project-root>/node_modules/node-pty          (npm workspaces で hoist された場合)
//   2. <project-root>/apps/web/node_modules/node-pty (hoist されずに workspace local に置かれた場合)
//
// __dirname を起点にパスを決定するため、実行時の CWD が project root でも
// apps/web でも同じ結果になる。require.resolve の lookup walk により
// project root の外まで探索が漏れる事故を避けるため、手動パスで check している。
//
// TODO: node-pty >= 1.2.0 stable にアップグレード後は本スクリプトと
// apps/web/package.json の postinstall 呼び出しを削除できる。v1.2.0 以降の
// tarball は spawn-helper が mode 0755 で出荷されている (v1.2.0-beta.12 で確認済)。

const fs = require('node:fs');
const path = require('node:path');

// __dirname = <project-root>/apps/web/scripts
const WEB_PACKAGE_DIR = path.resolve(__dirname, '..'); // apps/web
const PROJECT_ROOT = path.resolve(WEB_PACKAGE_DIR, '..', '..'); // project root

function findNodePtyDir() {
  const candidates = [
    path.join(PROJECT_ROOT, 'node_modules', 'node-pty'),
    path.join(WEB_PACKAGE_DIR, 'node_modules', 'node-pty'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
  }
  return null;
}

function main() {
  const nodePtyDir = findNodePtyDir();
  if (!nodePtyDir) {
    console.warn(
      '[fix-node-pty-permissions] node-pty not found in project root or apps/web; skipping'
    );
    return;
  }

  const prebuildsDir = path.join(nodePtyDir, 'prebuilds');
  if (!fs.existsSync(prebuildsDir)) {
    return;
  }

  let fixed = 0;
  for (const platform of fs.readdirSync(prebuildsDir)) {
    const helper = path.join(prebuildsDir, platform, 'spawn-helper');
    if (!fs.existsSync(helper)) continue;
    try {
      fs.chmodSync(helper, 0o755);
      fixed++;
    } catch (err) {
      console.warn(`[fix-node-pty-permissions] chmod failed: ${helper}`, err);
    }
  }
  if (fixed > 0) {
    console.log(
      `[fix-node-pty-permissions] Fixed ${fixed} spawn-helper binaries at ${prebuildsDir}`
    );
  }
}

main();
