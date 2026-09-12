---
name: schedule-revision-conflict-retry-storm
description: 障害(2026-08-25夕方発生・08-26特定) — monocoreのschedules保存で楽観ロックが40001で恒久的に失敗し続け、クライアントが最速リトライしてSupabaseのCPU55%固定・Disk IO予算枯渇を招いた。原因は「競合時にdirtyフラグを消さない」×「reloadがdirtyな日をサーバ値で上書きしない」の組み合わせで復帰不能状態になること
created: 2026-08-26
updated: 2026-09-04
---

**症状**: SupabaseからDisk IO予算枯渇の警告メール。ダッシュボードのCPUは約55%(User約40%/System約12%、IOwaitはほぼゼロ)、ネットワークは767KB/sで、いずれも**2026-08-25の17〜18時頃に立ち上がって以降フラットな高原**。Logs Explorerに `40001 Schedule revision conflict for 2026-08-29: expected 11, current 14` が**1秒間に数百件**、同一メッセージで並び続けていた。

**機序**: `replace_schedules_for_day` の楽観ロックが `RAISE EXCEPTION` で弾かれるたびPostgresがログを1行書く。毎秒数百行のログ書き込みがディスクスループットを食い、Disk IO予算を枯らした。**Disk IOはデータでもクエリでもなくエラーログで消費されていた**。IOwaitがほぼゼロなのは、ディスク待ちではなくログ生成側のCPUで詰まっていたため。

**復帰不能になる構造**(monocore/src/hooks/useSchedules.ts):
1. `saveDay` は競合時に `setSyncError` するだけで、`dirtyDateLabelsRef` からその日を**消さない**(削除は成功パスの中にしかない)。
2. `reloadSchedules` はサーバから最新revisionを取ってくるが、`dirtyDateLabelsRef.has(...)` の日は `prev[index]` を残す = **古いrevisionを保持し続ける**。

この2つが噛み合うと、クライアントのexpectedは11に固定され、サーバのcurrentは14のまま動かず、何度やっても必ず失敗する。リトライ回数の上限もバックオフも無い。

**教訓**: 楽観ロックの競合ハンドラは「エラーを表示する」だけでは足りない。**次の試行が前回と違う入力になる保証**(サーバ値の取り込み)か、**試行を止める保証**(失敗カウンタ)のどちらかが要る。どちらも無いと、1クライアントが無人でインスタンス1台を飽和させる。

**気づけなかった理由**: pg_stat_statementsを読み違えた。**失敗しているクエリは `calls` に載らない**（2026-09-02に再確認: stormが最低でも数万回撃っているのに、生きている行の累計は1,073回のまま）ので、実クエリ数は当てにならず、リクエスト本数との乖離を手がかりにする必要があった。PostgRESTが全リクエストで打つ `set_config` だけが1億565万回に膨れて見えていた。

なお、このとき根拠に挙げた「19,283回」は**別の理由で無意味な数字だった** — 2026-09-02に `stats_since` を見て判明したが、あれは2026-08-03のシグネチャ変更で**凍結された旧RPCの行**で、3週間前から1件も増えていない。詳細は [[pg-stat-statements-keeps-frozen-rows-after-signature-change]]。

関連: [[monocore-postgrest-request-flood]] / [[monocore-prod-db-is-1mb-scale]] / [[postgrest-plus-sign-query-encoding]]

**収束(2026-08-26 20:46)**: `delete from auth.sessions` では止まらず(理由は[[supabase-session-delete-does-not-revoke-jwt]])、`schedule_day_revisions.revision` をクライアントの期待値に戻して保存を1回成功させたところ数秒で停止した。副作用として、暴走側が保持していた内容(**空の予定表**)が2026-08-29に書き込まれ、その日の既存予定は消えた。クライアント側の修正はmonocore `720ca58` としてmainへpush済み。

**再発(2026-09-01)**: 同じ形で再発し、`720ca58` のクライアント側打ち切りは何の役にも立たなかった(全端末リロードでも止まらず、暴走クライアントは特定できないまま)。防護をサーバ側へ移し、RPCが例外を投げず戻り値で競合を返す形にした → [[client-side-guard-cannot-reach-the-runaway-client]] / optimistic-lock-conflict-return-value-needs-sign-separation。
