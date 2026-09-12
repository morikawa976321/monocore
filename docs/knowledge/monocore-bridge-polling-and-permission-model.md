---
name: monocore-bridge-polling-and-permission-model
description: 決定(2026-07-20) — monocoreのブリッジはRealtime常駐をやめdrain同様のポーリングにする。破壊的操作はLLM判定+2ターン確認とし、LLM判断は厳格化方向にのみ効かせる
created: 2026-07-20
updated: 2026-07-20
---

# 決定: monocoreブリッジの結線方式と権限モデル(2026-07-20)

Phase 3着手前の設計判断。ユーザー決定2件とClaudeの補強2件。Phase 3自体はその後凍結された([[priority-pivot-autonomy-over-accessibility]])が、権限モデルは自律実行一般に転用可能。

## ユーザー決定

1. **Realtimeは不要。taskboxのdrainと同様のポーリングでよい。** 2026-07-14の「メッセージバスはSupabase Realtime(確定)」を撤回する。常駐WebSocketとその再接続処理が不要になり、drainで既に得ている運用知見([[drain-console-close-kills-run]]等)を流用できる。
2. **破壊的操作か低リスク操作かをLLM側で判断し、前者は2ターン確認、後者はそのまま実行。** 操作のリスクは操作種別だけでは決まらない(同じ削除でもスクラッチとengineでは別物)ため、文脈を見る層は必要という判断。

## Claudeの補強(ユーザー提示済み・要確認)

3. **LLM判断はラチェット(一方向)にする。** 自動実行可の範囲は決定論的なルール(LLMの外)で定義し、LLMは許可リスト内の操作を**2ターンへ引き上げることはできるが、確認対象を直接実行へ引き下げることはできない**。理由: 判定するのは実行したがっている本人と同じコンテキストであり、直前に読んだノート・handover・外部テキストに汚染されうる。自己申告のゲートは必要な時にこそ壊れる。
4. **2ターン目は再計画ではなく事前固定した操作の実行にする。** 確認レコードに実際のSQL/コマンド/パラメータを保存し、承認時はそれを実行するだけにする。「古いファイルを消す?」→「はい」→別セッションが"古い"を解釈し直す、という作りは[[replace-rpc-empty-items-data-loss]]と同型の事故になる。ポーリング型でセッションが毎回別プロセスになる以上、実装上も必須。

関連: [[taskbox-design-decisions]]。設計の正は monocore リポジトリの `docs/design.md`（2026-08-06に `docs/monocore-v2-design-draft.md` から改名・再編。[[monocore-phase-plan-abandoned]]）。
