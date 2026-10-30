# Supabase 運用 — 権限・migration・観測・復旧

実装が守る規約は `docs/DEVELOPMENT.md`(データの正と書き込み規約・Database Management)、設計制約は `docs/design.md`。ここに置くのは**実機で確かめた落とし穴と手順**で、コードの特定行に紐づくものはそのコード側のコメントが正(該当箇所を示す)。バックアップと復元は `docs/supabase-backup.md`。

## 1. service_role と `auth.uid()`

- service_role key の JWT には `sub` クレームが無く、DB 側の `auth.uid()` は **NULL** になる。したがって `auth.uid()` を前提にした `SECURITY DEFINER` RPC(`replace_schedules_for_day`)は service_role から呼ぶと `P0001 Not authenticated` で弾かれる。`GRANT EXECUTE ... TO service_role` を足しても無意味(GRANT は入口の権限で、関数本体のチェックは別)。`user_id UUID NOT NULL DEFAULT auth.uid()` の列は service_role からの INSERT で明示指定が要る(省略すると `23502`)。RLS のバイパスは効く(SELECT 等は通る)。実測 2026-07-17。
- 対処は **`p_user_id` を明示引数で受ける service_role 専用 RPC を加算的に足す**(`replace_schedules_for_day_as`)。採らなかった案: JWT secret で `sub` 入りトークンを自前発行する(署名鍵の所持=任意ユーザーへのなりすまし能力で、service key より危険)/呼び出し側で DELETE+INSERT を再実装する(日単位置換のアトミック性を二重実装し、2デバイス編集の競合リスクを負う)。
- `replace_schedules_for_day_as` は 2026-10-23 から日付(`p_day_key`)と期待する版(`p_expected_revision`)を受け、その日の UTC の範囲は日付から日本時間(Asia/Tokyo 固定)で RPC の中で計算し(範囲やタイムゾーンを呼び出し側が選べると、画面とずれた日の版で書けて競合検出をすり抜けた。日ごとの版は書き込む側がみな同じタイムゾーンで日を区切る前提。migration `20261023240000`。スキルも Asia/Tokyo 以外では書かない)、画面用の `replace_schedules_for_day` と同じ日ごとのロックの中で版を確かめて +1 する(monocore#1。migration `20261023220000`)。それまでは版を見も進めもせず、同じ日を開いたままの画面が AI の書き込みを古い内容で黙って上書きしえた。版が違えば書かずに `-1 - 今の版` を返し、monocore スキルは読み直して最大3回やり直す。
- service_role 専用 RPC は認証チェックを持たないので、Postgres 既定の PUBLIC EXECUTE のままだと **anon が任意ユーザーのデータを壊せる**。`REVOKE ALL ... FROM PUBLIC, anon, authenticated` → `GRANT EXECUTE ... TO service_role` を必ず付ける(baseline migration 末尾。本番で anon/publishable key が 401 になることを確認済み 2026-07-17)。
- 置換 RPC はその日を削除→再挿入するため、AI が1件足すだけでその日の人間の予定も `updated_by='agent'` になる。この日単位の粗さは許容している(2026-07-17)。表示の未決は `docs/design.md` §2。

### AI 編集スキル

- 所在は `~/.claude/skills/monocore/`(`SKILL.md` + `monocore.py`、Python 標準ライブラリのみ。git 管理外)。対応は **schedules のみ**で、inbox のコマンドは無い。書き込み系は `updated_at` 条件の PATCH(楽観ロック)と `updated_by='agent'` が共通。`set-status --dry-run` で対象を先に表示できる。
- 認証情報は `~/.monocore/config.json` の `envs.<env>`(scraper と同じ置き場)。**既定環境は `remote`(本番)**。`local` はラップトップ上の開発用砂場で、スマホやブラウザが見る本番とは別物なので、`local` を既定にすると AI の編集が実データに一切反映されない。「本番を壊さない安全策」と「機能の既定動作」を同じフラグに乗せない。
- inbox へ AI が書くには REST 直叩き(`/rest/v1/inboxes`)の read-modify-write になる(1ユーザー1行の TEXT blob。追記 API は無い)。blob を丸ごと差し替えるため: 事前にバックアップ、冪等マーカー(追記済みの目印文字列を `content` に含むかで判定)、GET が1行でなければ中止、読み戻し検証(文字数とマーカー)、**本文をログに出さない**(認証情報が混在していた実績がある。長さだけ出す)、鍵はスクリプト側が config.json を自分で読みコマンドラインにも出力にも出さない。

## 2. PostgREST の落とし穴

実装側の注記は `scraper/store.py` 冒頭。要点:

- 一括 INSERT/upsert は配列内の全オブジェクトのキー集合が一致していないと `PGRST102 "All object keys must match"` で 400。値が無い列も `null` で埋める。DEFAULT 付きの列も同様。記事に OGP 画像が揃っていた回だけ成功するので、テストデータが揃っていると気づけない。
- クエリ文字列に timestamptz を素で埋めると `+00:00` の `+` が空白にデコードされ `22007`。`updated_at` を条件にした CAS(楽観ロック)の PATCH がこれで全滅する。URL エンコードするか `Z` 表記にする。コードレビューでは見つからず、実行して初めて出た(2026-07-17)。
- 1レスポンスは `max_rows=1000` で切れる。ページングしないと黙って欠ける。

## 3. migration の運用

- **本番へ push する前に `npx supabase migration list`(または `db push --dry-run`)で差分を見る。** 2026-07-17 に 2026-04-13 の migration が3ヶ月間本番未適用のまま隠れていた(ローカルは applied、本番には関数が無い)。「今回追加した分だけ」の思い込みで push すると、古い未適用分を見落とすか想定外に巻き込む。
- **リモートへの `supabase db push` は、Claude Code のセッションから通るときと自動許可のゲートに拒否されるときがある**(2026-07 時点は Bash/PowerShell とも拒否、2026-09-28 は `--dry-run` の後に通った。ローカルの `migration up` は常に通る)。拒否されうる前提で、DDL を含む作業は「本人が1コマンド打つ」工程が挟まっても成立するように組む: リモート適用後にしか検証できないこと(本番データ確認・投入スクリプトの実走)を完了条件に混ぜない/列の RENAME は DB とアプリのどちらが先でも画面が落ちるので、指示にはコマンドだけでなく順序(適用→デプロイ)を書く/定時ジョブ(ops-daily。毎日04:00)と同時間帯なら、失敗しても安全な失敗の仕方を用意しておく。
- **migration はコミットした時点で、他のセッションの `db push` に乗って本番へ当たりうる**。2026-10-07 に `20261007120000_add_plan_goals.sql` が、レビューの指摘(期日の上限 CHECK)を書き足す前の版のまま別セッションの push で適用された。適用済みのファイルを後から直しても本番には当たらないので、差分は冪等な追いかけの migration で当てる(`20261007130000`)。直したら `npx supabase db query --linked` で本番の制約・権限を読み直して確かめる。
- 履歴の drift(スキーマは適用済みだが `supabase_migrations.schema_migrations` に記録が無く、`migration up` が再実行しようとして失敗する)は `npx supabase migration repair --status applied <version> --local` で帳簿だけ合わせる。スキーマもデータも触らない。非冪等な migration(`CREATE TRIGGER`、`sort_order` のバックフィル UPDATE)は再実行すると手動並び順が壊れるので、repair が正解。
- ローカル Supabase の `postgres` ロールは superuser ではない(`rolbypassrls` のみ。拡張の導入で `permission denied to create extension`)。superuser は `supabase_admin`: `docker exec -i -e PGPASSWORD=postgres <db_container> psql -U supabase_admin -d postgres`。

## 4. `supabase gen types`

`npx supabase gen types typescript --local` の生成物で `src/types/database.types.ts` を**丸ごと上書きしない**。一時ファイルへ出して diff を取り、必要な差分(新テーブルのブロック)だけ手で入れる。理由:

- 初回実行で postgres-meta の Docker イメージが未取得だと `docker pull` の進捗ログが stdout に混ざり、生成ファイルが `Connecting to db 5432` / `Unable to find image ...` で始まって lint が落ちる(2026-08-09)。イメージはキャッシュされるので同じコマンドの再実行で直る。生成直後に `head` で先頭を見る。
- CLI 2.114.0 は `__InternalSupabase: { PostgrestVersion: "14.1" }` ブロックを出力しない(2026-08-14)。supabase-js が型推論に使うブロックで、上書きすると黙って消える。
- PowerShell の `>` は CRLF で書き出すため、LF のファイルを置き換えると全行が差分になる。

## 5. 破壊的な RPC・操作の前に

- 「権限が通るか」の疎通確認を実呼び出しで行わない。置換方式の RPC に `p_items=[]` を渡して GRANT を確かめたつもりで、対象日の実データ2件を削除した(2026-07-17)。ACL は `pg_proc.proacl` を読めば分かり、権限テストは `SET ROLE` + EXECUTE の権限エラー有無で判定できる。
- 実呼び出しが要るなら、対象が空であることを**直前に**確認する(別の日を無検証で選んで踏んだ)。
- 破壊的操作の前に指紋を取る: 件数 + `md5(string_agg(id::text, ',' ORDER BY id))`。原状復帰を証明でき、事故にも即座に気づける。
- replace / sync / upsert 系の API は「引数が空=全削除」を意味しがち。空入力を最も危険な入力として扱う(`scripts/upsert-reports.mjs` がローカルに1件も無いとき拒否するのはこのため)。
- 消してしまった行の復元は `docs/supabase-backup.md`「バックアップが無いとき」。

## 6. 観測 — `pg_stat_statements` と Logs Explorer

- `npx supabase inspect db calls --linked` の上位1件は PostgREST が全リクエストで打つ `select set_config('search_path',…), set_config('request.jwt.claims',…), …`。2026-08-26 時点で **105,652,935 回**(全実行時間の 75.4%)、2位(`SHOW transaction_read_only` 53,806 回)から約 2000 倍離れていた。アプリの実クエリは数万回。この乖離は**リクエスト本数**の指標で、大多数のリクエストが実クエリに到達していない(認証失敗・OPTIONS・存在しないパス等)ことを示す。Disk IO 予算の枯渇はデータ量でもクエリ効率でもなくリクエスト本数で起きた(実体は §8 のストーム)。
- `Sync IO time` が全行 `00:00:00` なのは `track_io_timing` が off だから。IO の帰属は `pg_stat_statements` からは取れない。`outliers` 上位の `-- source: dashboard` 付きは Studio の内省クエリでアプリとは無関係。
- **例外で終わった RPC は `calls` に載らない**。2026-08-25 のストームは毎秒数百回撃っていたが、生きている行の累計は 1,073 のまま増えなかった。migration `20260902001000` 以降は競合も正常終了なので `calls` に載る。`replace_schedules_for_day` の現行行は `queryid = 4142597199470143787`(`stats_since` 2026-08-03)、平常値は**1日 35 回程度**。桁で伸びていたら何かが空回りしている。エラーログには出ないので、これが唯一の検知手段。
- 関数のシグネチャを変えると、旧シグネチャを呼んでいたクエリの行は削除されず**その時点の `calls` のまま凍結して残る**(`order by calls desc` の先頭に居座る)。`calls` を単独で見ず **`stats_since` を必ず併記する**(pg_stat_statements 1.11 / PostgreSQL 16 以降)。同じ関数名で複数行あれば `queryid` を並べて別物と確認する。2026-08-26 の障害調査は凍結行の 19,283 を現役の呼び出し回数と誤読した。
- Logs Explorer(`/logs/explorer`)の `edge_logs` に対するクエリは、`unnest(metadata)→unnest(request)→unnest(headers)` の集計・生の行・`where` 無し・`LIMIT` 付きのどれも `Backend error! Retry your query.` で落ちた(2026-09-02。GUI の `/logs/edge-logs` は未検証)。リクエスト元(User-Agent)を特定する経路は実質これしか無く、落ちると特定できない。`auth.sessions` の `user_agent`/`ip` は端末の一覧しか出ない。端末の特定に依存しない止め方(§7、サーバ側で無害化)を先に持つ。

## 7. 暴走クライアントの止め方

- `delete from auth.sessions` は効かない。`auth.sessions` が制御するのはトークンの refresh だけで、`auth.uid()` は JWT のクレームから読まれる。発行済みアクセストークンは有効期限(既定 3600 秒)まで通り続ける。
- JWT secret のローテーションは全トークンを即失効させるが、旧形式(`eyJ...`)の anon/service_role キーも同じ secret で署名されているので巻き添えで失効する。本番の service_key は旧形式なので、Vercel の環境変数・scraper の config・スキルの config を全部更新することになる。新形式(`sb_publishable_*` / `sb_secret_*`)ならこの巻き添えは無い。
- 実際に効いたのは**サーバ側を書き換えてリクエストを成功させる**こと: `update schedule_day_revisions set revision = <クライアントの期待値> where day_key = '...'` で次の1回の保存が通り、クライアントの dirty が落ちて数秒で止まった(2026-08-26)。関数もキーもスキーマも触らない。ただし成功させる以上、そのクライアントのペイロード(このときは**空の予定表**)が書き込まれる。実行前に対象日のデータを退避する。期待値を正確に当てないと効かない(2026-09-02: 50 へ戻したが暴走側の期待値は 53 だった)。巻き戻した値は、過去にその値を読んだ古いクライアントと偶然一致して古い内容で上書きされる経路を作るので、止血後は過去の最大値より上へ戻す。
- 根本対処は RPC が競合で例外を投げないこと(migration `20260902001000`。理由はそのファイルのコメント)。クライアント側の行儀では塞げない: 直した JS を受け取るのはリロードしたクライアントだけで、暴走している当人は定義上そこに含まれない(2026-09-01 に全端末をリロードしても止まらず、暴走クライアントは特定できなかった)。
- 停止の判定は CPU グラフではなく(1時間バケットで遅れる)**ログのエラー行が今も流れているか**。

## 8. 障害記録

- **2026-07-17 データ消失**: §5。dead tuple から全項目を原値で復元(`docs/supabase-backup.md`)。
- **2026-08-25〜26 / 2026-09-01 40001 リトライストーム**: 症状は Disk IO 予算枯渇の警告メール、CPU 約 55% で固定(IOwait ≈ 0)、Logs に `40001 Schedule revision conflict for 2026-08-29: expected 11, current 14` が毎秒数百件。機序は `RAISE EXCEPTION` が競合のたびに Postgres のエラーログを1行書き、毎秒数百行のログ書き込みがディスクスループットを食ったこと(IOwait がゼロなのはログ生成側の CPU で詰まっていたため)。復帰不能になった構造は、旧 `useSchedules.ts` が競合時に dirty を消さない × reload が dirty な日をサーバ値で上書きしない、の組み合わせ。楽観ロックの競合ハンドラには「次の試行が前回と違う入力になる保証」か「試行を止める保証」のどちらかが要る。現在は両方ある(`useSchedules.ts` の打ち切り + RPC が書き込まず戻り値で返す)が、フック側の打ち切りは `decideAfterSave`(`src/lib/schedules/sync.ts`)に切り出してテストで守っている(競合は1回目で必ず打ち切る・失敗は上限回数で打ち切る。monocore#1、2026-10-23)。ロールアウトはクライアント(`80bd902`)→本番デプロイ確認→migration 適用の順で行った(逆だと旧クライアントが競合を成功と誤読する)。
- **2026-08-29 inbox 空文字上書き**: `inboxes.content` が空で保存された(`updated_at = 2026-08-29T14:16:00Z`)。監査ログが無く確定はできないが、最有力は `useInbox.ts` の「デバウンス保存 + タブ非表示時の即時 flush」で、全選択して消した直後にアプリがバックグラウンドへ回ると空の状態がそのまま確定する経路(2026-03-25 に直した2デバイス同時編集とは別経路で、未修正)。復旧点は 2026-08-11 の手動バックアップまでで、以後の追記は失われた。対策は `inbox_revisions`(migration `20260830010000`。事後に遡れる安全網で、空保存自体は防いでいない)と定時バックアップ(ops-daily)。「保存直前に内容が大きく縮む場合は確認を挟む」は未着手。
