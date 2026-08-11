# project関連 シンプル化計画書

- 起票日: 2026-08-11
- 背景: `/projects`の`decisions`(判断の入出力)は「セッションを開かずに答えられる」ことを狙って作られたが、反映が1日4回(drain枠)・非同期という制約のもとでは実用上「結局セッションを開いた方が速い」とユーザー本人が判断した。至上目的を「ユーザーの文脈回復コスト(このプロジェクト、どこまで進んでたっけ？を思い出すコスト)を可能な限り下げること」と明確に再定義し、それ以外の機能(判断の入出力、網羅性の監査)は本質的でないと判断された。

## 0. 決定(2026-08-11・ユーザー承認済み): 15件の生きたdecisionsの退避手順

**現在、`project_cards.decisions`には8プロジェクトにまたがる15件の実データが入っている**(hci-research-master・health-apnea-bruxism-underweight・monocore-dev・cad-migration・product-web-sales・ai-infrastructure-ops・keyboard-36key・mattress-replacement)。単純に列を消すと、この場で消える。うち健康診断(8/13)と学会の早期締切(10/2)は時限性がある。

**ユーザー決定した退避ルール(そのまま実行すること)**:

> engineにすでに入っているものはそのまま消していい。あなたの判断で重要でないものは消していい。どちらでもないものはengineに記録せよ。

**DBマイグレーション(§4)の前に、この15件全てに対して以下を1件ずつ実行する**:

1. 各カードのcontext-engine `02_context/`該当ノートを確認する。その判断の内容(問い・文脈)が**既にengineのノートに書かれている**か。
   - **書かれている** → 何もせず削除してよい(重複を残さない)。
2. 書かれていない場合、実行者(あなた)の判断で**重要でない**(消えても実害が無い・些末)と判断できるか。
   - **重要でない** → 削除してよい。
   - 判断に迷う場合は「重要」側に倒す(engineへの記録コストは低く、消失の方が取り返しがつかない)。
3. 上記どちらでもない(engineに未記録・かつ重要) → **削除する前に`context-engine/01_inbox`へ1メモ1ファイルで記録する**(メモ魔方針)。特に健康診断(8/13)・学会締切(10/2)のような時限性のある項目は確実にここを通すこと。

15件全てについてこの判定が終わってから、§4のマイグレーションへ進む。

## 1. 結論(残すもの・落とすもの)

ユーザーが見たいのは3点のみ: **①状態(動/眠/トリガー待ち) ②どこまで進んだか ③次に自分が何をすべきか**。

| 分類 | 項目 | 対応 |
|---|---|---|
| 残す | `status`(状態) | **`waiting_user`/`waiting_other`を`waiting`(トリガー待ち)へ統合(2026-08-11確定)**。理由: 「誰が待たれているか」を分けても、実質のボトルネックは常にユーザー本人なので区別する意味が無い |
| 残す | `goal_slug`(5目標によるグルーピング) | 維持。文脈回復コストを下げる方向に寄与するため対象外と判断 |
| 残す | `ai_recent`(進捗) | 維持 |
| 残す | `your_turn`(次に本人がやること) | 維持。これが③そのもの |
| 残す | `deadline` / `deadline_note` | 維持。「トリガー待ち」の中身(いつ・何が)を示すのに必要 |
| 残す(暫定) | `definition_of_done`(完了条件) | 2026-08-11確定・暫定的に残す |
| 落とす | `decisions`(AIが聞きたいこと) | **§0の退避完了後に列ごと削除** |
| 落とす | `project_notes`テーブル・返信フォーム | 削除。判断の非同期回収という用途自体をやめるため |
| 落とす | `ai_next`(AIの次の一手) | 2026-08-11確定・削除。理由: 「AIの次の一手」であっても承認・発火させるのは結局ユーザー本人であり、AIと人間の次の一手を区別する意味が無い。経験的にもボトルネックは常に本人 |

**連鎖して不要になるもの**: `decisions`が無くなれば、「網羅性を保証する」ために存在していた重い監査機構(`reconcile-project-cards.mjs`・`project_cards_unrelated.json`・`sources[]`追跡・「画面に出る判断件数の検算」)は**存在理由を失う**。これが今回の複雑性削減の本体。

## 2. 冒頭の質問への回答: `sources`列とreconcile-project-cards.mjs

`sources`は実際に**過去にDBの列として存在し、削除済み**だった。`supabase/migrations/202603050053_squashed_baseline.sql`の冒頭コメント(6行目)に「作って後で消した変更(...project_cards.collapsed / sources)は最終形のみを反映」とあり、`collapsed`と揃って一度DBに実装され、後に`DROP COLUMN`されたことが確認できる。

**現在**: `sources`(と`collapsed`)はDBには存在しない。`upsert-project-cards.mjs`の`buildRow()`(実際に読んだ)も、この2つをテーブル行に含めていない。生きているのは**taskboxローカルの`project_cards.json`ファイル内のみ**で、そこでの役割は`reconcile-project-cards.mjs`が「一次ソース(context-engineのノート等)を漏れなくカードに反映できているか」を突合するための入力。この突合は主に**`decisions`が正しく網羅的に作られているか**(=既に決着した判断を誤って再提示しない、新しい判断を取りこぼさない)を担保するために設計された重い仕組み。

**`decisions`を落とすなら、reconcile-project-cards.mjsも道連れで不要になる。** `ai_recent`/`your_turn`の正確さ自体はSKILL.md 7-(a-2)の「一次ノート本文へ当たる」という基本動作だけで足りる(この部分は`decisions`固有の話ではなく、進捗記述一般の正確さの話なので存続させる)。

## 3. `project_notes`について

現在Supabase上の`project_notes`は**35件中、未消化0件**(2026-08-11時点で直接確認済み)。今すぐテーブルを落としても、拾い損ねる入力は無い。

## 4. DBマイグレーション(§0の確認完了後に実行)

**実行前に必ず現在の制約名を確認すること**(`information_schema.table_constraints`等で`project_cards`の`status`列に対するCHECK制約名を引く。以下の`project_cards_status_check`はPostgresの既定命名規則からの推定であり、squash後の実際の名と異なる可能性がある。異なる名前なら実際の名前に置き換える)。

```sql
-- project_cards から decisions・ai_next を落とす(2026-08-11確定)
ALTER TABLE public.project_cards DROP COLUMN decisions;
ALTER TABLE public.project_cards DROP COLUMN ai_next;

-- status: waiting_user / waiting_other を waiting(トリガー待ち)へ統合(2026-08-11確定)
-- 既存行の値移行が先。制約変更より前に実行すること。
UPDATE public.project_cards SET status = 'waiting' WHERE status IN ('waiting_user', 'waiting_other');
ALTER TABLE public.project_cards DROP CONSTRAINT project_cards_status_check;  -- 実際の制約名に置き換え
ALTER TABLE public.project_cards ADD CONSTRAINT project_cards_status_check
    CHECK (status IN ('active', 'waiting', 'dormant', 'done'));

-- project_notes を丸ごと廃止(2026-08-11確定)
DROP TABLE public.project_notes;
```

## 5. Monocore側のコード変更

- `src/components/projects/ProjectCard.tsx` — decisions描画ブロック(「AIが聞きたいこと」節)・ai_next描画ブロック(「AIの次の一手」節)・`ProjectNoteForm`呼び出しを削除。
- `src/components/projects/ProjectNoteForm.tsx` — ファイルごと削除。
- `src/lib/supabase/queries/project-notes.ts` — ファイルごと削除。`page.tsx`の`getProjectNotes`/`notesByCard`呼び出しも削除。
- `src/lib/projects/card.ts` — `parseDecisions`・`Decision`型・`parseAiNext`を削除。
- `src/types/database.types.ts` — 型再生成。

## 6. 投入スクリプト側の変更

- `scripts/project-cards-payload.mjs` — `validateDecisions`・`DECISION_REQUIRED_FIELDS`を削除。`buildRow()`から`decisions`・`ai_next`を除去。`ALLOWED_STATUSES`を`{active, waiting, dormant, done}`に変更(`waiting_user`/`waiting_other`→`waiting`統合)。
- `scripts/project-cards-payload.test.mjs` — decisions関連のテストケース削除、statusの許容値テストを新enumに更新。
- `scripts/reconcile-project-cards.mjs` — ファイルごと削除。
- `scripts/collect-decision-answers.mjs` — ファイルごと削除。

## 7. taskbox側の変更

- `taskbox/drain.ps1` — トリアージの「2) `/projects`からの入力(自由記述・判断の回答)が未回収か」ブロック(0c相当。142-246行目付近)を丸ごと削除。`$notesPending`関連のログ出力も削除。**2b(failed/の`resume_when_http_200`自動再開)はdecisionsと無関係なので残す**(混在しているブロックなので削除範囲に注意)。
- `taskbox/project_cards_unrelated.json` — 削除。
- `~/.claude/skills/taskbox/SKILL.md` 手順7 — 大幅に軽量化:
  - (0)「未決はboardでなくdecisionsへ」の節を削除(decisions自体が無くなるため)。
  - (a) **前回SHAの正を`drain-state.json`に一本化**(現在「`taskbox/projects.md`の記載を正とする」と書かれているが、drain.ps1のコードと`projects.md`自身の本文は逆に`drain-state.json`を正としており、この矛盾が2026-08-09〜10に基準SHA凍結を3回引き起こしている。今回のシンプル化と合わせて解消する)。
  - (a-2) 「一次ノート本文へ当たる」の精神は残す(decisions文脈の記述だけ簡略化)。
  - (d)突合・(e)判断件数の検算を削除。
  - `0c`の節(判断回収)を丸ごと削除。
- `taskbox/README.md` — 「プロジェクト板の回答の回収」節(旧2テーブル構成のまま古いと以前から指摘されていた箇所)を、新方式(decisions無し)に合わせて書き直す。
- `taskbox/projects.md` — 冒頭の役割説明・申し送りのフォーマットから「突合」「判断件数」への言及を削除し、身軽にする。

## 8. 決定ログ(2026-08-11・ユーザー最終承認)

本計画は以下の回答をもって**確定**した。この計画書に「要確認」は残っていない。実装に着手してよい。

1. **§0(15件の生きたdecisions)**: 「engineにすでに入っているものはそのまま消していい。判断で重要でないものは消していい。どちらでもないものはengineに記録せよ」という基準で解決すること。
2. **`ai_next`**: 削除する。「AIの次の一手であっても、承認し発火させるのは結局人間。ボトルネックは常に本人」という理由。
3. **`definition_of_done`**: 暫定的に残す。
4. **`reconcile-project-cards.mjs`**: 削除する(明示指示)。
5. **`project_notes`**: テーブルごとdropしてよい(明示指示)。
6. **§4〜§7の内容**: そのままの計画でよい(承認済み)。
7. **`status`の統合**: `waiting_user`/`waiting_other`を`waiting`へ統合する。「ボトルネックはいつも本人」が理由。
8. **実行順序**: §0の退避 → §5・6(コード)→§7(taskbox/SKILL.md)→§4(DBマイグレーション、列削除は最後・不可逆)。この順で進める。

## 9. 変更しないもの(整合性のために明示)

- `project_cards`テーブル自体・`goals`テーブル・5目標のグルーピング・`upsert-project-cards.mjs`のslug単位upsert方式・「置換は使わない」原則は維持。
- `reports`・`schedules`関連は本計画のスコープ外。
- `taskbox/drain.ps1`の2b(failed自動再開)・トリアージの他の判定(queue件数・engine差分・handover超過・inbox滞留)は無変更。
