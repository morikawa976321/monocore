# 静的 SPA への移行案(Next.js をやめる)

状態: **設計案(未着手)**。2026-11-23 に本人が「React も Next.js も依存が多く、その変更や脆弱性の影響を受けやすい。フレームワークをよりシンプルなものに変えることを積極的に考えていきたい」と述べ、選択肢のうち「静的 SPA 案」で詰めることを選んだ。以下の構成・手順は AI の提案で、本人が採否を決めるのは「決めること」の3点。

## 実測(2026-11-23)

- **今の構成**: lock 598 パッケージ、実行時の依存 66(next の推移的 12 とプラットフォーム別バイナリを含む)。`npm audit` は 6 件(critical 1・high 4・moderate 1)。critical の next の Proxy バイパス(GHSA-6gpp-xcg3-4w24)は「Turbopack・App Router・`i18n.locales` が 1 つ」の組み合わせだけが対象で、i18n 未設定の monocore は該当しない。導入は next 16.2.10、最新は 16.4.6。他の 5 件(postcss・sharp・source-map-js・nanoid・baseline-browser-mapping)は個別に確認していない。
- **静的 SPA**(react・supabase-js・date-fns・lucide・wouter などで仮の lock を作った): lock 401、実行時 19、`npm audit` 0 件(同日の解決結果)。lock にはプラットフォーム別バイナリが 81 件入るが、実際に入るのは 1 組。
- React は react・react-dom・scheduler の 3 つで外部依存が無い。この案でも残る。
- Next 固有機能の使用: `next/*` の import は 12 ファイル(`next/link`・`next/navigation`・`next/font`・`next/server`・`next/headers`・`next-themes`、うち 1 つはテスト)。`'use client'` の無いページは `/login`・`/`・`/weather` の 3 つだけ。

## 構成(提案)

- **ファイル配置は変えない**(AGENTS.md「承認なしにファイル名を変えない」)。`src/app/**/page.tsx` は残し、ルート表(`src/router.tsx`)から import する。`layout.tsx` の `<html><body>` は `index.html` へ移す。
- **ルーター**: 自作(History API。Link・usePathname・params で約 40 行、依存 0)。足りなくなったら wouter(依存 2)。
- **ビルド**: Vite + `@vitejs/plugin-react` + `@tailwindcss/vite`。env は `NEXT_PUBLIC_*` → `VITE_*`(Vercel の環境変数も変える)。`@/src/...` の alias は `vite.config.ts` と `vitest.config.ts` に置く。
- **配信**: Vercel のまま。静的出力(`dist`)と SPA フォールバックの rewrite(`vercel.json`)。関数が無くなる。
- **認証**: すでにある `AuthGate`(ブラウザ側の門番)が全ページを担う。`proxy.ts`・`proxy.test.ts`・`lib/supabase/server.ts` は削除する。
- **Supabase クライアント**: `@supabase/ssr` をやめて `@supabase/supabase-js` の `createClient` にする(依存 −2)。**モジュールで 1 つに使い回すこと**。呼ぶたびに作ると GoTrueClient が複数でき、警告と競合が出る(今の `createBrowserClient` はブラウザで使い回される)。

## サーバーに残っている部分と行き先

今の `proxy.ts` の対象は `/login`・`/weather`・`/auth/callback`・`/reports/<slug>` だけ。他の殻ページは速度改善で `AuthGate` に移した。

| 今 | 行き先 |
|---|---|
| `auth/callback/route.ts`(`exchangeCodeForSession` → リダイレクト) | SPA のルート `/auth/callback`。同じパスなので Supabase の Redirect URL 設定は変えない。コードは 1 回しか使えないので、StrictMode の二重実行で 2 回交換しないようモジュール変数で 1 回に絞る |
| `login/page.tsx`(`searchParams` の error) | クライアントで `URLSearchParams` を読む |
| `weather/page.tsx`(`WEATHER_*` をサーバーでだけ読む。ログイン無しで取れる JS に地点を埋め込まないため) | 決めること① |
| `/reports/<slug>`(localStorage の本文をログイン確認より先に出すため、proxy の門番に残している) | 表示前に `getSession()`(通常は通信なし)で確認し、`SIGNED_OUT` で本文キャッシュを消す |
| dev の自動ログイン(`proxy.ts` の `DEV_AUTH_*`) | `import.meta.env.DEV` でだけ動く開発用モジュールへ。`VITE_DEV_AUTH_*` は `.env.local` にだけ置き、ビルド後に `dist` を grep して混入が無いことを確かめる |
| `next/font`(Geist・Geist Mono・Noto Sans JP の latin) | woff2 を `public/` に置いて `@font-face`(依存 0) |
| `next-themes` | そのまま使う(依存 1・外部依存 0)。後で自作に替えてもよい |

## 決めること(本人)

1. **天気の地点の置き場所**。提案: Supabase Auth の `user_metadata`(ログインした端末だけが読める。テーブルも関数も増えない。設定は service_role のスクリプトで 1 回)。代替は、1 行のテーブル(migration と RLS が増える)、または Vercel 関数を 1 本残す(サーバーが残る)。
2. **セッションの保存先が Cookie(`@supabase/ssr`)から localStorage(`supabase-js`)に変わる**ので、全端末で 1 回再ログイン(Magic Link)になる。提案: 受け入れる。
3. **ルーター**。提案: 自作。

## 手順(提案。1 つのブランチか worktree で進め、main の本番は動かしたまま)

1. Vite の骨組み・ルーター・`index.html`・フォント・Supabase クライアントを足し、既存の `page.tsx` から Next 固有の import を外す。`npm run dev` で全画面が動く。
2. login・callback・weather・`reports/<slug>` を SPA 用に直す(上の表)。
3. next・`@supabase/ssr`・`eslint-config-next`・postcss 設定・`next.config.ts`・proxy 一式を削除し、ESLint を typescript-eslint + react-hooks の flat config に替える。AGENTS.md・`docs/DEVELOPMENT.md`・`docs/directory_structure.md` を更新する。
4. Vercel の設定(Framework Preset: Vite、出力 `dist`、env 名)を替えて Preview デプロイ。
5. Preview で下の確認項目を通し、sol レビュー(AGENTS.md の規則)のあと本番へ。戻すときは前のデプロイへロールバックする。

## 確認項目

- Magic Link でログインして `/` に戻る。期限切れのリンクは `/login?error=invalid_or_expired_link`。
- ログアウト中に `/schedules`・`/reports/<slug>`・`/weather` を開くと `/login` へ行き、localStorage の本文が見えない。
- 天気が正しい地点で出る。`dist` に地点の値・`DEV_AUTH`・`service_role` が無い。
- `/schedules` の初回ロード時間を `docs/decisions.md` の実測と同じ手順で測り、悪化していない(殻はすでに proxy の外なので、改善は小さい)。
- vitest が通る。

## 期待できること / できないこと

- **できる**: 実行時の依存 66 → 19。サーバー実行環境(Next のサーバー・proxy・RSC・画像最適化)が無くなる。Next の更新と脆弱性への追従が要らなくなる。
- **できない**: 開発用ツールの依存(lock 上で約 380、うちプラットフォーム別バイナリ 81)は残る。React の更新追従も残る。速度の追加の改善は小さい。この移行の価値は、依存と攻撃面の削減にある。
