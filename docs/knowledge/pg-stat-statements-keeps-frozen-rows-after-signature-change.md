---
name: pg-stat-statements-keeps-frozen-rows-after-signature-change
description: 運用知見(2026-09-02実測) — pg_stat_statementsは関数のシグネチャを変えると旧クエリの行を凍結したまま残す。callsだけ見ると死んだ行を現役と誤読する。stats_sinceを必ず併記すること
created: 2026-09-02
updated: 2026-09-02
---

`pg_stat_statements` は関数のシグネチャを変えると、**旧シグネチャを呼んでいたクエリの行を削除せず、その時点の `calls` のまま残す**。以後1件も増えないが、行としては存在し続けるので `order by calls desc` の先頭に居座る。

monocoreの実測（2026-09-02、`replace_schedules_for_day` を `%pgrst_source%` で絞った結果）:

| queryid | calls | stats_since |
|---|---|---|
| 5998…5354 | 19,283 | 2026-03-17（**凍結。2026-08-03のシグネチャ変更以降ゼロ**） |
| 4142…3787 | 1,073 | 2026-08-03（現行） |

**2026-08-26の障害調査（[[schedule-revision-conflict-retry-storm]]）は、この凍結行の19,283を「現役のRPCの呼び出し回数」として読んでいた。** 実際には3週間前から動いていない数字で、そこから引いた推論には根拠が無かった。

**対処**: `pg_stat_statements` を読むときは **`calls` を単独で見ない。`stats_since` を必ず一緒に出す**（pg_stat_statements 1.11 / PostgreSQL 16以降。無ければ拡張のバージョンを確認する）。同じ関数名で複数行が出たら、シグネチャ変更やPostgRESTのクエリ形の違いで分かれている可能性を先に疑う。`queryid` を並べれば別物であることがすぐ分かる。

関連: [[schedule-revision-conflict-retry-storm]] / [[client-side-guard-cannot-reach-the-runaway-client]] / [[monocore-postgrest-request-flood]]
