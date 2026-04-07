#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
// node-pty の prebuilt spawn-helper に実行権限を付与する。
//
// npm workspaces の hoisting により node-pty は root の node_modules/ に
// 格納されることがあるため、require.resolve で実際のインストール先を
// 動的に解決する。hoist されていない場合も apps/web/node_modules/ から
// 解決できるので、単一のロジックで両方のケースをカバーできる。

const fs = require('node:fs');
const path = require('node:path');

function main() {
  let nodePtyPackageJson;
  try {
    nodePtyPackageJson = require.resolve('node-pty/package.json');
  } catch {
    // node-pty が未インストール（配布後の consumer では postinstall が
    // 走らない等）。警告のみ出して終了。
    console.warn('[fix-node-pty-permissions] node-pty not found; skipping');
    return;
  }

  const nodePtyDir = path.dirname(nodePtyPackageJson);
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
