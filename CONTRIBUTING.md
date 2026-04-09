# Contributing to Tsunagi

Tsunagi へのコントリビューションに興味を持っていただきありがとうございます。

## ライセンスと CLA について

Tsunagi は [PolyForm Shield License 1.0.0](./LICENSE) のもとで公開されている source-available ソフトウェアです。これは OSI 承認の OSS ライセンスではなく、競合製品化を禁止する制限付きライセンスです。

コントリビュートされたコードは、Tsunagi の今後のライセンス変更・商用利用・有償版への組み込み等に使用される可能性があります。そのため、外部コントリビューターの方には Pull Request を送信する際に **Contributor License Agreement (CLA)** への同意をお願いしています。

PRを開くと [CLA Assistant](https://cla-assistant.io/) bot が自動的にコメントし、署名フローを案内します。未署名のPRはマージされません。

## バグ報告・機能提案

[GitHub Issues](https://github.com/minimalcorp/tsunagi/issues) に起票してください。以下の情報があると助かります:

- 再現手順
- 期待される動作と実際の動作
- 環境情報（OS、Node.js バージョン、Claude Code CLI バージョン）
- 可能であれば最小再現コード

## 開発環境のセットアップ

### 前提条件

- Node.js 20+
- Git
- Claude Code CLI（`claude` コマンドが PATH 上に必要）
- macOS または Linux

### セットアップ

```bash
git clone https://github.com/minimalcorp/tsunagi.git
cd tsunagi
npm ci
cp .env.example .env.local
# .env.local に ANTHROPIC_API_KEY を設定
npm run dev
```

ブラウザで `http://localhost:2791` を開きます。

## Pull Request の流れ

1. Issue を起票し、取り組みたい内容を共有してください（軽微な修正を除く）
2. ブランチを切ります: `feat/your-feature` / `fix/your-bug`
3. 変更後、ローカルで以下を全てパスさせてください:
   ```bash
   npm run format
   npm run lint
   npm run type-check
   npm run build
   ```
4. PR を開いてください
5. CLA Assistant bot の指示に従って CLA に署名してください
6. レビューを受けて、必要に応じて修正してください

## コーディング規約

- **Prettier** と **ESLint** の設定に従ってください（`npm run format` / `npm run lint`）
- **TypeScript** の型を省略せず、`any` は避けてください
- UI 実装は [docs/design-principles.md](./docs/design-principles.md) に従ってください
- コミットメッセージは `feat:` / `fix:` / `refactor:` / `docs:` 等の prefix を付けてください

## 行動規範

他のコントリビューターへの敬意を忘れず、建設的な議論を心がけてください。ハラスメント・差別的な言動は許容されません。
