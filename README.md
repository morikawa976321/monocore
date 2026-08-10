# monocore

**A minimalist Personal OS for schedules, inbox, and projects.**

`monocore` は、日々の予定・inbox・プロジェクト板を一箇所に集約し、自分の支配下に置くための Web アプリです。

---

## Features

| ルート | 役割 |
| :--- | :--- |
| `/schedules` | 予定の一覧・編集。日別メモ欄と inbox パネルを同居 |
| `/projects` | プロジェクト板（ステータス別カード。自由記述メモ） |

実装が守る設計制約と、未決の論点は `docs/design.md`。

### Schedules（`/schedules`）

- 予定は行テキストで編集。日単位の版管理（`schedule_day_revisions`）で 2 デバイス間の上書きを防ぐ。
- 各日セクションに記法制約なしの自由記述メモ欄（`schedule_day_notes`）。taskbox が回収したら本文をクリアする。
- inbox パネルを同居。ラップトップ（＝AI 側）が寝ている間に成立する唯一のモバイル書き込み経路なので、独立ルートは持たせていない。

### Projects（`/projects`）

- カードは status（`active` / `waiting_user` / `waiting_other` / `dormant` / `done` の5値。DB上の定義）のうち、`done` は板から**アクセス経路自体を持たない**（取得段階で除外。開閉バー・件数・リンクいずれも無し。DBの行は残る）。`active` / `waiting_user` / `waiting_other` はそのまま表示、`dormant` は折りたたみ表示（2026-08-10・本人指示）。
- `project_cards` は画面からの手入力は不可（SELECT のみ）。正は context-engine / taskbox 側にあり、`scripts/upsert-project-cards.mjs` が service_role で slug 単位 upsert する。
- カードへの書き込みは自由記述メモ（`project_notes`、カード単位と板全体）。**追記専用**で、taskbox 側が回収したら `consumed_at` を埋める。選択肢式の `project_card_decision_answers` は 2026-08-05 に置き換え、2026-08-09 に drop した。

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
   スケジュールも inbox もプロジェクトカードも、等しくリソースとして扱う。
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
- **データ:** `src/lib/supabase/queries/` に集約（例: `schedules.ts`, `inboxes.ts`, `project-cards.ts`）。`page.tsx` で `supabase.from(...)` を直接書かない
- **状態:** `src/hooks/`
- **型:** `src/types/database.types.ts`（Supabase 生成型）を使う。`any` は避ける
- **認証ゲート:** `src/proxy.ts`（セッション更新・未ログイン時のリダイレクト）
- **Projects UI:** `src/app/projects/page.tsx` + `src/components/projects/`。カード投入は `scripts/upsert-project-cards.mjs`

詳細は `docs/directory_structure.md` を参照。

### データの正と書き込み規約

monocore は AI 活用基盤（context-engine / taskbox）の**人間向け窓口**であり、DB のテーブルは「人間が書いたもの」と「AI が投入した導出物」に分かれる。理由は `docs/design.md` §1。

| テーブル | 書き込み | 正の所在 |
| :--- | :--- | :--- |
| `schedules` | 画面 / AI スキル | monocore |
| `schedule_day_notes` / `schedule_day_revisions` | 画面 | monocore |
| `inboxes` | 画面（単一 TEXT blob） | monocore |
| `project_cards` | `service_role` のみ（投入スクリプト） | **context-engine / taskbox** |
| `project_notes` | `authenticated` のみ（追記専用） | monocore → taskbox が回収 |

- **導出物に手入力欄を作らない。** `project_cards` は消えても再生成できるものとして扱う。
- **`replace_*` 系 RPC を新規に使わない。** 空配列で実データを消した事故があるため、投入は slug 単位の upsert にする。既存の `replace_schedules_for_day` / `replace_schedules_for_day_as` は日単位の全置換なので、呼ぶ前にローカルバックアップを取る。
- **AI が書いた行は `updated_by = 'agent'`** で識別する（現状 schedules のみ。UI 表示は未実装）。
- **AI の書き込みは read→modify→write を 1 操作で行い、`updated_at` 不一致なら再読込する**（2 デバイス編集の競合対策）。
- **認証情報（ID / パスワード等）を DB に置かない。** `service_key` は RLS を迂回するため、inbox を読む AI セッションは自動的に全行を読む。

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
