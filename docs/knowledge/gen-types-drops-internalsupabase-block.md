---
name: gen-types-drops-internalsupabase-block
description: 落とし穴(2026-08-14実測) — supabase CLI 2.114.0の gen types は __InternalSupabase(PostgrestVersion)ブロックを出力しない。生成物でファイルを丸ごと置き換えると既存の記述が黙って消えるので、差分を見て手で戻す
created: 2026-08-14
updated: 2026-08-14
---

# `supabase gen types` は `__InternalSupabase` を落とすことがある

2026-08-14、monocore で `articles` テーブル追加後に `npx supabase gen types typescript --local` を実行したところ、既存の `src/types/database.types.ts` にあった以下が**生成物から消えていた**（CLI 2.114.0）:

```ts
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
```

このブロックは supabase-js が PostgREST のバージョンを型推論に使うためのもの。**生成物でファイルを丸ごと上書きすると黙って失われる。**

対処: 生成物を直接上書きせず、**一時ファイルに出して既存ファイルとdiffを取り、必要な差分（今回は新テーブルのブロック27行）だけを手で入れる。** 結果として git の差分も「新テーブルの追加のみ」になり、レビューしやすい。

もう1点: PowerShell の `>` リダイレクトは **CRLF** で書き出すので、LFのファイルを置き換えると全行が変更扱いになる。この意味でも「生成→diff→必要分だけ手挿入」が安全。

関連: [[supabase-gen-types-stdout-pollution]]（同じコマンドの別の落とし穴。初回実行時にdocker pullログがstdoutに混ざる）
