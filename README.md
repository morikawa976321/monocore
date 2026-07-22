# monocore

**A minimalist Personal OS for schedules and inbox.**

`monocore` は、日々の予定と inbox を一箇所に集約し、自分の支配下に置くための Web アプリです。

---

## Getting Started

```bash
npm install
npm run dev
```

その他のスクリプト:

| コマンド | 内容 |
| :--- | :--- |
| `npm run build` | 本番ビルド |
| `npm start` | 本番サーバー起動 |
| `npm test` | Vitest（単発） |
| `npm run test:watch` | Vitest（ウォッチ） |
| `npm run lint` | ESLint |

ローカル開発には Supabase の環境変数（`.env.local`）が必要です。DB 操作は下記「Database Management」を参照。

---

## Technology Stack

便利な SDK で開発効率を上げつつ、UI では装飾を削ぎ、情報密度と操作スピードを優先しています。

### Frontend

- **Framework:** Next.js 16（App Router） / React 19 / TypeScript 6
- **Styling:** Tailwind CSS v4
- **UI:** カスタム Tailwind コンポーネント（ネイティブ要素 + ARIA 重視）
- **Theme:** `next-themes`（system / light / dark）
- **Icons:** `lucide-react` のみ

### Backend & Database

- **BaaS:** Supabase（Auth / Postgres / RLS）
- **SDK:** `@supabase/ssr` + `@supabase/supabase-js`
- **Philosophy:** ボイラープレートを抑え、アプリロジックに集中する

### Dev Tools

- **Test:** Vitest
- **Lint:** ESLint（`eslint-config-next`）

---

## Development Philosophy

1. **Everything is a Resource**  
   スケジュールも inbox も、等しくリソースとして扱う。
2. **Form follows function / Cognitive Load Minimization**  
   装飾的なアニメーションは排し、情報密度と操作スピードを最大化する。認知負荷の最小化を優先する。
3. **Focus on App Logic**  
   `@supabase/ssr` を全面採用し、認証・セッション周りのボイラープレートを最小化する。
4. **開発速度を最優先する**  
   個人開発の小規模アプリとして、重大な品質リスクがない限り、実装・反復の速さを優先する。

---

## Architecture（要約）

- **画面:** `src/app/`（URL = フォルダ）
- **UI:** `src/components/`（`layout/` / `ui/` / 機能別）
- **データ:** `src/lib/supabase/queries/` に集約。`page.tsx` で `supabase.from(...)` を直接書かない
- **状態:** `src/hooks/`
- **型:** `src/types/database.types.ts`（Supabase 生成型）を使う。`any` は避ける
- **認証ゲート:** `src/proxy.ts`（セッション更新・未ログイン時のリダイレクト）

詳細は `docs/directory_structure.md` を参照。

---

## Database Management (Supabase)

スキーマ管理は Supabase CLI で行います。

### マイグレーション状態の確認

```bash
npx supabase migration list
```

### マイグレーションの適用

#### ローカル

```bash
npx supabase migration up
```

#### リモート（本番・ステージング）

```bash
npx supabase db push
```

#### ローカル DB のリセット

**注意: 全データ削除。** ローカル DB を初期化し、全マイグレーションを再適用します。

```bash
npx supabase db reset
```

### 本番データの手動ダンプ

手順は `docs/supabase-backup.md` を参照。

---

## Testing

テストは**コロケーション**（実装のすぐ横）で置きます。

- **命名:** `filename.test.ts` / `filename.test.tsx`
- **例:** `src/lib/date.ts` → `src/lib/date.test.ts`

### 方針（小規模個人開発）

手動確認が難しい領域・壊れやすい変換ロジック・影響の大きい挙動に絞る。薄いラッパーや目視で足りる UI は過剰にテストしない。

---

## UI/UX

視覚ノイズと操作コストを抑える。詳細なトークン規約は `README-design.md`。

- **ナビ:** デスクトップは左端の細いレールをホバーで展開。モバイルはハンバーガー（左下）
- **詳細・編集:** 単一アイテムの閲覧・編集はセンターフォーカスのモーダルを優先（Esc / 外側クリックで閉じる）
- **装飾の抑制:** 装飾アニメーションは使わない。クリック数を減らす
- **デザイン:** Neutral + Amber（破壊操作のみ Red）。`shadow-*` 禁止。角丸は `rounded-sm` / `rounded` のみ

---

## 開発ルール

### アイコン

`lucide-react` に統一する。他パッケージからアイコンを入れない。

### コミットメッセージのプレフィックス

| プレフィックス | 内容 | 例 |
| :--- | :--- | :--- |
| **feat:** | 新機能・仕様変更 | `feat: add infinite scroll to schedules` |
| **fix:** | バグ修正 | `fix: preserve session cookies on auth redirect` |
| **refactor:** | 挙動を変えない整理 | `refactor: extract schedule text-format helpers` |
| **docs:** | ドキュメント | `docs: align README with current stack` |
| **chore:** | 設定・雑用 | `chore: update dependencies` |
