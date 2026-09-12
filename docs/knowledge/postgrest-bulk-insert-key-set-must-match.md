---
name: postgrest-bulk-insert-key-set-must-match
description: 落とし穴(2026-08-14実測) — PostgRESTの一括INSERT/upsertは配列内の全オブジェクトのキー集合が完全一致していないとPGRST102「All object keys must match」で400。省略可能な列はnullを明示して埋める
created: 2026-08-14
updated: 2026-08-14
---

# PostgRESTの一括INSERTはキー集合が揃っていないと400

2026-08-14、monocore の `articles` テーブル（RSS記事）の契約検証で実測。1回のPOSTに送る配列の中で、**片方のオブジェクトに `image_url` があり、もう片方に無い**だけで全体が落ちる:

```json
{"code":"PGRST102","details":null,"hint":null,"message":"All object keys must match"}
```

対処: **省略可能な列は値が無くても `null` を明示して入れ、配列内の全行で同じキー集合にする。** 「値が無い項目はキーごと落とす」という自然な書き方（`if image: row["image_url"] = image`）がそのまま地雷になる。

刺さる条件が厄介で、**巡回した記事にたまたま全部OGP画像があった回は成功し、1本でも無い回だけ全滅する**。テストデータが揃っていると気づけないので、キー集合が揃っていない配列を1本テストに固定しておくとよい。

DEFAULT 付きの列（`collected_at TIMESTAMPTZ DEFAULT now()`）も同様で、一部の行だけ明示すると落ちる。
