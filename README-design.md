# Design System & Coding Guidelines for AI Agent

本ドキュメントは、当プロジェクトにおけるフロントエンド開発（UI/UX）の絶対的な設計・実装ルールである。
AIコーディングエージェントは、本ガイドラインに記載されたTailwind CSSの標準クラス**のみ**を使用してUIを構築すること。

## 1. デザインテーマ
- **「シンプルと洗練 (Material Design 3ベース)」「プロフェッショナルなツール」**
- 親しみやすいやわらかさ・過度な装飾を排し、高い情報密度と機能美を追求する。

## 2. 制約と基本方針
1. **Tailwind標準クラスのみを使用**: 独自クラスや、任意の値（例: `w-[123px]`、`rounded-[3px]`）は使用禁止。
2. **完全な白と黒の禁止**: コントラストが強すぎる完全な白（`white`）と黒（`black`）の使用は禁止し、カラーパレットの両端（例: `neutral-50` や `neutral-950`）で代用すること。
3. **影（Shadow）の完全撤廃**: `shadow-*` クラスは一切使用しない。階層（Elevation）は、**ボーダー（`border`）と背景色の明暗（Light/Dark）のみ**で表現する。
4. **角丸（Border Radius）の最小化**: プロフェッショナルな硬質感を出すため、過度な角丸は禁止。
5. **過度なアニメーションの禁止**: 装飾目的のアニメーション（`animate-bounce`など）は禁止。ボタンのHoverやFocus、操作のフィードバックといった実用目的のみに限定する。
6. **スタイルの共通化（DRY原則）**: アプリ全体の背景色、基本テキスト色、および基本フォントサイズ（`text-sm`）などは各ページに重複して記述せず、必ず親のルートレイアウト (`src/app/layout.tsx` の `<body>`) で一括指定し継承させること。各ページでは上書きが必要な要素にのみクラスを指定する。

### 2.1 コントラスト制約（可読性最優先）
- **基本原則**: 装飾やトーン統一より、まず可読性を優先する。本文・操作ラベル・フォーム値は背景に対して十分な明度差を確保すること。
- **テキストの使い分け制約**:
  - `text-neutral-900` / `dark:text-neutral-50`: 見出し、本文、ボタン主要ラベルなど常時読ませる情報。
  - `text-neutral-800` / `dark:text-neutral-200`: 補助テキストだが読解が必要な情報（説明文、サブ情報、非主ボタンラベル）。
  - `text-neutral-700` / `dark:text-neutral-300`: 補足情報やメタ情報に限定し、長文・主要操作ラベルには使わない。
  - `text-neutral-500` は無効状態やプレースホルダーなど、非アクティブ情報に限定する。
- **操作要素の制約**:
  - クリック可能要素（`button`, `a`, メニュー項目）は、未操作時でも背景または境界と識別できること。
  - Active/Selected状態は、通常状態より明確に1段以上コントラストを上げること（背景・文字・枠線のいずれか、推奨は複合）。

## 3. カラーパレット（Light / Dark）
使用できる色は以下の**ニュートラル（Neutral）系、アクセントのアンバー（Amber）、および透明（transparent）のみ**とする。現時点での独自色の追加は禁止。
常に `dark:` バリアントを併記し、ダークモードに対応させること。

- **背景 (Background / Surface)**
  - App Background: `bg-neutral-100` / Dark: `bg-neutral-950`
  - Base Surface (Card/Menu/Modal): `bg-neutral-50` / Dark: `bg-neutral-900`
  - Sub Surface (Hovered/Selected): `bg-neutral-200` / Dark: `bg-neutral-800`

- **ボーダー (Border)**
  - Default: `border-neutral-200` / Dark: `border-neutral-800`
  - Focus/Active: `border-neutral-400` / Dark: `border-neutral-600`

- **テキスト (Text)**
  - Primary: `text-neutral-900` / Dark: `text-neutral-50`
  - Secondary: `text-neutral-800` / Dark: `text-neutral-200`
  - Tertiary (Meta only): `text-neutral-700` / Dark: `text-neutral-300`
  - Disabled: `text-neutral-500` / Dark: `text-neutral-500`

- **アクセント (Accent: Amber)**
  - 用途: 主要なアクション（Primary Buttonの背景）、注意を引くバッジ、アクティブなタブインジケーターなど、直感的にユーザを導く重要な箇所のみに限定し、面積を小さく抑える。
  - 背景色 (Button / Badge etc.):
    - Light: `bg-amber-500` (Hover: `bg-amber-600`)
    - Dark: `bg-amber-500` (Hover: `bg-amber-400`) - ダークモードではHover時に少し明るくする
  - テキスト / アイコン:
    - Light: `text-amber-600`
    - Dark: `text-amber-400`
  - ボーダー / フォーカスリング:
    - Light: `border-amber-500` / `ring-amber-500`
    - Dark: `border-amber-400` / `ring-amber-400`

## 4. タイポグラフィと情報密度
情報密度を高く保つため、フォントサイズとウェイトは以下に限定する。

- **フォントサイズ**
  - Text Sm (注釈/バッジ/補助的テキスト): `text-sm`
  - Text Base (標準/大部分のテキスト): `text-base` （UI全体の基本サイズ）
  - Text Lg (主要見出し/強調要素): `text-lg`
- **制約**: 上記3つのクラス以外（`text-xs`, `text-xl` 等）の使用、および `text-[13px]` のような数値による直接指定は一切禁止する。

- **フォントウェイト**
  - 標準: `font-normal`
  - 強調・見出し・アクション: `font-medium` （太すぎる `font-bold` などは極力避ける）

## 5. 余白（Spacing & Layout）
全体的な統一感を出すため、使用する余白クラス（p, m, gap 等）を以下に限定する。

- **Micro**: `1` (4px), `2` (8px) - アイコンとテキストの間、極小の隙間
- **Small**: `4` (16px) - コンポーネント内の主要なパディング、要素間の基本ギャップ
- **Medium**: `6` (24px) - コンテナ内のセクション間の余白
- **Large**: `12` (48px) - ページレベルの大きなセクション間の余白

## 6. 角丸（Border Radius）
- 全要素 `rounded-sm` (2px) または `rounded` (4px) のいずれかに統一する。
- `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-full` は**使用禁止**（例外として、完全な円形アイコンやアバターが必要な場合のみ `rounded-full` を許可する）。

## 7. トランジションとアニメーション
実用的なフィードバックのみに絞る。
- **標準トランジション**: `transition-colors duration-150 ease-in-out` （`transition-all` は意図しないサイズ変更等のアニメーションを防ぐため推奨しない）
- **インタラクション**: `hover:bg-*`, `active:bg-*` により状態を表現する。
- **フォーカス時の表現**: `focus-visible:ring-1 focus-visible:ring-neutral-900 dark:focus-visible:ring-neutral-50 focus-visible:outline-none` で明瞭な枠線のみを表示させ、影（box-shadowとしてのringの多用）は使わない。

## 8. コンポーネント実装の制約（Agent向けテンプレート）
AIエージェントは、以下のクラスの組み合わせルールにのみ従ってUIコンポーネントを実装せよ。

- **Primary Button**
  - Light: `bg-amber-500 text-neutral-50 hover:bg-amber-600`
  - Dark: `dark:bg-amber-500 dark:text-neutral-950 dark:hover:bg-amber-400`
  - 共通: `px-4 py-2 text-sm font-medium rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 dark:focus-visible:ring-amber-400`
- **Secondary Button**
  - Light: `bg-neutral-200 border border-neutral-300 text-neutral-900 hover:bg-neutral-300`
  - Dark: `dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-50 dark:hover:bg-neutral-700`
  - 共通: `px-4 py-2 text-sm font-medium rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-500 dark:focus-visible:ring-neutral-500`
- **Surface / Card / Dialog**
  - Light: `bg-neutral-50 border border-neutral-200`
  - Dark: `dark:bg-neutral-900 dark:border-neutral-800`
  - 共通: `rounded p-4` または `p-6`
- **Input / Textarea**
  - Light: `bg-neutral-50 border text-neutral-900 border-neutral-200 placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400`
  - Dark: `dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-50 dark:placeholder:text-neutral-600 dark:focus:border-neutral-600 dark:focus:ring-neutral-600`
  - 共通: `px-3 py-2 text-sm rounded-sm outline-none transition-colors`

## 9. z-index レイヤールール

`z-*` は場当たり的に増やさず、以下の固定スケールを使うこと。

- `z-0`: 通常コンテンツ
- `z-10`: ページ内の固定補助要素（例: FAB）
- `z-20`: メニュー/ドロワー等の背景オーバーレイ
- `z-30`: ナビゲーション/ドロワーパネル/トリガー
- `z-40`: モーダル背景
- `z-50`: モーダル本体（最前面インタラクション）

運用ルール:

1. 常に **背景 < パネル/本体** の順序を守る。
2. モーダル表示中は、ナビゲーション要素が前面で操作可能にならないようにする。
3. 競合時は局所的に `z-*` を足さず、スケール全体で再配置する。

## 10. 禁止事項の確認（Agent Checking Rules）
実装完了時、Agentは生成したコードが以下の条件を満たしているか自己検証しなければならない。
1. `shadow` で始まるクラスが一つもないか？
2. `[ ]` を使った任意値の Tailwind クラス指定がないか？
3. `rounded-md` 以上の大きな角丸が使用されていないか？
4. 色指定に **`neutral`, `amber`, `transparent` 以外が含まれていないか？（`white`, `black`, `slate` 等はすべて禁止）**
5. `dark:` の指定が漏れていないか？
6. アニメーションに `animate-*` などの装飾的クラスが使われていないか？