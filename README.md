# monocore

**A minimalist all-in-one web application to unify your tasks, schedules, and knowledge into a single digital space.**

`monocore` は、散らばった日々の断片（タスク、資産、創作メモ、スケジュール）を一箇所に集約し、自分の支配下に置くための「Personal OS」です。

---

## 🛠 Technology Stack

本プロジェクトは、便利なSDKによる開発効率の最大化を図りつつも、UI表現においては一切の妥協を排し、機能美とスピードを追求した「硬派」なスタックで構築されています。

### Frontend
- **Framework:** Next.js 15 (App Router / TypeScript)
- **Styling:** Tailwind CSS (v4)
- **UI Components:** Custom Tailwind Components (Native elements & ARIA-first approach)
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
4. **開発速度を最優先する**
   個人開発の小規模アプリとして、意思決定は原則として実装速度と反復速度を最優先する。重大な品質リスクがない限り、過度な抽象化や過剰実装は避ける。

---

## 🚀 Database Management (Supabase)

データベースのスキーマ管理は Supabase CLI を使用して行います。

### マイグレーション状態の確認
ローカルとリモートの適用状況を一覧表示します。
```bash
npx supabase migration list
```

### マイグレーションの適用
#### ローカル開発環境
ローカルのDBに未適用分をすべて適用します。
```bash
npx supabase migration up
```

#### リモートプロジェクト (本番・ステージング)
リンク済みのリモートDBへ新規マイグレーションをプッシュします。
```bash
npx supabase db push
```

#### データベースのリセット
**（※注意：全データ削除）** ローカルDBを初期化し、全てのマイグレーションを最初から適用し直します。
```bash
npx supabase db reset
```

### 本番バックアップ（Linux最小運用）
本番DBを毎日バックアップし、必要時にローカルへ復元する最小構成の手順は以下を参照してください。

- `docs/supabase-backup.md`

---

## 🧪 Testing

### テストコードの構成
テストコードは**コロケーションスタイル**で統一し、コンポーネントやロジックのすぐ横に配置します。実装ファイルとテストファイルを近接させることで、変更時の影響範囲の把握とメンテナンスを容易にします。

- **命名規則:** `filename.test.ts` (または `filename.test.tsx`)
- **配置例:**
  - `src/utils/date.ts` に対するテスト → `src/utils/date.test.ts`
  - `src/components/Card.tsx` に対するテスト → `src/components/Card.test.tsx`

### 小規模個人開発におけるテスト方針
本プロジェクトでは、テスト対象を「手動での確認が難しい（または時間がかかる）領域」「不安が残りやすい変換ロジック」「壊れると影響が大きい重要挙動」に絞ります。  
一方で、単純なラッパー関数や手動確認が容易な部分は過剰にテストせず、実装速度と保守コストのバランスを優先します。

---

## 🎨 UI/UX Requirements


視覚的ノイズと操作コストの最小化を追求する。

- **UIコンポーネントの最小化:** 画面上のボタン、メニュー、サイドバーを最小化（または隠蔽）。
- **アニメーションの抑制:** フェード、スライド等のアニメーションを最小化。
- **モーダル排除:** 同一プレーンでの完結を基本とし、モーダルウィンドウを極力排除する。
- **操作コスト低減:** クリック/タップ数の削減。

## 🛠 開発ルール

### アイコン運用ルール
UIの統一感を維持するため、アイコンライブラリは `lucide-react` に統一します。

### コミットメッセージのプレフィックス
履歴を追いやすくするため、以下のプレフィックスを使い分ける。

| プレフィックス | 内容 | 具体例 |
| :--- | :--- | :--- |
| **feat:** | 新機能の追加・仕様変更 | `feat: add search functionality to inventory list` |
| **fix:** | バグの修正 | `fix: resolve login error on mobile devices` |
| **refactor:** | コードの整理（挙動は変えない） | `refactor: simplify data fetching logic` |
| **docs:** | ドキュメントの修正 | `docs: add commit rules to README` |
| **chore:** | その他、設定や雑用 | `chore: update dependencies`, `chore: update .gitignore` |
