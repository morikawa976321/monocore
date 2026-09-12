---
name: supabase-gen-types-stdout-pollution
description: 運用知見(2026-08-09実測) — npx supabase gen types typescript --local > file を初回実行時、postgres-metaのDockerイメージ未取得だとpullログがstdoutに混ざり生成ファイルが壊れる。無出力で再実行すれば直る
created: 2026-08-09
updated: 2026-08-09
---

# `supabase gen types` の初回pullログ混入（2026-08-09実測）

monocoreで新規テーブル追加後に `npx supabase gen types typescript --local > src/types/database.types.ts` を実行したところ、生成ファイルの1行目が `export type Json =` ではなく `Connecting to db 5432` や `Unable to find image 'public.ecr.aws/supabase/postgres-meta:v0.96.8' locally` から始まり、`npm run lint` が `Parsing error: Unexpected keyword or identifier` で落ちた。

## 原因

`supabase gen types` はローカルのpostgres-metaコンテナ経由でスキーマを読む。**そのイメージが未取得(ローカルに無い)だと、`docker pull` の進捗ログがコマンドのstdoutに混ざって出力される**。リダイレクト(`>`)は標準出力を丸ごとファイルへ書くため、pullログごとファイルに落ちてTypeScriptとして壊れる。

## 対処

イメージは初回pull後にローカルキャッシュされるため、**同じコマンドをもう一度実行するだけで直る**(2回目はpullが走らずクリーンな出力になる)。実測でも1回目は壊れ、2回目は正常だった。

## 一般則

**初回実行が絡む可能性のあるCLIコマンドを`>`でリダイレクトするときは、生成物の先頭を必ず目視確認する。** 特にDocker系(supabase CLI・testcontainers等)は「未取得イメージのpullログがstdoutに乗る」パターンが起きうる。lintやビルドが通ったから安全、ではなく生成直後の1回はheadで中身を見る習慣が安い保険になる。
