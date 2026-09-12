---
name: postgres-dead-tuple-recovery
description: 運用知見 — 誤って消したPostgresの行は、VACUUM前ならpageinspectでdead tupleの生バイトを読んで完全復元できる(2026-07-17に実際に復旧した手順)
created: 2026-07-17
updated: 2026-07-17
---

# 誤削除したPostgresの行は VACUUM 前なら復元できる

2026-07-17のmonocore M1検証中、置換方式RPCに空配列を渡してユーザーの実データ2行を削除する事故を起こしたが、**全項目を原値のまま復元できた**。バックアップは存在しなかった(RasPiバックアップループは停止中・ローカルにダンプ無し)ので、これが唯一の復旧手段だった。

## 手順

1. まだ `VACUUM` が走っていないことを確認する(`pg_stat_user_tables` の `last_vacuum` / `last_autovacuum` が空、`n_dead_tup` > 0)。走ると物理的に消えるので**気づいたら即座にやる**。
2. `CREATE EXTENSION pageinspect;` (superuser必須)
3. `heap_page_item_attrs(get_raw_page('<table>', <blkno>), '<table>'::regclass)` で全ページを走査し、`t_xmax <> 0`(=削除済み)のタプルを拾う。`t_xmax` が削除したトランザクションIDなので、**自分の事故のxidだけを対象にできる**(他の古い削除を巻き込まない)。
4. 各属性のバイト列をPostgresの物理表現に従って復号する:
   - `uuid`: 16バイトraw → hexを8-4-4-4-12で区切る
   - `text`: varlena短形式は先頭1バイトが `(全長<<1)|1`、以降がUTF-8本体
   - `timestamptz`: 8バイト little-endian int64 = 2000-01-01 00:00:00 UTC からのマイクロ秒
5. 復号値でINSERTし直す(id・created_atも原値で戻せる)。
6. `DROP EXTENSION pageinspect;`

## 注意

- `xid` 型は順序演算子が無く `ORDER BY t_xmax` が通らない。`t_xmax::text` にキャストする。
- 移行直後に追加したカラム(`ALTER TABLE ADD COLUMN ... DEFAULT`)は**fast default**のため古いタプルには物理的に存在せず、属性が空で返る。その場合はDEFAULT値で復元するのが正しい。
- 復元の成否は**事故前に取った指紋**(`md5(string_agg(id::text,',' ORDER BY id))`)との一致で機械的に判定できる。破壊的操作の前にこの指紋を取る癖をつけると、原状復帰を証明できる。

関連: [[replace-rpc-empty-items-data-loss]] / [[supabase-local-superuser-and-migration-repair]]
