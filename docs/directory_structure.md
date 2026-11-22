# 📋 monocore ディレクトリ構造

## 1. プロジェクト構成 (Snapshot)

```text
monocore
├── src/
│   ├── main.tsx              # 【Entry】React の起動（index.html から読まれる）
│   ├── router.tsx            # 【Routing】URLと画面の対応表（ルート表）。画面を足したら1行足す
│   ├── app/                  # 【Pages】画面の定義（URLとの対応は router.tsx）
│   │   ├── layout.tsx        # 全ページ共通の枠組み（テーマ・AuthGate・サイドバー。<html>/<body> は index.html）
│   │   ├── page.tsx          # トップページ (/)
│   │   └── [feature]/        # 各機能（例: schedules, inbox）
│   │       └── page.tsx      # 機能のメイン画面（default export）
│   ├── components/           # 【UI Parts】再利用可能な部品
│   │   ├── layout/           # Sidebar など枠の部品。RouteErrorBoundary は画面の読み込み・描画の失敗を受け止める
│   │   ├── ui/               # Button, Input, Textarea など、汎用的な最小パーツ
│   │   └── [feature]/        # DaySection, InboxPanel など、特定の機能に紐づくパーツ
│   ├── hooks/                # 【Logic】Reactの状態管理ロジック（useSchedules等）
│   ├── lib/                  # 【Infrastructure】外部接続と汎用関数
│   │   ├── router/           # 自前ルーター（match.ts: パスの突き合わせ、navigation.tsx: Link・usePathname・useParams・navigate）
│   │   ├── supabase/
│   │   │   ├── client.ts     # ブラウザ用の supabase-js クライアント（アプリで1つ。PKCE・localStorage）
│   │   │   └── queries/      # テーブルごとのDB操作関数（schedules.ts, inboxes.ts等）
│   │   └── date.ts 等        # DBに関係ない汎用ユーティリティ
│   └── types/                # 【Definition】TypeScriptの型定義
│       └── database.types.ts # Supabaseから自動生成された型
├── supabase/                 # 【Backend】Supabaseローカル環境の設定
│   ├── config.toml           # ローカル環境の構成設定（ポート、Auth設定等）
│   ├── seed.sql              # 開発用テストデータ（初期投入データ）
│   └── migrations/           # DBスキーマ変更の履歴ファイル群
├── index.html                # 【Entry】<html>/<body>・タイトル・アイコン・テーマの先付けスクリプト
├── public/                   # そのまま配信するファイル（icon.png、fonts/）
└── (root configs)            # package.json, tsconfig.json, vite.config.mts, vercel.json 等
```

---

## 2. フォルダ構造と役割（クイックリファレンス）

`src` ディレクトリを核とした、設定とソースコードを分離したモダンな構成です。

| パス | 役割 (1行説明) |
| :--- | :--- |
| `src/app/` | **画面**: 各URLに対応するページとレイアウト。URLとの対応は `src/router.tsx`。 |
| `src/components/` | **UIコンポーネント**: 再利用可能な部品（ボタン、リスト、フォームなど）。 |
| `src/hooks/` | **カスタムフック**: Reactの状態管理や副作用（データ取得中など）の共通ロジック。 |
| `src/lib/` | **外部連携・道具箱**: Supabaseのクライアント設定や、共通のユーティリティ関数。 |
| `src/app/finance/page.tsx` | 家計の見通しページ。資産表・計画表・前提を配置。 |
| `src/components/finance/card.ts` | finance のカード・表・補助テキストのクラス。 |
| `src/components/finance/FinanceChart.tsx` | 合計と Cash の SVG 折れ線（実測・予測）。 |
| `src/components/finance/AssetsTable.tsx` | 月末残高・予測・記録時の差・実測訂正。 |
| `src/components/finance/PlanTable.tsx` | 計画イベントの行編集・追加・削除。 |
| `src/hooks/useFinance.ts` | 家計の読み込み・下書き・保存・記録。 |
| `src/lib/finance/month.ts` | 月表記・月初 DATE・通し番号の変換と加算。 |
| `src/lib/finance/constants.ts` | 節目・終点下限・前提文。 |
| `src/lib/finance/projection.ts` | DB に依存しない予測・比較・要約の純関数。 |
| `src/lib/finance/input.ts` | 整数円と下書きの検査・金額表示。 |
| `src/lib/finance/projection.test.ts` | 手計算例と7つの性質テスト。 |
| `src/lib/finance/projection.realdata.test.ts` | FINANCE_FIXTURE 指定時だけ実データを照合。 |
| `src/lib/supabase/queries/finance.ts` | finance 2表の DB 操作。 |
| `src/types/` | **型定義**: TypeScriptのインターフェースやSupabaseの自動生成型の保管場所。 |
| `supabase/` | **DB設定**: マイグレーションファイルやローカル開発用の設定。 |

---

## 3. 主要フォルダの設計意図と使い分け

### 📂 `src/app/` (画面) と `src/router.tsx` (ルート表)
フォルダ構成は Next.js の App Router のときのまま残してありますが、**フォルダ名は URL を決めません**。URL との対応は `src/router.tsx` のルート表が持ちます（画面ごとに読み込みを分ける）。
* **画面を足す**: `src/app/<名前>/page.tsx` を作り（default export）、`src/router.tsx` に 1 行足す。ルート表に無いパスは NotFound。
* **動的パラメータ `:slug`**: ルート表の `'/reports/:slug'` のように書き、画面側は `useParams()`（`src/lib/router/navigation.tsx`）で受け取る。
* **リンク**: アプリ内は `@/src/lib/router/navigation` の `Link`（ページを読み込み直さない）。

### 📂 `src/components/` (Component Atomic)
UIを構成するパーツです。機能ごとにサブフォルダを作ります。
* **`ui/`**: ボタンや入力フォームなどの最小単位（Atomic部品）。
* **`layout/`**: ヘッダー、サイドバーなどページを跨いで存在し続ける枠組み。
* **`schedules/` / `inbox/`**: 特定の機能に特化した部品（`DaySection.tsx` など）。

### 📂 `src/lib/` (Infrastructure & Logic)
「どうやってデータを取るか」や「どう計算するか」を定義します。
* **`supabase/queries/`**: **【重要】** テーブルごとにファイルを作成（`schedules.ts` 等）。DB操作関数（CRUD）をここに集約します。
* **`date.ts` 等**: 日付のフォーマットなど、DB操作を含まない短い関数。

### 📂 `src/hooks/` (Shared State)
「データの取得状態」や「特定のUIの振る舞い」をカプセル化します。
* 例：`useSchedules.ts`（Supabaseからデータを取ってきて、`loading` 状態を返す）。

---

## 4. 画面の階層構造と境界線

画面は「マトリョーシカ」のような入れ子構造で構成されます。

1. **Layout** がアプリ全体の骨組み（サイドバーなど）を維持する。
2. その中のメインエリアに、URLに応じた **Page** が描画される。
3. **Page** は、機能を最小単位に分割した **Components** を組み合わせて表示を作る。

* **Layout (器)**: `src/app/layout.tsx` + `src/components/layout/`（`src/main.tsx` が `layout` の `children` にルート表の画面を入れる）
   - URLが変わっても消えない、アプリ共通の枠組み。
   - サイドバー、ヘッダー、背景デザインなど。
* **Page (中身)**: `src/app/**/page.tsx`
   - URLごとに完全に入れ替わるコンテンツ。Layoutの `children` として流し込まれる。
   - スケジュール画面、ログイン画面など
* **Components (パーツ)**: `src/components/**`
   - Pageの中で呼び出される、再利用可能な具体的な部品
   - スケジュールを表示するカード、保存ボタン、入力フォームなど
   
---

## 5. 開発フロー：新しい機能（例：メモ機能）を追加する手順

1. **Database**: Supabaseのダッシュボード等で `notes` テーブルを作成。
2. **Types**: `npx supabase gen types` 等で `src/types/database.types.ts` を更新（生成物で丸ごと上書きせず diff を取って手で入れる。理由は `docs/database.md` §4）。
3. **Queries**: `src/lib/supabase/queries/notes.ts` を作り、データ取得・保存関数を実装。
4. **Components**: `src/components/notes/` 内に表示用パーツを作成。
5. **App**: `src/app/notes/page.tsx` を作成し、Queriesを呼び出してComponentsにデータを渡す。

---

## 6. 運用上の鉄則（手戻りを防ぐために）

> **「画面（ページ）」は `app`、 「見た目（部品）」は `components`、 「データ操作（関数）」は `lib`、 「状態管理」は `hooks`**

* **「どこに書くか」で迷ったら**:
    * DBを叩く処理（`supabase.from...`）をページ（`page.tsx`）に直接書かない。必ず `lib/supabase/queries/` に関数として切り出す。
    * 他のページでも使いそうなUIは最初から `components/` に置く。
* **型安全の維持**:
    * `any` 型の使用を避け、必ず `database.types.ts` にある自動生成型を利用する。

---

## 7. コーディングスタイル（JavaScript/TypeScript）

* **関数は関数宣言で統一する**
    * エクスポートする関数・React コンポーネントは `export function name() { }` / `export async function name() { }` を使う。`export const name = () => { }` のアロー関数は使わない。
    * 理由：React / Next.js の公式ドキュメントと表記を揃えやすく、スタックトレースで名前が明確に出る。定数・設定（`metadata`、`config` など）は従来どおり `export const` でよい。コールバックや非エクスポートの短い関数ではアロー関数を使ってよい。