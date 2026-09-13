# Supabase / PostgREST 運用の落とし穴

いつ読むか: Supabase CLI（gen types / migration / db push）や PostgREST への直接リクエストを書く・デバッグするとき。

## `supabase gen types` の罠

### 生成物を丸ごと上書きすると `__InternalSupabase` ブロックが消える（2026-08-14実測）

supabase CLI 2.114.0の `gen types` は、既存の `database.types.ts` にあった以下を**出力しない**（supabase-jsがPostgRESTのバージョン推論に使うブロック）。

```ts
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
```

生成物でファイルを丸ごと置き換えると既存の記述が黙って消える。対処: 生成物を直接上書きせず、一時ファイルに出して既存ファイルとdiffを取り、必要な差分（新テーブル分）だけ手で入れる。結果としてgitの差分も追加分だけになりレビューしやすい。加えて、PowerShellの `>` リダイレクトは**CRLF**で書き出すため、LFのファイルを丸ごと置き換えると全行が変更扱いになる点でも「生成→diff→必要分だけ手挿入」が安全。

### 初回実行時、Dockerイメージ未取得だとpullログがstdoutに混ざり生成ファイルが壊れる（2026-08-09実測）

`npx supabase gen types typescript --local > file` は、postgres-metaのDockerイメージがローカル未取得だと `docker pull` の進捗ログがstdoutに混ざり、生成ファイルの1行目が `Connecting to db 5432` 等になってTypeScriptとして壊れる（`npm run lint` が構文エラーで落ちる）。イメージは初回pull後にキャッシュされるため、**同じコマンドをもう一度実行するだけで直る**（2回目はpullが走らずクリーンな出力）。

一般則: 初回実行が絡みうるCLIコマンドを `>` でリダイレクトするときは、生成物の先頭を必ず目視確認する。Docker系（supabase CLI・testcontainers等）は「未取得イメージのpullログがstdoutに乗る」パターンが起きうる。

## PostgRESTへのリクエスト形式

### 一括INSERT/upsertはキー集合が完全一致していないと400（PGRST102、2026-08-14実測）

monocoreの `articles`（RSS記事）テーブルへの一括POSTで実測。配列内の片方のオブジェクトに `image_url` があり、もう片方に無いだけで全体が `{"code":"PGRST102","message":"All object keys must match"}` で落ちる。DEFAULT付きの列（例: `collected_at TIMESTAMPTZ DEFAULT now()`）も同様で、一部の行だけ明示すると落ちる。

対処: 省略可能な列は値が無くても `null` を明示して入れ、配列内の全行で同じキー集合にする。「値が無い項目はキーごと落とす」という自然な書き方（`if image: row["image_url"] = image`）がそのまま地雷になる。刺さる条件が厄介で、巡回した記事にたまたま全部OGP画像があった回は成功し、1本でも無い回だけ全滅する——テストデータが揃っていると気づけないため、キー集合が揃っていない配列を1本テストに固定しておくとよい。

### クエリ文字列の `+` は空白にデコードされる（22007、CASが全滅する罠）

PostgRESTが返す `updated_at` は `2026-07-16T23:35:11.412738+00:00` のようにタイムゾーンオフセットの `+` を含む。これをそのままクエリ文字列に埋めると、`+` はURL仕様で空白としてデコードされ、サーバ側に `...412738 00:00` が渡って `22007 invalid input syntax for type timestamp with time zone` で失敗する。`urllib.parse.quote(value, safe="")` 等で必ずエンコードする。

`updated_at` を条件にした条件付きPATCH（compare-and-swap = 楽観ロック）でこれを踏むと**更新系が全滅する**。HTTP 400で落ちるので気づけるが、コードを読むだけでは見つからない（2026-07-17のmonocore M1で実機検証して初めて発覚。cursor-agent生成コード・Claudeのコードレビュー・agyのQA1回目のいずれも事前検出できず、実行して初めて出た）。

一般則: 外部サービスに投げるURLの組み立ては、値の中身（`+` `&` `=` 空白 非ASCII）を疑ってエンコードする。id等の一見安全な値も同様。

## ローカルSupabaseの運用

### superuserは `postgres` ではなく `supabase_admin`

ローカルSupabase（`supabase start`）の `postgres` ロールは `rolsuper = false`（`rolbypassrls` はtrue）。拡張の導入等で `permission denied to create extension` になる場合、superuserである `supabase_admin` を使う。

```
docker exec -i -e PGPASSWORD=postgres <db_container> psql -U supabase_admin -d postgres
```

(パスワード無しだと `password authentication failed`。`PGPASSWORD=postgres` が必要)

### migration履歴のdriftは repair で帳簿だけ合わせる

「スキーマ上は適用済みだが `supabase_migrations.schema_migrations` に記録が無い」状態だと、`supabase migration up` が既適用分を再実行しようとして失敗する。帳簿だけを合わせるには:

```
npx supabase migration repair --status applied <version> --local
```

これはスキーマもデータも触らない記録操作なので安全。**再実行してはいけない理由がある場合ほどrepairが正解**: 2026-07-17時点のmonocoreの `202606061200` は非冪等な `CREATE TRIGGER` に加え sort_order のバックフィルUPDATEを含むため、再実行するとユーザーの手動並び順が壊れる。

## service role key と auth.uid() は両立しない（2026-07-17実機確認）

Supabaseの**service role keyのJWTには `sub` クレームが無い**ため、DB側の `auth.uid()` はNULLを返す。したがって:

- `auth.uid()` を前提に書かれた `SECURITY DEFINER` RPCは、service_roleから呼ぶと本体のガードで弾かれる。
- `GRANT EXECUTE ... TO service_role` を付けても無意味（GRANTは入口の権限であり、関数本体の `auth.uid()` チェックは別）。
- `user_id UUID NOT NULL DEFAULT auth.uid()` のテーブルへservice_roleでINSERTする場合、user_idの明示指定が必須（省略するとNOT NULL違反）。
- 一方、RLSのバイパスは効く（SELECT等は通る）。

monocoreでの実測（local）:

| 操作(service_role) | 結果 |
|---|---|
| `rpc/replace_schedules_for_day` | `P0001 Not authenticated` |
| `POST /tasks`（user_id省略） | `23502` NOT NULL違反 |
| `GET /tasks` | 成功（RLSバイパス） |

設計上の教訓: 「RLSとauth.uid()で組んだアプリに、後からAI/バックエンドの書き込み経路を足す」場合、既存のユーザー前提RPCはそのまま再利用できない。取りうる道は3つ、いずれも代償あり:

1. service_role用にuser_idを明示引数で受けるRPCを加算的に追加する（素直・推奨）。
2. JWT secretで `sub` 入りトークンを自前発行する（migration不要だが、署名鍵の所持=任意ユーザーへのなりすまし能力でありservice keyより危険）。
3. 呼び出し側でRPCロジックを再実装する（ロジック二重化）。

`auth.uid()` はリクエストのJWTクレーム由来であって「DBの現在ロール」ではない。service_roleは「認証済みユーザー」ではなく「認証を迂回する管理者」であり、両者を同一視した設計は破綻する。monocoreのAI編集権（M1）はこの前提が実機で破綻した実例。

## リモートDBへの適用

### `supabase db push` はAIセッションからは実行できない（2026-08-12実測）

リモートSupabaseへの `npx supabase db push --linked --yes` は、Claude Codeの自動許可ゲートに拒否される（Bash・PowerShellどちらのツールでも同じ結果。本人が事前に計画を承認していても変わらない）。ローカルへの `supabase migration up` は通る。

含意: リモートのスキーマ変更を含む作業は、「本人が1コマンド打つ」工程が必ず途中に挟まる前提で組む。

- リモート適用より後にしか検証できないこと（本番での実データ確認・投入スクリプトの実走）を完了条件に混ぜない。混ぜると作業が本人待ちで宙吊りになる。
- 適用前後で壊れる向きを先に確かめておく。列のRENAMEなら「DBが新・アプリが旧」でも「DBが旧・アプリが新」でも画面は落ちるので、本人へ渡す指示にはコマンドだけでなく順序（適用→デプロイ）を書く。
- 無人drainが同じ時間帯に走るなら、失敗しても安全な失敗の仕方を申し送りに書く。taskboxの `resume_when_http_200`（リモート未適用のテーブルをHTTP GETで検知してqueueへ自動復帰させる仕組み）はこの制約への既存の対処。

### 3ヶ月間隠れていたmigration未適用を発見・解消（2026-07-17）

M1のmigration `202607170830` を本番へpushする前に `npx supabase migration list` で確認したところ、**2026-04-13の古いmigration `202604131000`（タスク自動アンアーカイブRPC `apply_due_task_unarchives()`）が本番に一度も適用されていなかった**ことが判明（`db push --dry-run` が明示的に検出）。ローカルには存在し記録上も"applied"だったため、これまで誰も気づいていなかった。影響: `/tasks` ページがwaitingタブ取得前に必ず呼ぶRPCで、本番で関数が存在しない場合エラーになっていた可能性が高い(実際のフロントエンド挙動は未確認)。

ユーザー判断により、M1のmigrationと合わせて `--include-all` で一括適用し解消。適用後 `migration list` でlocal/remote全10件の一致を確認、新設RPC `replace_schedules_for_day_as` がanon/publishable keyから401で拒否されることも本番で実機確認済み。

一般則: 「ローカルでmigrationを作って動いた」は「本番に必要なmigrationが全て適用済み」を意味しない。両者の乖離（drift）は静かに進行し、機能がある日突然本番だけ壊れる、あるいは今回のように誰も気づかないまま数ヶ月放置される。**本番へmigrationをpushする前は必ず `supabase migration list`（または `db push --dry-run`）で差分を確認する。** 「今回追加した分だけ」という思い込みでpushすると、想定外の古い未適用分を見落とす/逆に想定外に巻き込む。

補足: 自動バックアップが停止していた場合、`npx supabase db dump --linked --data-only -f <path>` でその場の手動スナップショットが取れる（pg_dumpがローカルPATHに無くてもSupabase CLIが内部で処理する）。このダンプファイルは認証トークン等の機微データを含むため、リポジトリの `.gitignore` に確実に含めること。
