import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "dist/**",
    // `supabase start` が生成する作業ディレクトリ。中身は Supabase CLI が置いた
    // ミニファイ済みの edge runtime で、我々のコードではない（lint すると
    // prefer-const 等で150件以上落ちる）。git は supabase/.gitignore で無視済み。
    "supabase/.temp/**",
    // Python の仮想環境(scraper/.venv)など、このアプリのコードではないもの。
    "scraper/**",
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    // 選択ID変更に伴う詳細リセット・モーダル開閉の pending 同期など、
    // 外部入力に反応して state を揃える effect をこのアプリでは意図的に使う。
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);
