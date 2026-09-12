---
name: supabase-logs-explorer-edge-logs-queries-all-failed
description: 落とし穴(2026-09-02実測) — SupabaseのLogs Explorerで edge_logs へのクエリが何を書いてもBackend errorになり、リクエスト元のUser-Agent特定ができなかった。代替はpg_stat_statements
created: 2026-09-02
updated: 2026-09-02
---

monocoreの暴走クライアントを特定しようとして、SupabaseのLogs Explorer（`/logs/explorer`）で `edge_logs` からUser-Agentを取ろうとしたが、**書いたクエリが全て `Backend error! Retry your query.` で落ちた**。

試して全滅した形（どれも同じエラー）:

- `cross join unnest(metadata) → unnest(request) → unnest(headers)` で `user_agent` を集計するもの
- 同じ形で `group by` を外して生の行を並べるもの
- `where` の絞り込みを全て外したもの

先に「`LIMIT` を付けろ」と言われて付けたが、それでも変わらなかった。**列名の誤り（`cf_connecting_ip` が無い等）を疑って削っても直らなかったので、クエリ側ではなく分析基盤側の問題**と判断した。GUI側（`/logs/edge-logs`）は未検証。

**代替として使えたもの**: `pg_stat_statements`。RPCの呼び出し回数の伸びを見れば「今も叩かれているか」は判定できる。ただし**例外で終わったRPCは `calls` に載らない**ので、暴走の最中には使えず、例外を投げないRPCへ書き換えた後でしか効かない（[[pg-stat-statements-keeps-frozen-rows-after-signature-change]]）。

**教訓**: Supabaseで「どの端末が叩いているか」を知る手段は、実質 `edge_logs` しかない。それが落ちると**リクエスト元を特定する経路が無くなる**。`auth.sessions` の `user_agent` / `ip` は端末の一覧は出せるが、どれが叩いているかは分からない。端末の特定に依存しない止め方（サーバ側で無害化する）を先に用意しておく方が確実。

関連: [[client-side-guard-cannot-reach-the-runaway-client]] / [[schedule-revision-conflict-retry-storm]]
