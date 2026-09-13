# docs/knowledge — monocore のAI向け運用知見

context-engine の 02_context から 2026-09-12 の棚卸し(第2回)で移してきたノート46件を、2026-09-13にトピック別の文書5本へ統合した(元のノートは削除済み)。バックアップ・DB復旧の知見は `docs/supabase-backup.md` へ追記統合済み。grep で探すこと。

- [supabase-postgrest-pitfalls.md](supabase-postgrest-pitfalls.md) — いつ読むか: Supabase CLI（gen types / migration / db push）やPostgRESTへの直接リクエストを書く・デバッグするとき。中身: gen typesの2つの落とし穴、PostgRESTの一括INSERT/クエリエンコーディングの罠、ローカルSupabaseのsuperuser・migration drift対処、service role keyとauth.uid()の非両立、リモートdb pushがAIセッションから通らない制約、3ヶ月隠れていたmigration未適用の実例
- [incidents.md](incidents.md) — いつ読むか: 本番障害の再発時の切り分け、または過去のデータ消失・暴走の経緯を確認するとき。中身: (1)2026-07-17疎通確認のつもりの空配列でのデータ削除事故、(2)2026-08-25〜09-02のschedules保存40001リトライストーム(原因・調査の誤読・収束・暴走クライアントの止め方)、(3)2026-08-29〜30のinbox空文字上書きと対策
- [bridge-and-drain-board.md](bridge-and-drain-board.md) — いつ読むか: taskbox drainの報告板(monocore `/drain`)やAIブリッジ、inbox/projectボードを実装・変更するとき。中身: drain報告板の表示方針の変遷(機械値のみ→4点→1文要約→タスク別詳細非表示)、保持件数とスキップカード統合、プロジェクト板廃止、AIブリッジのポーリング・権限モデル、AI編集権スキル(M1)の設計、inboxへの書き込み手順
- [pages-and-features-decisions.md](pages-and-features-decisions.md) — いつ読むか: monocoreの既存ページ・コンポーネントの経緯(なぜ今の形か、なぜ削除/追加したか)を確認するとき。中身: インフラ方針(束A+非同期)、フェーズ計画の廃止、tasks/knowledge一覧ページの廃止、要注意タスクパネルの削除、schedulesメモ欄の追加(Reactの自動保存の罠を含む)、Buttonバリアントの統一と見直し、デザイン文書と実装の食い違い(未解決)、inboxへの参照リスト流入(置き場未決)
- [mirror-and-reports-integration.md](mirror-and-reports-integration.md) — いつ読むか: `mf/reports/` のmonocoreミラーやnews_scrapingの統合を実装・変更するとき。中身: reportsミラーの設計方針(全件同期・集合の一致・単一形式・相対リンク書き換え・markdown変換の罠・索引警告が届かない問題)、news_scrapingのSupabase統合(保持方針・言語を書き直さない判断・移設元リポジトリ完全削除)

バックアップ・DB復旧の関連知見は本フォルダではなく [../supabase-backup.md](../supabase-backup.md) を参照(定期バックアップのdrain統合、pageinspectによる誤削除復旧の手順を追記済み)。
