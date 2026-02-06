# monocore

**A minimalist all-in-one web application to unify your tasks, schedules, and projects into a single digital space.**

`monocore` は、散らばった日々の断片（タスク、資産、創作メモ、スケジュール）を一箇所に集約し、自分の支配下に置くための「Personal OS」です。
装飾を排した機能美と、生データへの直接的なアクセスを重視し、Linux端末を操作するような感覚で自分自身を管理することを目的としています。

---

## 🛠 Technology Stack

本プロジェクトは、ライブラリによる抽象化を避け、技術の仕組みを直接理解することを重視した「硬派」なスタックで構築されています。

### Frontend
- **Framework:** Next.js 15 (App Router / TypeScript)
- **Styling:** Tailwind CSS
- **UI Components:** shadcn/ui (Manual installation)
- **State Management:** React Server Components + Local State

### Backend & Database
- **BaaS:** Supabase
- **Database:** PostgreSQL
- **SDK:** `@supabase/ssr`
  - **Philosophy:** 開発効率とアプリロジックへの集中を優先し、Supabaseが提供するエコシステムを最大限に活用します。

### Dev Tools
- **Build Tool:** Vite / Next Build
- **Test:** Vitest (Unit Test)
- **Language:** TypeScript 5.x

---

## 🏗 Directory Structure (Mental Model)

各機能は「Unit」として独立しつつ、`monocore` という一枚岩（Monolith）を構成します。

- `/app`: アプリケーションのルーティングとServer Components
- `/components`: shadcn/ui を含む、機能美を追求したUIパーツ
- `/lib`: Supabaseクライアント（SSR対応）とユーティリティ
- `/types`: データベースのスキーマと同期した、手動定義の型定義

---

## 📜 Development Philosophy

1. **Everything is a Resource**
   タスクも、資産の推移も、メモも。すべては等しくリソースである。
2. **Form follows function**
   デザインは機能に従う。余計なアニメーションや装飾は排し、情報の密度と操作スピードを最大化する。
3. **Focus on App Logic**
   便利なSDK（@supabase/ssr）を全面的に採用し、ボイラープレートを最小限に抑え、アプリケーションの本質的なロジック実装に注力する。

## 🛠 開発ルール

### コミットメッセージのプレフィックス
履歴を追いやすくするため、以下のプレフィックスを使い分ける。

| プレフィックス | 内容 | 具体例 |
| :--- | :--- | :--- |
| **feat:** | 新機能の追加・仕様変更 | `feat: add search functionality to inventory list` |
| **fix:** | バグの修正 | `fix: resolve login error on mobile devices` |
| **refactor:** | コードの整理（挙動は変えない） | `refactor: simplify data fetching logic` |
| **docs:** | ドキュメントの修正 | `docs: add commit rules to README` |
| **chore:** | その他、設定や雑用 | `chore: update dependencies`, `chore: update .gitignore` |