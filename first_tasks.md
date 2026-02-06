# monocore: 最小構成構築ロードマップ

このドキュメントは、`monocore` プロジェクトをゼロから立ち上げ、DB接続を確認できる最小構成のアプリを起動するまでの手順を記したものである。

## 🎯 最終目標
- Next.js 15 が正常に起動すること
- Supabase (PostgreSQL) に対して生SQL（`pg`）で接続し、現在時刻を取得・表示できること

---

## 📋 フェーズ1: プロジェクトの初期化

- [ ] **Next.js プロジェクトの作成**
  - インタラクティブプロンプトで以下を選択する：
    - Project name: `monocore`
    - TypeScript: `Yes`
    - ESLint: `Yes`
    - Tailwind CSS: `Yes`
    - `src/` directory: `No` (ミニマルにルート直下 app 構造を採用)
    - App Router: `Yes`
    - Turbopack: `Yes` (または任意)
    - Import alias: `Yes` (`@/*`)

- [ ] **不要ファイルの徹底削除**
  - デモ用の不要な資産を削除し、プロジェクトを「空」にする：
    - `public/` 内の画像ファイル
    - `app/globals.css` の中身（Tailwindの基本設定以外を削除）
    - `app/page.tsx` のデモ用マークアップを削除し、"Hello monocore" だけにする

- [ ] **基本ドキュメントと規約の配置**
  - [ ] `README.md` の作成（以前作成したソースを配置）
  - [ ] `LICENSE` の作成 (MIT License)
  - [ ] `.gitignore` の確認（`.env*.local` が含まれているか）

---

## 📋 フェーズ2: 道具（ツール）のインストール

- [ ] **データベース関連ツールの導入**
  ```bash
  npm install pg
  npm install -D @types/pg