# 📋 monocore ディレクトリ構造

## 1. プロジェクト構成 (Snapshot)

```text
monocore
├── src/
│   ├── app/                  # 【Routing】URLと画面の定義
│   │   ├── layout.tsx        # 全ページ共通の枠組み（HTML/Bodyタグ、共通ヘッダー等）
│   │   ├── page.tsx          # トップページ (/)
│   │   └── [feature]/        # 各機能（例: schedules, inbox）
│   │       ├── page.tsx      # 機能のメイン画面
│   │       └── layout.tsx    # (任意) その機能グループ専用のレイアウト
│   ├── components/           # 【UI Parts】再利用可能な部品
│   │   ├── layout/           # Sidebar, Header など、app/layout で呼び出す部品
│   │   ├── ui/               # Button など、汎用的な最小パーツ
│   │   └── [feature]/        # DaySection, InboxPanel など、特定の機能に紐づくパーツ
│   ├── hooks/                # 【Logic】Reactの状態管理ロジック（useSchedules等）
│   ├── lib/                  # 【Infrastructure】外部接続と汎用関数
│   │   ├── supabase/
│   │   │   ├── client.ts     # クライアントコンポーネント用接続設定
│   │   │   ├── server.ts     # サーバーコンポーネント用接続設定
│   │   │   └── queries/      # テーブルごとのDB操作関数（schedules.ts, inboxes.ts等）
│   │   └── date.ts 等        # DBに関係ない汎用ユーティリティ
│   ├── proxy.ts              # 【Security】認証チェック・リダイレクト処理（Next.js proxy）
│   └── types/                # 【Definition】TypeScriptの型定義
│       └── database.types.ts # Supabaseから自動生成された型
├── supabase/                 # 【Backend】Supabaseローカル環境の設定
│   ├── config.toml           # ローカル環境の構成設定（ポート、Auth設定等）
│   ├── seed.sql              # 開発用テストデータ（初期投入データ）
│   └── migrations/           # DBスキーマ変更の履歴ファイル群
└── (root configs)            # package.json, tsconfig.json 等
```

---

## 2. フォルダ構造と役割（クイックリファレンス）

`src` ディレクトリを核とした、設定とソースコードを分離したモダンな構成です。

| パス | 役割 (1行説明) |
| :--- | :--- |
| `src/app/` | **ルーティングと画面**: 各URLに対応するページとレイアウトの定義。 |
| `src/components/` | **UIコンポーネント**: 再利用可能な部品（ボタン、リスト、フォームなど）。 |
| `src/hooks/` | **カスタムフック**: Reactの状態管理や副作用（データ取得中など）の共通ロジック。 |
| `src/lib/` | **外部連携・道具箱**: Supabaseのクライアント設定や、共通のユーティリティ関数。 |
| `src/types/` | **型定義**: TypeScriptのインターフェースやSupabaseの自動生成型の保管場所。 |
| `supabase/` | **DB設定**: マイグレーションファイルやローカル開発用の設定。 |

---

## 3. 主要フォルダの設計意図と使い分け

### 📂 `src/app/` (App Router)
Next.js 独自のルーティングシステムです。フォルダ名がそのままURLになります。
* **動的ルーティング `[id]`**: `/schedules/123` のように、URLの一部をIDとして受け取る画面に使用。
* **(auth) フォルダ**: `( )` で囲むと、URLには影響を与えず、認証関連のページを論理的にグループ化できます。

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

* **Layout (器)**: `src/app/layout.tsx` + `src/components/layout/`
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
2. **Types**: `npx supabase gen types` 等で `src/types/database.types.ts` を更新。
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