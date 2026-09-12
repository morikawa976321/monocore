---
name: drain-board-hides-task-details
description: 判断(2026-09-12) — monocoreの/drainページから、tracesに由来するタスク別詳細の表示をやめた
created: 2026-09-12
updated: 2026-09-12
---

monocoreの`/drain`ページで、タスク別の詳細(traces由来のsummary/failures/notes/委譲)を表示するのをやめた。当面はオーケストレーターの報告全文(report_text)だけで足りるとした。taskbox側は`drain_runs.tasks`へ常に空配列を送るようにし、monocore側もその表示コードを削除した。`traces/*.json`自体の記録・taskbox側のGet-TraceHarvest(集計用)は変えていない。

**本人の言葉で「いったん」「なんなら報告全文すらもなくすかも」**とあり、最終形として確定させたものではない。

関連: [[drain-board-report-four-points]](板の本文をsummary 1文にした2026-08-30の判断。今回はその表示ごと止めた) / [[traces-steps-key-abolished]]
