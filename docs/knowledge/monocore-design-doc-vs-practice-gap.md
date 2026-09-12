---
name: monocore-design-doc-vs-practice-gap
description: 事実+判断(2026-08-09) — monocoreのREADME-design.mdは通常状態カードの境界線をneutral-200/800と規定するが、既存コンポーネント(ProjectCard・Sidebar・空状態ボックス)は軒並みneutral-400/600を使っており文書と実装が食い違っている。/reportsでは既存実装への一貫性を優先し文書には従わなかった。要ユーザー判断
created: 2026-08-09
updated: 2026-08-09
---

# README-design.mdの境界線規定と既存実装の食い違い（2026-08-09発見）

monocoreの `README-design.md`（「絶対的な設計・実装ルール」と明記）3章は、カード等の通常状態ボーダーを `border-neutral-200` / dark `border-neutral-800`（Default）、フォーカス/アクティブ状態を `border-neutral-400` / dark `border-neutral-600`（Focus/Active）と2段階で規定している。

しかし**既存の(このタスクで書いていない)コンポーネントは、フォーカス/アクティブ状態でない通常のカード・ボックスに一貫して`neutral-400/600`を使っている**:

- `src/components/projects/ProjectSection.tsx` の `CollapsedProjectCard`
- `src/app/projects/page.tsx` の空状態メッセージボックス
- `src/components/layout/Sidebar.tsx` のモバイルハンバーガーボタン

`/reports`実装のQA(cursor-agent `gpt-5.6-sol-high`)で2回連続、文書の字面通り`200/800`へ直すよう指摘されたが、**既存コンポーネントとの視覚的一貫性を優先し、`400/600`のまま据え置いた**（このページだけ境界線が薄くなると、かえってアプリ全体で見て不統一になるため）。

## 判断の位置づけ

これは「AIが良かれと思って独自解釈した」のではなく、**文書と実装のどちらを正とするかという、本来ユーザーが決めるべき食い違い**である。今回は単一機能追加のタスク内で全既存コンポーネントを書き換える権限も範囲も無かったため、既存実装への追随を選んだ。

## 次に確認すべきこと(ユーザー判断待ち)

- `README-design.md`の記述を実態(`400/600`)に合わせて更新するか、既存コンポーネント側を文書(`200/800`)に合わせて直すか。
- 後者を選ぶ場合は`/reports`だけでなく`ProjectCard`・`Sidebar`等を含む横断的なクリーンアップタスクになる。

関連: `C:\Users\tm976\mf\monocore\README-design.md` 3章 / `AGENTS.md` の同等記述。
