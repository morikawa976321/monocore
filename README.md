# monocore

**A minimalist Personal OS for schedules and inbox.**

`monocore` は、日々の予定・inbox を一箇所に集約し、自分の支配下に置くための Web アプリです。

---

## Features

| ルート | 役割 |
| :--- | :--- |
| `/schedules` | 予定の一覧・編集。日別メモ欄と inbox パネルを同居 |
| `/reports` | `mf/reports/` の読み取り専用ミラー |
| `/news` | RSS で集めた記事の一覧（ソース別。読み取り専用） |

実装が守る設計制約と、未決の論点は `docs/design.md`。

### Schedules（`/schedules`）

- 予定は行テキストで編集。日単位の版管理（`schedule_day_revisions`）で 2 デバイス間の上書きを防ぐ。
- 各日セクションに記法制約なしの自由記述メモ欄（`schedule_day_notes`）。taskbox が回収したら本文をクリアする。
- inbox パネルを同居。ラップトップ（＝AI 側）が寝ている間に成立する唯一のモバイル書き込み経路なので、独立ルートは持たせていない。

### News（`/news`）

- RSS で集めた記事を `published` の新しい順に並べ、ソース別に絞り込んで読む面。記事のリンクは別タブで開く。
- 収集は**このリポジトリの `scraper/`（Python）**が行う。タスクスケジューラが `pythonw.exe` で毎時 `run_once.py` を実行し、`link` 単位で upsert したあと保持期間（`scraper/config.json` の `max_age_days` = 8日）を過ぎた行を消す。取得先とブラックリストも `scraper/config.json`。
- 2026-08-14 に別リポジトリ `mf/news_scraping`（JSONL 保存 + LAN 内 Flask）から移設した（**移設元はローカル・GitHub とも削除済み**。以降このリポジトリ内の記述にある「旧 news_scraping」は、コードがそう書かれている理由の説明であって、参照先ではない）。**`articles` は既存の導出物3つと違い、消えても再生成できない**（RSS は過去記事を配らない）。詳細は「データの正と書き込み規約」。
- **スクレーパーは `service_role` キーを持つ。** 認証情報はリポジトリではなく `~/.monocore/config.json` の `envs.remote` から読む。

---

## Getting Started

```bash
npm install
npm run dev
```

`npm run dev` ではログイン画面を出さない。ローカル Supabase（`127.0.0.1`）なら開発ユーザーで自動ログインする。リモート DB を叩く場合は `.env.local` に `DEV_AUTH_EMAIL` と `DEV_AUTH_PASSWORD` を置く。ログイン画面を確認したいときは `DEV_AUTH_BYPASS=0`。本番は従来どおりログイン必須。

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

1. **Schedules-centered Personal OS**  
   予定（Schedules）を主画面とする。Inbox は予定ページ上の補助パネルであり、対等な独立ルートではない。Reports は専用ルートを持つ。
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
- **データ:** `src/lib/supabase/queries/` に集約（例: `schedules.ts`, `inboxes.ts`）。`page.tsx` で `supabase.from(...)` を直接書かない
- **状態:** `src/hooks/`
- **型:** `src/types/database.types.ts`（Supabase 生成型）を使う。`any` は避ける
- **認証ゲート:** `src/proxy.ts`（セッション更新・未ログイン時のリダイレクト）
- **`scraper/` だけ Python**（RSS 収集。Next.js のビルドには含まれない）。`requirements.txt` をリポジトリのルートに置かないこと — ルートの `requirements.txt` と `api/*.py` は Vercel の Python ランタイム自動検出の対象になる

詳細は `docs/directory_structure.md` を参照。

### データの正と書き込み規約

monocore は AI 活用基盤（context-engine / taskbox）の**人間向け窓口**であり、DB のテーブルは「人間が書いたもの」と「AI が投入した導出物」に分かれる。理由は `docs/design.md` §1。

| テーブル | 書き込み | 正の所在 |
| :--- | :--- | :--- |
| `schedules` | 画面 / AI スキル | monocore |
| `schedule_day_notes` / `schedule_day_revisions` | 画面 | monocore |
| `inboxes` | 画面（単一 TEXT blob） | monocore |
| `articles` | `service_role` のみ（`scraper/` が毎時投入） | **このDB自身** |

- **`articles` だけは「人間が書いたもの」でも「再生成できる導出物」でもない。** RSS は過去記事を配らないので、消えた記事は戻らない。保持は8日と決めたので失われうる最大値は「8日以内に読み逃した記事」であり、バックアップは持たない（2026-08-14・本人判断）。この分類がもう1つ増えるなら、そのとき改めて考える。
- **導出物に手入力欄を作らない。**
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

### 本番データの手動ダンプ / ローカル同期

本番 → ローカルのワンショット同期（取得・適用・検証）:

```powershell
.\scripts\backup\supabase_sync_prod_to_local.ps1
```

詳細は `docs/supabase-backup.md` を参照。

---

## Testing

テストは**コロケーション**（実装のすぐ横）で置きます。

- **命名:** `filename.test.ts` / `filename.test.tsx`
- **例:** `src/lib/date.ts` → `src/lib/date.test.ts`

**`npm test` は Vitest のあとに `scraper/` の pytest も回す**（`npm run test:py` で pytest だけ）。`scraper/.venv` が無いと失敗するので、先に venv を作って `requirements-dev.txt` を入れておく。

### 方針（小規模個人開発）

手動確認が難しい領域・壊れやすい変換ロジック・影響の大きい挙動に絞る。薄いラッパーや目視で足りる UI は過剰にテストしない。

言語の境界（Python → PostgREST の articles 行など）で手写しの型を突き合わせる検査は、**キー名の集合だけで書かない**。名前が同じで型だけ壊れる食い違い（配列かどうか・`null` 許容・オプショナル・素の型）を全部素通りさせる。実際の値から「配列か」「`None` か」「キーが欠けたか」「素の型は何か」を見るだけで足りる。「オプショナルの要否」だけは 1 回の実行では判定できず、そのメンバを出す全経路の観測を束ねて初めて言える。検出できないものは検査の docstring に明記する。

---

## UI/UX

視覚ノイズと操作コストを抑える。詳細なトークン規約は `README-design.md`。

- **ナビ:** デスクトップは左端の細いレールをホバーで展開。モバイルはハンバーガー（左下）
- **詳細・編集:** ページ内のインライン編集を基本とする
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
