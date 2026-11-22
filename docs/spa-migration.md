# 静的 SPA への移行案(Next.js をやめる)

状態: **本番に反映済み(2026-11-23。「実装の結果」の節)**。2026-11-23 に本人が「React も Next.js も依存が多く、その変更や脆弱性の影響を受けやすい。フレームワークをよりシンプルなものに変えることを積極的に考えていきたい」と述べ、選択肢のうち「静的 SPA 案」で詰めることを選んだ。以下の構成・手順は AI の提案で、本人が採否を決めることにしていた3点(天気の地点の置き場所・再ログインの受け入れ・ルーター)は 2026-11-23 にすべて決まった(「決定済み」の節)。

## 実測(2026-11-23)

- **今の構成**: lock 598 パッケージ、実行時の依存 66(next の推移的 12 とプラットフォーム別バイナリを含む)。`npm audit` は 6 件(critical 1・high 4・moderate 1)。critical の next の Proxy バイパス(GHSA-6gpp-xcg3-4w24)は「Turbopack・App Router・`i18n.locales` が 1 つ」の組み合わせだけが対象で、i18n 未設定の monocore は該当しない。導入は next 16.2.10、最新は 16.4.6。他の 5 件(postcss・sharp・source-map-js・nanoid・baseline-browser-mapping)は個別に確認していない。
- **静的 SPA**(react・supabase-js・date-fns・lucide・wouter などで仮の lock を作った): lock 401、実行時 19、`npm audit` 0 件(同日の解決結果)。lock にはプラットフォーム別バイナリが 81 件入るが、実際に入るのは 1 組。
- React は react・react-dom・scheduler の 3 つで外部依存が無い。この案でも残る。
- Next 固有機能の使用: `next/*` の import は 12 ファイル(`next/link`・`next/navigation`・`next/font`・`next/server`・`next/headers`・`next-themes`、うち 1 つはテスト)。`'use client'` の無いページは `/login`・`/`・`/weather` の 3 つだけ。

## 構成(提案)

- **ファイル配置は変えない**(AGENTS.md「承認なしにファイル名を変えない」)。`src/app/**/page.tsx` は残し、ルート表(`src/router.tsx`)から import する。`layout.tsx` の `<html><body>` は `index.html` へ移す。
- **ルーター**: 自作(History API。Link・usePathname・params で約 40 行、依存 0)。足りなくなったら wouter(依存 2)。
- **ビルド**: Vite + `@vitejs/plugin-react` + `@tailwindcss/vite`。env は `NEXT_PUBLIC_*` → `VITE_*`(Vercel の環境変数も変える)。`@/src/...` の alias は `vite.config.mts` と `vitest.config.ts` に置く。
- **配信**: Vercel のまま。静的出力(`dist`)と SPA フォールバックの rewrite(`vercel.json`)。関数が無くなる。
- **認証**: すでにある `AuthGate`(ブラウザ側の門番)が全ページを担う。`proxy.ts`・`proxy.test.ts`・`lib/supabase/server.ts` は削除する。**`AuthGate` の除外に `/auth/callback` を足す**(今の除外は `/login` だけで、`layout.tsx` に置かれている)。callback は今は route handler で `AuthGate` を通らないが、SPA では同じレイアウトの中に入る。交換が終わるまでセッションが無く、`detectSessionInUrl: false` では `getSession()` が手動交換の完了を待たないので、除外しないと交換の完了前に `/login` へ送ってしまう(sol が SDK で確かめた)。
- **Supabase クライアント**: `@supabase/ssr` をやめて `@supabase/supabase-js` の `createClient` にする(依存 −2)。
  - **認証オプションを明示する**。`@supabase/ssr` のブラウザ用クライアントは `flowType: 'pkce'` を指定しているが、`supabase-js` の既定は `implicit` で、そのままだと Magic Link が `?code=` を交換するフローにならない(`code_challenge` が送られない)。`{ auth: { flowType: 'pkce', detectSessionInUrl: false } }` にする。`detectSessionInUrl` は既定が true で、PKCE のとき SDK が初期化時に `?code=` を自動で交換するので、callback での手動交換と重複する。交換は callback の 1 か所だけで行う(確かめた先: `node_modules/@supabase/ssr` の `createBrowserClient` と `@supabase/auth-js` の `GoTrueClient` の既定値、2026-11-23)。
  - **モジュールで 1 つに使い回すこと**。呼ぶたびに作ると GoTrueClient が複数でき、警告と競合が出る(今の `createBrowserClient` はブラウザで使い回される)。

## サーバーに残っている部分と行き先

今の `proxy.ts` は、殻ページ(`/`・`/schedules`・`/finance`・`/news`・`/reports` の完全一致)と静的ファイル以外のすべてで動く(`src/proxy.ts` の matcher と `src/proxy.test.ts`)。実在するのは `/login`・`/weather`・`/auth/callback`・`/reports/<slug>` で、未知のパス(`/unknown`・`/schedules/x`)も未ログインなら `/login` へ送られる。殻ページは速度改善で `AuthGate` に移した。SPA ではルート表に無いパスの扱い(NotFound か `/` へ)を決める。

| 今 | 行き先 |
|---|---|
| `auth/callback/route.ts`(`exchangeCodeForSession` → リダイレクト) | SPA のルート `/auth/callback`。同じパスなので Supabase の Redirect URL 設定は変えない。コードは 1 回しか使えないので、クライアントを `detectSessionInUrl: false` にしたうえで、このルートの 1 か所だけで `exchangeCodeForSession` を呼び、StrictMode の二重実行で 2 回呼ばないようモジュール変数で 1 回に絞る。`AuthGate` の除外にこのパスを足す(「構成」の認証の項) |
| `page.tsx`(`/`。Next の import は無いが `async function`) | `async` を外して同期コンポーネントにする(クライアントの React は async コンポーネントを描画できない) |
| `login/page.tsx`(`async`。`searchParams` の error) | `async` を外し、クライアントで `URLSearchParams` を読む |
| `weather/page.tsx`(`async`。今は `lib/supabase/server.ts` のクライアントで `weather_locations` の先頭の1件を読み、サーバーが地点を HTML に入れる。ログイン無しで取れる JS に地点を埋め込まないため) | `async` を外し、ブラウザの Supabase クライアントで同じクエリ(`getDefaultWeatherLocation`)を読む(決定済み。「決定済み」の節) |
| `/reports/<slug>`(localStorage の本文をログイン確認より先に出すため、proxy の門番に残している) | 表示前に `getSession()`(通常は通信なし)で確認し、`SIGNED_OUT` で本文キャッシュを消す |
| dev の自動ログイン(`proxy.ts` の `DEV_AUTH_*`) | `import.meta.env.DEV` でだけ動く開発用モジュールへ。`VITE_DEV_AUTH_*` は `.env.local` にだけ置き、ビルド後に `dist` を grep して混入が無いことを確かめる |
| `next/font`(Geist・Geist Mono・Noto Sans JP の latin) | woff2 を `public/` に置いて `@font-face`(依存 0) |
| `next-themes` | そのまま使う(依存 1・外部依存 0)。後で自作に替えてもよい |

## 決定済み

- **天気の地点はテーブル `weather_locations` に置く**(本人、2026-11-23。理由: 将来、複数の地点を切り替えたい)。1 行 1 地点で、列は `WeatherLocation` の `name` / `latitude` / `longitude` に `sort_order` を足したもの。RLS で本人の行だけ読める。migration は `20261123120000_add_weather_locations.sql`。実際の地点は公開リポジトリに置かないので、本人が SQL エディタか service_role のスクリプトで入れる(どちらも `user_id` の明示が要る。`docs/DEVELOPMENT.md` の表)。行が無いときは今と同じ東京駅。**この移行より前に作り、`/weather` の読み取りも先に切り替えた(2026-11-23)**。環境変数 `WEATHER_*` は読まない。今はサーバーが読むので、手順 2 ではその読み取りをブラウザ側に移すだけでよい。複数地点の切り替え(画面)は別の課題(monocore#5)。
- **再ログインを受け入れる**(本人、2026-11-23。「再ログインはするからいい」)。セッションの保存先が Cookie(`@supabase/ssr`)から localStorage(`supabase-js`)に変わるので、全端末で 1 回再ログイン(Magic Link)になる。
- **ルーターは自作**(本人、2026-11-23。「自作でよい」)。History API で `Link`・`usePathname`・params を書く(約 40 行、依存 0)。足りなくなったら wouter に替える。

## 決めること(本人)

なし(2026-11-23 時点)。

## 手順(提案。1 つのブランチか worktree で進め、main の本番は動かしたまま)

1. Vite の骨組み・ルーター・`index.html`・フォント・Supabase クライアントを足し、既存の `page.tsx` から Next 固有の import を外す。`npm run dev` で全画面が動く。
2. `/`・login・callback・weather・`reports/<slug>` を SPA 用に直す(上の表。`/`・login・weather は `async` を外す)。weather は `weather_locations` の先頭の行(`sort_order` 最小、同点は作った順)を読み、行が無ければ東京駅にする。クエリは `lib/supabase/queries/weather-locations.ts` に置く。
3. next・`@supabase/ssr`・`eslint-config-next`・postcss 設定・`next.config.ts`・proxy 一式を削除し、ESLint を typescript-eslint + react-hooks の flat config に替える。AGENTS.md・`docs/DEVELOPMENT.md`・`docs/directory_structure.md` を更新する。
4. Vercel の設定(Framework Preset: Vite、出力 `dist`、env 名)を替えて Preview デプロイ。
5. Preview で下の確認項目を通し、sol レビュー(AGENTS.md の規則)のあと本番へ。戻すときは前のデプロイへロールバックする。

## 確認項目

- Magic Link でログインして `/` に戻る。期限切れのリンクは `/login?error=invalid_or_expired_link`。
- ログアウト中に `/schedules`・`/reports/<slug>`・`/weather` を開くと `/login` へ行き、localStorage の本文が見えない。
- 天気が正しい地点で出る。`dist` に地点の値・`DEV_AUTH`・`service_role` が無い。
- `/schedules` の初回ロード時間を `docs/decisions.md` の実測と同じ手順で測り、悪化していない(殻はすでに proxy の外なので、改善は小さい)。
- vitest が通る。

## 実装の結果(2026-11-23)

設計からの変更点と、残っていること。

- **ファイル配置**: `src/app/**/page.tsx` は残し、`src/router.tsx` のルート表(画面ごとに `lazy`)から読む。ルーターは `src/lib/router/`(`match.ts` がパスの突き合わせ、`navigation.tsx` が `Link`・`usePathname`・`useParams`・`navigate`)。`src/app/layout.tsx` は `<html>`・`<body>` を持たない共通の枠で、`<html>`・`<body>`・タイトル・アイコンは `index.html`。`src/app/icon.png` は `public/icon.png` へ移し、`vercel.json` で `/favicon.ico` をそこへ転送する。
- **env**: `NEXT_PUBLIC_*` → `VITE_*`、`DEV_AUTH_*` → `VITE_DEV_AUTH_*`。Vite の設定は `vite.config.mts`(`.ts` だと package.json が `"type": "module"` でないため警告が出る)。
- **フォント**: 設計では「woff2 を `public/` に置く」だったが、`next/font/google` は Noto Sans JP の全分割(124 ファイル。日本語はこの字形で描画されていた)を配信していた。見た目を変えないため、既存ビルド(`.next/static/media`)の woff2 135 個(Geist 5・Geist Mono 6・Noto Sans JP 124、計 5.2MB)を `public/fonts/` へコピーし、元の `@font-face` を `src/app/fonts.css` に書き直した(再取得はしていない。SIL OFL 1.1)。Noto Sans JP の 400 と 500 は同じ可変フォントのファイルだったので、1 宣言にまとめた。**5.2MB は置いてあるファイルの総量で、ブラウザが取るのはページの文字に要る分割だけ**(キャッシュ無しの実測、開発サーバー、2026-11-23: `/weather` は 23 ファイル 462KB、`/schedules` は 8 ファイル 136KB。`next/font` のときと同じ仕組みで、同じファイルを取る)。フォントの更新は、`next/font` の代わりに Google Fonts の CSS を取って同じ形に書き直す。
- **認証**: `AuthGate` が全画面を担う(`/auth/callback` は対象外)。ログイン済みで `/login` を開くと `/` へ戻す(プロキシがしていた)。`SIGNED_OUT` でレポートの本文と天気の手元の写しを消す。開発用の自動ログインは `AuthGate` が `import.meta.env.DEV` の中で `src/lib/auth/dev-login.ts` を動的に読んで行う(入れたらそのページを読み込み直すので、元のページに残る)。
- **`/reports/[slug]`**: 手元の本文を出す前に `getSession()` を確かめる。セッションが無いときは本文を出さない(確認済み)。確認できなかったとき(`error`。期限切れのトークンの更新が通信の失敗で通らない、など)も出さず、「ログインを確認できませんでした」と知らせる(sol の指摘。`AuthGate` は通信の失敗でログアウト扱いにしないので、ここで止める)。
- **画面の読み込み失敗**: `src/components/layout/RouteErrorBoundary.tsx` が、`lazy` の読み込み失敗(通信が切れた、デプロイのあとで古い画面が指すファイルが無い)や描画の例外を受け止め、サイドバーを残したまま「画面を読み込めませんでした」と「読み込み直す」を出す。別の画面へ移れば消える(sol の指摘。無いとアプリ全体が空白になる)。
- **`/weather`**: `useWeatherLocation`(ブラウザから `getDefaultWeatherLocation`)で地点を読んでから `WeatherView` を出す。読めなかったときは東京を出さず、失敗を出す。地点を読む1往復ぶん、サーバーが HTML に入れていたときより最初の表示が遅れる(測っていない)。
- **ESLint**: `typescript-eslint` + `eslint-plugin-react-hooks`(`globals`・`@eslint/js`)の flat config。`overrides` の `typescript-eslint` は直接の依存にしたので外した。
- **確かめたこと**: `docs/decisions.md`「Next.js をやめて静的 SPA(Vite)に移した」。vitest は全部通る(`proxy.test.ts` は消え、`src/lib/router/match.test.ts` を足した)。`tsc`・ESLint は 0 件。
- **本番への切り替え(2026-11-23)**: sol のレビューを通して main へ push、Vercel の Production に反映した。Preview の確認(配信の設定・未ログインの転送・長期キャッシュ)は通ったが、Preview でのメールのリンクによるログインと、`/schedules` の初回ロード時間の測定は、本人の指示(「検証は簡略化して。本番に deploy していい」)で省いた。全端末は一度だけ再ログインになる(セッションの保存先が Cookie から localStorage に変わったため)。
- **Vercel の環境変数で踏んだこと**: (1) `VITE_` で始まる変数は公開の値なので、Vercel の追加画面で「Sensitive(秘密)」にできない(`visibility: config` にする)。(2) `VITE_SUPABASE_URL` は API の URL(`https://<project-ref>.supabase.co`)で、Supabase ダッシュボードの URL(`https://supabase.com/dashboard/project/<project-ref>`)ではない。取り違えてもビルドは通り、ログイン画面も出て、メールを送るときに初めて失敗する。デプロイ後に `dist/assets/index-*.js` の中の接続先を確かめる(値は `VITE_` の変数としてビルドのときに埋め込まれるので、変えたら再デプロイが要る)。
- **まだのこと**: `/schedules` の初回ロード時間を `docs/decisions.md` の基準値(中央値 約 400ms)と同じ手順で測る(本番で)。Vercel の古い環境変数 `NEXT_PUBLIC_*`・`WEATHER_*` は使わなくなったので消せる。

## 期待できること / できないこと

- **できる**: 実行時の依存 66 → 19。サーバー実行環境(Next のサーバー・proxy・RSC・画像最適化)が無くなる。Next の更新と脆弱性への追従が要らなくなる。
- **できない**: 開発用ツールの依存(lock 上で約 380、うちプラットフォーム別バイナリ 81)は残る。React の更新追従も残る。速度の追加の改善は小さい。この移行の価値は、依存と攻撃面の削減にある。
