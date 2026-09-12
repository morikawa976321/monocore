---
name: monocore-inbox-write-requires-rest
description: 運用知見(2026-08-13) — monocoreのinboxはスキル(monocore.py)にコマンドが無くschedules専用。書くにはREST直叩きで、1ユーザー1行のTEXT blobゆえread-modify-writeとバックアップ・冪等マーカー・読み戻し検証が要る
created: 2026-08-13
updated: 2026-08-13
---

# monocoreのinboxへ書くにはREST直叩きが要る（2026-08-13）

**落とし穴**: Claudeスキル `monocore` の `monocore.py` は **schedules専用**で、inboxのコマンドを持たない（`inbox` の語がソースに1つも無い）。「monocoreのinboxに追記して」という指示に対して、スキルを開いても手段が無い。

**書き方**: `inboxes` は `user_id` 主キーの**1ユーザー1行・単一TEXT blob**（`content`）なので、REST（`/rest/v1/inboxes`）でGET → 文字列連結 → PATCH の**read-modify-write**になる。追記APIは無い。実施時に必要だったもの:

- **バックアップを先に取る**（blobを丸ごと差し替えるため、失敗すると全損しうる）
- **冪等マーカー**（追記済みの目印になる文字列を `content` に含むかで判定。再実行での二重追記を防ぐ）
- **行数チェック**（GETが1行でなければ中止）と**読み戻し検証**（文字数とマーカー）
- **本文をログに出さない** — inboxには認証情報が混在していた実績がある（[[monocore-inbox-holds-plaintext-credentials]]）。長さだけ出す。

**鍵の扱いは reports の同期と同じ規約に従う**: スクリプト側が `~/.monocore/config.json` を自分で読み、値をコマンドラインにも出力にも出さない。セッションが鍵を取り出す形にすると権限分類器に落とされる（[[reports-sync-must-not-handle-key]] と同型）。

**副次的な事実**: 実行時点の `inboxes.content` は **2163文字・117行**。2026-07-21の棚卸し時点の266行・10,672字（[[monocore-inbox-absorbed-reference-lists]]）から大きく縮んでいる。
