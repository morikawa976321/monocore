# monocore

**A minimalist all-in-one web application to unify your tasks, schedules, and projects into a single digital space.**

`monocore` は、散らばった日々の断片（タスク、資産、創作メモ、スケジュール）を一箇所に集約し、自分の支配下に置くための「Personal OS」です。

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

## 📜 Development Philosophy

1. **Everything is a Resource**
   タスクも、資産の推移も、メモも。すべては等しくリソースである。
2. **Form follows function / Cognitive Load Minimization**
   デザインは機能に従う。余計なアニメーションや装飾は排し、情報の密度と操作スピードを最大化する。**認知負荷の最小化**を至上命題とする。
3. **Focus on App Logic**
   便利なSDK（@supabase/ssr）を全面的に採用し、ボイラープレートを最小限に抑え、アプリケーションの本質的なロジック実装に注力する。

## 🎨 UI/UX Requirements

視覚的ノイズと操作コストの最小化を追求する。

- **UIコンポーネントの最小化:** 画面上のボタン、メニュー、サイドバーを最小化（または隠蔽）。
- **アニメーションの抑制:** フェード、スライド等のアニメーションを最小化。
- **モーダル排除:** 同一プレーンでの完結を基本とし、モーダルウィンドウを極力排除する。
- **操作コスト低減:** クリック/タップ数の削減。

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
