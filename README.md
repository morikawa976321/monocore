# monocore

**A minimalist Personal OS for schedules, inbox, and projects.**

`monocore` は、日々の予定・inbox・プロジェクト板を一箇所に集約し、自分の支配下に置くための Web アプリです。

---

## Features

| ルート | 役割 |
| :--- | :--- |
| `/schedules` | 予定の一覧・編集。日別メモ欄と inbox パネルを同居 |
| `/projects` | プロジェクト板（目標別カード。読み取り専用） |
| `/reports` | `mf/reports/` の読み取り専用ミラー |
| `/news` | RSS で集めた記事の一覧（ソース別。読み取り専用） |
| `/drain` | taskbox drain の実行記録（1枠=1カード。読み取り専用） |

実装が守る設計制約と、未決の論点は `docs/design.md`。

### Schedules（`/schedules`）

- 予定は行テキストで編集。日単位の版管理（`schedule_day_revisions`）で 2 デバイス間の上書きを防ぐ。
- 各日セクションに記法制約なしの自由記述メモ欄（`schedule_day_notes`）。taskbox が回収したら本文をクリアする。
- inbox パネルを同居。ラップトップ（＝AI 側）が寝ている間に成立する唯一のモバイル書き込み経路なので、独立ルートは持たせていない。

### Projects（`/projects`）

- カードは status（`active` / `waiting`（トリガー待ち）/ `dormant` / `done` の4値。DB上の定義）のうち、`done` は板から**アクセス経路自体を持たない**（取得段階で除外。開閉バー・件数・リンクいずれも無し。DBの行は残る）。`active` / `waiting` はそのまま表示、`dormant` は折りたたみ表示（2026-08-10・本人指示）。
- `project_cards` は画面からの手入力は不可（SELECT のみ）。正は context-engine / taskbox 側にあり、`scripts/upsert-project-cards.mjs` が service_role で slug 単位 upsert する。
- **板は読むだけの面である**（2026-08-11確定）。カードが伝えるのは ①状態 ②経過（`progress`）③次の一手（`next_actions`）の3点だけ。
  - **②③は主体ではなく時間軸で切る**（2026-08-12・本人指示）。見出しは「AIがやったこと」「あなたの番」から「経過」「次の一手」へ、列名は `ai_recent` / `your_turn` から改名した。行為主体が誰かは本質的な情報ではなく、実際 `ai_recent` には本人の行為（購入の実行など）が書かれていた。ただし**次の一手に載せるのは本人の行動になるものだけ**という基準は残る（AIの作業予定を書く欄ではない。それは2026-08-11に `ai_next` として廃止した）。判断ログは context-engine の `card-fields-time-axis-not-actor`。判断の問い（`decisions`）・AIの次の一手（`ai_next`）・自由記述メモ（`project_notes`）は同日に廃止した — 反映が1日4回・非同期という制約のもとでは、板で判断を返すより**セッションを開いた方が速い**と本人が判断したため。`waiting_user` / `waiting_other` を `waiting` に統合したのも同根で、実質のボトルネックは常に本人なので「誰を待っているか」の区別が行動を変えない。
  - 判断ログは context-engine の `board-decision-io-abolished` / `actor-distinction-useless-when-user-is-the-bottleneck`（決定の理由と一般則）。実施内容はこのリポジトリの `20260811145700_simplify_project_cards.sql` とその周辺コミット。選択肢式の `project_card_decision_answers` は 2026-08-05 に自由記述へ置き換え、2026-08-09 に drop 済み。

### News（`/news`）

- RSS で集めた記事を `published` の新しい順に並べ、ソース別に絞り込んで読む面。記事のリンクは別タブで開く。
- 収集は**このリポジトリの `scraper/`（Python）**が行う。タスクスケジューラが `pythonw.exe` で毎時 `run_once.py` を実行し、`link` 単位で upsert したあと保持期間（`scraper/config.json` の `max_age_days` = 8日）を過ぎた行を消す。取得先とブラックリストも `scraper/config.json`。
- 2026-08-14 に別リポジトリ `mf/news_scraping`（JSONL 保存 + LAN 内 Flask）から移設した（**移設元はローカル・GitHub とも削除済み**。以降このリポジトリ内の記述にある「旧 news_scraping」は、コードがそう書かれている理由の説明であって、参照先ではない）。**`articles` は既存の導出物3つと違い、消えても再生成できない**（RSS は過去記事を配らない）。詳細は「データの正と書き込み規約」。
- **スクレーパーは `service_role` キーを持つ。** 認証情報はリポジトリではなく `~/.monocore/config.json` の `envs.remote` から読む。

### Drain（`/drain`）

- taskbox の drain は 1 日 4 枠（01/07/13/19 時）で無人稼働している。その結果を**尋ねずに**読むための面。1 枠 = 1 カードで、各カードは「何をして／どうなったか」の組を並べる。
- **起動しなかった枠・使用量制限で死んだ枠も 1 行残る。** 「静かだったのか、動かなかっただけなのか」が一覧で判別できることがこの面の要件（drain.log は 7 日で消えるため、ここが実質のアーカイブになる）。
- **投入は `taskbox/drain.ps1` が直接行う（LLM の自己申告を経由しない）**。組の材料は 3 つとも既にあるものだけを使う: ①ラッパーが持つ機械値（起動理由・exit・マーカー・バックアップ・件数の前後差）②`taskbox/traces/<task-id>.json` の `steps[]`（`desc`=何をして / `note`=どうなったか）③セッションの最終報告の全文（カードを開いたときだけ取得）。
- 投入スクリプトは `scripts/upsert-drain-run.mjs`（検証・整形の純関数は `scripts/drain-run-payload.mjs`）。キーは `started_at` で slug 単位 upsert と同じく行を消さない。

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

1. **Schedules-centered Personal OS**  
   予定（Schedules）を主画面とする。Inbox は予定ページ上の補助パネルであり、対等な独立ルートではない。Projects / Reports はそれぞれ専用ルートを持つ。
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
- **`scraper/` だけ Python**（RSS 収集。Next.js のビルドには含まれない）。`requirements.txt` をリポジトリのルートに置かないこと — ルートの `requirements.txt` と `api/*.py` は Vercel の Python ランタイム自動検出の対象になる

詳細は `docs/directory_structure.md` を参照。

### データの正と書き込み規約

monocore は AI 活用基盤（context-engine / taskbox）の**人間向け窓口**であり、DB のテーブルは「人間が書いたもの」と「AI が投入した導出物」に分かれる。理由は `docs/design.md` §1。

| テーブル | 書き込み | 正の所在 |
| :--- | :--- | :--- |
| `schedules` | 画面 / AI スキル | monocore |
| `schedule_day_notes` / `schedule_day_revisions` | 画面 | monocore |
| `inboxes` | 画面（単一 TEXT blob） | monocore |
| `project_cards` | `service_role` のみ（投入スクリプト） | **context-engine / taskbox** |
| `drain_runs` | `service_role` のみ（`drain.ps1` が毎run投入） | **taskbox** |
| `articles` | `service_role` のみ（`scraper/` が毎時投入） | **このDB自身** |

- **`articles` だけは「人間が書いたもの」でも「再生成できる導出物」でもない。** RSS は過去記事を配らないので、消えた記事は戻らない。保持は8日と決めたので失われうる最大値は「8日以内に読み逃した記事」であり、バックアップは持たない（2026-08-14・本人判断）。この分類がもう1つ増えるなら、そのとき改めて考える。
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

**`scraper/` は pytest で別に回す。** `npm test`（Vitest）は Python のテストを拾いません。

```bash
cd scraper && .venv\Scripts\python.exe -m pytest -q
```

### 方針（小規模個人開発）

手動確認が難しい領域・壊れやすい変換ロジック・影響の大きい挙動に絞る。薄いラッパーや目視で足りる UI は過剰にテストしない。

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
