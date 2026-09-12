---
name: postgrest-plus-sign-query-encoding
description: 運用知見 — PostgRESTのクエリ文字列にtimestamptzを素で埋めると '+' が空白扱いになり22007で失敗する(URLエンコード必須)。楽観ロックのCASが全滅する罠
created: 2026-07-17
updated: 2026-07-17
---

# PostgREST: クエリ文字列の `+` は空白にデコードされる

PostgRESTが返す `updated_at` は `2026-07-16T23:35:11.412738+00:00` のようにタイムゾーンオフセットの `+` を含む。これを**そのまま**クエリ文字列に埋めると、`+` はURLの仕様で**空白としてデコード**され、サーバ側には `2026-07-16T23:35:11.412738 00:00` が渡り、

```
{"code":"22007","message":"invalid input syntax for type timestamp with time zone: \"...412738 00:00\""}
```

で失敗する。`urllib.parse.quote(value, safe="")` 等で必ずエンコードする。

**なぜ重要か**: `updated_at` を条件にした条件付きPATCH(compare-and-swap = 楽観ロック)を使う場合、この罠を踏むと**更新系が全滅する**。HTTP 400で落ちるので気づけるが、コードを読むだけでは絶対に見つからない(2026-07-17のmonocore M1で実機検証して初めて発覚。cursor-agent生成コード・Claudeのコードレビュー・agyのQA1回目のいずれも事前には検出できず、実行して初めて出た)。

**教訓の一般形**: 外部サービスに投げるURLの組み立ては、値の中身(`+` `&` `=` 空白 非ASCII)を疑ってエンコードする。id等の一見安全な値も同様(クエリ injection の余地になる)。

関連: [[monocore-ai-edit-skill]]
