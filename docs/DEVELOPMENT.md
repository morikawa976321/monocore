# monocore 開発ガイド

> 外から読む人向けの案内はリポジトリ直下の [README.md](../README.md)。この文書は開発を続けるための詳細。

**A minimalist Personal OS for schedules and inbox.**

`monocore` は、日々の予定・inbox を一箇所に集約し、自分の支配下に置くための Web アプリです。

---

## Features

| ルート | 役割 |
| :--- | :--- |
| `/schedules` | 予定の一覧・編集。日別メモ欄と、Inbox のモーダルを同居。日カードの見出しに睡眠・非自由・自由の3色の帯 |
| `/weather` | 指定した地点（テーブル `weather_locations` の先頭の1件。`sort_order` が最小、同点は作った順。ブラウザが読む。行が無ければ東京駅）の1時間ごとの天気（今の時刻から明日の終わりまで）と14日間の週間予報（読み取り専用） |
| `/reports` | `mf/reports/` の読み取り専用ミラー |
| `/news` | RSS で集めた記事の一覧（ソース別。読み取り専用） |

実装が守る設計制約と、未決の論点は `docs/design.md`。

### Schedules（`/schedules`）

- 予定は行テキストで編集。日単位の版管理（`schedule_day_revisions`）で 2 デバイス間の上書きを防ぐ。
- 各日セクションに記法制約なしの自由記述メモ欄（`schedule_day_notes`）。本人が読んで使う（回収してクリアする自動の主体は無い）。
- inbox パネルを同居。ラップトップ（＝AI 側）が寝ている間に成立する唯一のモバイル書き込み経路なので、独立ルートは持たせていない。
- 日カードの見出しの3色の帯（睡眠・非自由・自由）は予定から導出する。睡眠は日をまたいで「消灯の終わりから次の起床まで」で数える。数え方は `src/lib/schedules/free-time.ts`、形式的な定義とテストの方針は `docs/free-time-model.md`、規則の由来は `docs/decisions.md`。

### Weather（`/weather`）

- 時刻・天気・気温・降水確率・降水量・降雪量・湿度・風向風速を1時間ごとに、日ごとに区切った縦の表で出す。日の出・日の入りはその時刻の行の直後に1行差し込む。横スクロールはさせない（モバイル 375px で8列が収まる）。
- データは Open-Meteo（キー不要・CORS 許可）をブラウザから直接取る。DB もジョブも持たない。tenki.jp は利用規約がブラウザ以外での取得を禁じるので使わない。予報の計算元が違うため、tenki.jp と天気・気温が一致しない時間がある。
- 週間予報は今日から14日、日付・天気・最高/最低気温・降水確率・降水量。デスクトップ（lg 以上）は1時間ごとの表の右に並べ、モバイルはその下に積む。天気の「晴のち曇」「曇時々晴」は Open-Meteo の日ごとのコード（その日で最も悪い1つ）ではなく、1時間ごとのコードから組み立てる。祝日は `@holiday-jp/holiday_jp`（データを同梱。祝日法が変わったらパッケージを更新する）。
- 取得と行の組み立ては `src/lib/weather/forecast.ts`、週間予報は `src/lib/weather/weekly.ts`。

### News（`/news`）

- RSS で集めた記事を `published` の新しい順に並べ、ソース別に絞り込んで読む面。記事のリンクは別タブで開く。
- 収集は**このリポジトリの `scraper/`（Python）**が行う。タスクスケジューラが `pythonw.exe` で毎時 `run_once.py` を実行し、`link` 単位で upsert したあと保持期間（`scraper/config.json` の `max_age_days` = 8日）を過ぎた行を消す。取得先とブラックリストも `scraper/config.json`。
- 2026-08-14 に別リポジトリ `mf/news_scraping`（JSONL 保存 + LAN 内 Flask）から移設した（**移設元はローカル・GitHub とも削除済み**。以降このリポジトリ内の記述にある「旧 news_scraping」は、コードがそう書かれている理由の説明であって、参照先ではない）。**`articles` は導出物（`reports`）と違い、消えても再生成できない**（RSS は過去記事を配らない）。詳細は「データの正と書き込み規約」。
- **スクレーパーは `service_role` キーを持つ。** 認証情報はリポジトリではなく `~/.monocore/config.json` の `envs.remote` から読む。

---

## Getting Started

```bash
npm install
npm run dev
```

`npm run dev`（Vite。`http://localhost:3000`）ではログイン画面を出さない。ローカル Supabase（`127.0.0.1`）なら開発ユーザーで自動ログインする。リモート DB を叩く場合は `.env.local` に `VITE_DEV_AUTH_EMAIL` と `VITE_DEV_AUTH_PASSWORD` を置く。ログイン画面を確認したいときは `VITE_DEV_AUTH_BYPASS=0`。本番は従来どおりログイン必須。自動ログインは `AuthGate`（`src/components/auth/AuthGate.tsx`）が、セッションが無いときに `import.meta.env.DEV` の中でだけ行い（`src/lib/auth/dev-login.ts`）、入れたらそのページを読み込み直す（元のページに残る）。本番ビルドには入らない（`npm run build` のあと `dist` を grep して確かめる: `DEV_AUTH`・`local-dev-password`）。`.env.local` の `VITE_*` は `vite build` も読むので、`VITE_DEV_AUTH_*` を Vercel の環境変数には置かない。

環境変数は `VITE_SUPABASE_URL` と `VITE_SUPABASE_PUBLISHABLE_KEY`（`.env.example`。以前の `NEXT_PUBLIC_*` から名前が変わった）。Vercel の環境変数にも同じ名前で設定する。

その他のスクリプト:

| コマンド | 内容 |
| :--- | :--- |
| `npm run build` | 型チェックと本番ビルド（`dist`） |
| `npm run preview` | ビルドした `dist` を手元で配信して確かめる |
| `npm test` | Vitest（単発）のあと `scraper/` の pytest（下記「Testing」） |
| `npm run test:py` | `scraper/` の pytest だけ |
| `npm run test:watch` | Vitest（ウォッチ） |
| `npm run lint` | ESLint |

ローカル開発には Supabase の環境変数（`.env.local`）が必要です。DB 操作は下記「Database Management」を参照。

---

## Technology Stack

便利な SDK で開発効率を上げつつ、UI では装飾を削ぎ、情報密度と操作スピードを優先しています。

### Frontend

- **Framework:** React 19 / TypeScript 6 / Vite 8（静的 SPA。サーバーは静的ファイルを返すだけ。`docs/spa-migration.md`）
- **Router:** 自前（History API。`src/lib/router/`、ルート表は `src/router.tsx`）
- **Styling:** Tailwind CSS v4（`@tailwindcss/vite`）
- **UI:** カスタム Tailwind コンポーネント（ネイティブ要素 + ARIA 重視）
- **Theme:** `next-themes`（system / light / dark。React だけで動く。描画前の dark クラスは `index.html` のスクリプトが付ける）
- **Fonts:** 自己ホスト（`public/fonts/`、定義は `src/app/fonts.css`。Geist・Geist Mono・Noto Sans JP。出どころと作り方は `docs/spa-migration.md`）
- **Icons:** `lucide-react` のみ

### Backend & Database

- **BaaS:** Supabase（Auth / Postgres / RLS）
- **SDK:** `@supabase/supabase-js`（ブラウザから直接。セッションは localStorage、PKCE）
- **Philosophy:** ボイラープレートを抑え、アプリロジックに集中する

### Dev Tools

- **Test:** Vitest（TypeScript）＋ pytest（`scraper/`）
- **Lint:** ESLint（typescript-eslint + react-hooks の flat config）

---

## Development Philosophy

1. **Schedules-centered Personal OS**  
   予定（Schedules）を主画面とする。Inbox は予定ページ上の補助パネルであり、対等な独立ルートではない。Reports は専用ルートを持つ。
2. **Form follows function / Cognitive Load Minimization**  
   装飾的なアニメーションは排し、情報密度と操作スピードを最大化する。認知負荷の最小化を優先する。
3. **Focus on App Logic**  
   `supabase-js` を素のまま使い、認証・セッション周りのボイラープレートを最小化する。
4. **開発速度を最優先する**  
   個人開発の小規模アプリとして、重大な品質リスクがない限り、実装・反復の速さを優先する。

---

## Architecture（要約）

- **画面:** `src/app/**/page.tsx`（default export）。URL との対応は `src/router.tsx` のルート表（1 画面 1 行。新しい画面は足す）。ルート表に無いパスは NotFound
- **UI:** `src/components/`（`layout/` / `ui/` / 機能別）
- **データ:** `src/lib/supabase/queries/` に集約（例: `schedules.ts`, `inboxes.ts`）。`page.tsx` で `supabase.from(...)` を直接書かない
- **状態:** `src/hooks/`
- **型:** `src/types/database.types.ts`（Supabase 生成型）を使う。`any` は避ける
- **認証ゲート:** サーバーの門番は無い（静的ファイルを返すだけ）。`src/components/auth/AuthGate.tsx` がブラウザ側で、全画面について未ログインを `/login` へ送る。HTML にデータは無く、データは RLS で守られたブラウザからの直接取得なので、未ログインで画面の枠が見えても読めるものは無い。**ブラウザに置いたデータ（localStorage のレポート本文など）をゲートの確認より先に出す画面は、自分で `getSession` を確かめてから出す**（`/reports/[slug]`）。`/auth/callback` はゲートの対象外（コードの交換が終わるまでセッションが無いため）。理由と経緯は `docs/decisions.md`
- **`scraper/` だけ Python**（RSS 収集。フロントのビルドには含まれない）。`requirements.txt` をリポジトリのルートに置かないこと — ルートの `requirements.txt` と `api/*.py` は Vercel の Python ランタイム自動検出の対象になる

詳細は `docs/directory_structure.md` を参照。

### データの正と書き込み規約

monocore は AI 活用基盤（context-engine）の**人間向け窓口**であり、DB のテーブルは「人間が書いたもの」と「AI が投入した導出物」に分かれる。理由は `docs/design.md` §1。

| テーブル | 書き込み | 正の所在 |
| :--- | :--- | :--- |
| `schedules` | 画面 / AI スキル | monocore |
| `schedule_day_notes` / `schedule_day_revisions` | 画面 | monocore |
| `inboxes` | 画面（単一 TEXT blob） | monocore |
| `finance_events` | 画面（`/finance`。計画イベント） | monocore |
| `finance_measurements` | 画面（`/finance`。月末の Cash・NISA 実測） | monocore |
| `weather_locations` | 本人が SQL エディタか `service_role` のスクリプトで入れる。どちらも `auth.uid()` が NULL なので **`user_id` を明示する**（省略すると `23502`。`docs/database.md` §1）。画面は未実装。`/weather` が先頭の1件（`sort_order` 最小、同点は作った順）を読む。複数地点の切り替えの画面は無い(monocore#5) | monocore |
| `reports` | `service_role` のみ（`scripts/upsert-reports.mjs` が `mf/reports/*.md` を HTML にして upsert。ops-daily の `sync-reports.ps1` が毎日呼ぶ） | `mf/reports/` |
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

対象を指定しないとローカルを見ます。本番と比べるときは `--remote` を付けます。

```bash
npx supabase migration list --remote
```

### マイグレーションの適用

#### ローカル

```bash
npx supabase migration up
```

#### リモート（本番・ステージング）

`--remote` が無いとローカルへ当たります。先に `--dry-run` で差分を見ます。

```bash
npx supabase db push --remote --dry-run
npx supabase db push --remote --yes
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
