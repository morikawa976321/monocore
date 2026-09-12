---
name: monocore-postgrest-request-flood
description: 事実(2026-08-26判明) — monocore本番のpg_stat_statementsで、PostgRESTが全リクエストごとに打つset_config文が1億565万回に達しており、アプリの実クエリ(数万回)の約2000倍。Disk IO予算枯渇の原因はデータ量でもクエリ効率でもなくリクエスト本数
created: 2026-08-26
updated: 2026-08-26
---

SupabaseのDisk IO予算枯渇警告を受けて `npx supabase inspect db calls --linked` を実行した結果。

**上位1件が全実行時間の75.4%**: PostgRESTが1リクエストごとに発行する `select set_config('search_path',…), set_config('request.jwt.claims',…), set_config('request.cookies',…)` が **105,652,935回**(総実行時間25分51秒、1回あたり14.7マイクロ秒)。

**2位以下との断絶**: 2位は `SHOW transaction_read_only` の53,806回。**上位1件だけが約2000倍**離れている。アプリの実クエリは replace_schedules_for_day 19,283回 / inboxes upsert 14,749回 / auth.sessions 39,528回で、いずれも1人のユーザーが半年使った数として辻褄が合う。

ベースラインmigrationが2026-03-05なのでプロジェクト齢は約174日。仮に統計が一度もリセットされていないとして **7.0リクエスト/秒を24時間365日維持し続けた**計算になる。コンピュート再起動でpg_stat_statementsがリセットされていれば実レートはこれより**速い**。

**含意**: set_configが1億回なのに後続のテーブルクエリが数万回しかないということは、大多数のリクエストが実クエリに到達していない(認証失敗・OPTIONS・存在しないパスなど)。**コード側の最適化では解けない**ため、次の一手はダッシュボードのLogs Explorerで `edge_logs` をpath・user_agent・status_codeで集計し、発生源を特定すること。

**読み方の注意**: `Sync IO time` 列が全行00:00:00なのは track_io_timing がoffだからで、IOが無い意味ではない。pg_stat_statementsからIO帰属は取れない。

`outliers` の上位は全て `-- source: dashboard` コメント付きのStudio内省クエリ(pg_available_extensions等)で、アプリとは無関係。

関連: [[monocore-prod-db-is-1mb-scale]]
