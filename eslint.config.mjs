import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // `supabase start` が生成する作業ディレクトリ。中身は Supabase CLI が置いた
    // ミニファイ済みの edge runtime で、我々のコードではない（lint すると
    // prefer-const 等で150件以上落ちる）。git は supabase/.gitignore で無視済み。
    "supabase/.temp/**",
  ]),
  {
    // 選択ID変更に伴う詳細リセット・モーダル開閉の pending 同期など、
    // 外部入力に反応して state を揃える effect をこのアプリでは意図的に使う。
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
