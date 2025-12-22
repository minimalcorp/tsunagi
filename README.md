# Tsunagi (繋ぎ)

AI時代の統合開発マネージャー - Claude と人間のシームレスな協働開発を実現

## 概要

Tsunagiは、ソフトウェア開発の全フロー（要件定義 → 開発 → QA → リリース）を一元管理し、Claude（AI）と人間のタスク分担を可視化・自動化するローカル開発ツールです。

## 特徴

- **🔄 完全なフロー管理**: 要件定義からPR作成まで、開発プロセス全体をトラッキング
- **🤖 AI/人間の協働可視化**: 誰が何を担当しているか、進捗状況を一目で把握
- **📦 Dev Container統合**: ClaudeがDev Container内で直接作業、環境分離を実現
- **⚡ 並行タスク処理**: 複数タスクの同時進行で開発効率を最大化
- **🏠 ローカル完結**: Webサービス不要、ローカルマシンで完全に動作

## 開発フロー

```
1. 要件定義 → Claude がプラン作成
2. 開発     → Claude が Dev Container 内で実装
3. QA       → 人間が動作確認、必要に応じて差し戻し
4. リリース → 自動で git push & PR 作成
```

各フェーズで Claude ⇄ 人間 のバトンタッチが明確に管理されます。

## 使い方

```bash
# タスク作成
tsunagi task create "ログイン機能の実装"

# 開発開始（Claude に引き渡し）
tsunagi dev start

# QA（動作確認後）
tsunagi qa approve  # または tsunagi qa reject

# リリース
tsunagi release
```

## ユースケース

- **ソロ開発者**: AI を活用した高速開発
- **小規模チーム**: タスク管理と AI 協働の統合
- **プロトタイピング**: 要件から実装までの迅速な反復

## Requirements

- Docker（Dev Container用）
- Claude API access
- Git

---

**AI と人間の最適な協働で、開発をもっと速く、もっとスマートに。**
