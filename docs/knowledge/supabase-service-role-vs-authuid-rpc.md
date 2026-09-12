---
name: supabase-service-role-vs-authuid-rpc
description: 運用知見 — Supabaseのservice role keyでは auth.uid() 依存のSECURITY DEFINER RPCが必ず失敗する。monocoreのAI編集権(M1)の前提が実機で破綻した実例
created: 2026-07-17
updated: 2026-07-17
---

# service role key と auth.uid() 依存RPCは両立しない

2026-07-17のtaskbox drain(monocore M1)で、ローカル実機検証により確認した事実。

## 事実

Supabaseの **service role key のJWTには `sub` クレームが無い**ため、DB側の `auth.uid()` は **NULL** を返す。したがって:

- `auth.uid()` を前提に書かれた `SECURITY DEFINER` RPC は、service_role から呼ぶと本体のガードで弾かれる。
- `GRANT EXECUTE ... TO service_role` を付けても**無意味**(GRANTは入口の権限であり、関数本体の `auth.uid()` チェックは別)。
- テーブル定義が `user_id UUID NOT NULL DEFAULT auth.uid()` の場合、service_roleでのINSERTは **user_idの明示指定が必須**(省略するとNOT NULL違反)。
- 一方、**RLSのバイパスは効く**(SELECT等は通る)。

monocoreでの実測(local):

| 操作(service_role) | 結果 |
|---|---|
| `rpc/replace_schedules_for_day` | `P0001 Not authenticated` |
| `POST /tasks` (user_id省略) | `23502` NOT NULL違反 |
| `GET /tasks` | 成功(RLSバイパス) |

## 含意(設計上の教訓)

**「RLSとauth.uid()で組んだアプリに、後からAI/バックエンドの書き込み経路を足す」とき、既存のユーザー前提RPCはそのまま再利用できない。** 取りうる道は3つで、それぞれ代償がある:

1. service_role用に `user_id` を明示引数で受けるRPCを**加算的に追加**する(素直・推奨)。
2. JWT secretで `sub` 入りトークンを自前発行する(migration不要だが、**署名鍵の所持=任意ユーザーへのなりすまし能力**であり service key より危険)。
3. 呼び出し側でRPCロジックを再実装する(ロジック二重化)。

## 一般化

`auth.uid()` はリクエストのJWTクレーム由来であって「DBの現在ロール」ではない。**service_role は「認証済みユーザー」ではなく「認証を迂回する管理者」**であり、両者を同一視した設計は破綻する。AI書き込み経路を設計する際は、この区別を最初に確認すること。

関連: [[monocore-user-gateway-decision]] / [[front-ui-requirements]]
