---
name: monocore-button-variant-decision
description: monocoreの生<button>統一(20260809-1430)で、4形のうちどれをButtonのバリアントにし、どれを見送ったか・理由
created: 2026-08-09
updated: 2026-08-11
---

タスク `20260809-1430-monocore-button-unification` の実装判断。生の `<button>` 9箇所・6ファイルを `components/ui/Button` 経由に統一する際、`README-design.md` の棚卸しが挙げた4形すべてを実際に **`color`/`size` のバリアントとしてButtonへ折り込んだ**（「無理に寄せない」選択肢は取らなかった）。

## 判断: 4形すべてをButtonのバリアントにした

タスク仕様は「ナビ行・テキストリンクまで寄せるかは、寄せた結果が手書きより単純になるかで判断してよい」と裁量を残していたが、完了条件1「`src`配下に生`<button>`+クラスが無い」が例外なしの絶対条件だったため、**「寄せない」の意味は『Buttonを使わない』ではなく『既存の色トークンを無理に共有しない、専用のcolor/size値を新設してよい』と解釈した**。結果、Button.tsxに以下を追加:

- `color`: 既存 `primary/secondary/danger` に加え `ghost`（枠なし・hover背景のみ）/ `surface`（Card/Panel/FABと同じ「囲みの外枠」border-neutral-400/600トークン。primary/secondary/dangerのボタン専用パレットとは別系統）/ `link`（下線テキストリンク）を追加。
- `size`: 既存 `sm/md` に加え `icon`（32px正方形）/ `fab`（48px正方形）/ `bar`（全幅左寄せの開閉バー）/ `nav`（全幅左寄せのナビ行、間隔・レスポンシブ拡張は呼び出し側classNameに残す）/ `link`（テキストリンク用、下の対応表の`link`×`link`行）を追加。
  **（2026-08-10訂正）** 本行は当初 `link` の追加を書き漏らしており「size 4種追加」と読めたが、実コードの `ButtonSize` は8/9時点から一貫して `'sm' | 'md' | 'icon' | 'fab' | 'bar' | 'nav' | 'link'` の**7値**（2026-08-10にButton.tsxで確認）。「color 6値×size 6値」という要約が本ノート由来で流通したが誤り。バリアント数を参照するときは要約を鵜呑みにせず `Button.tsx` で数え直すこと。
- `ref` をforward可能にした（React 19のref-as-prop）。目次ドロワーのフォーカス復帰(`tocTriggerRef`)に必須。

## 各形の対応関係

| 形 | 該当箇所 | 採用したcolor×size |
|---|---|---|
| 通常ボタン(primary相当) | LoginClient送信 | `primary` × `md` |
| 全幅左寄せ開閉バー | projects/page.tsx 休止中/完了 | `surface` × `bar` |
| アイコン正方形(FAB) | Sidebarハンバーガー / reports目次トリガー | `surface` × `fab` |
| ゴーストアイコン | reports目次を閉じる / DaySection元に戻す | `ghost` × `icon` |
| ナビ行 | SidebarActionButton(Logout) / ThemeToggle | `ghost` × `nav` |
| テキストリンク | LoginClient「別のメールアドレスで試す」 | `link` × `link` |

**`surface`という新色を切った理由**: FABは`border-neutral-400/600`だが、既存`secondary`は`border-neutral-600/500`で色が違う（`secondary`は他画面のボタン専用パレット、FABは`README-design.md`の「囲みの外枠」規定に属する別系統）。`secondary`を流用すると枠色が変わってしまうため、`surface`として独立させた。

## 見た目が変わった箇所（すべて意図的・規約準拠が理由。結果ブロックにも記載済み）

1. **LoginClient送信ボタン**: 枠なし→`primary`の2px amber-700/600枠が付いた。disabled時の不透明度が40%→50%に変わった。理由: `README-design.md`が「ボタンの見た目の正はButton.tsx」と規定したため、Button.tsx未経由だった旧実装の方が非準拠だった。
2. **projects/page.tsxの開閉バー**: 文字色が`text-neutral-700/300`(Tertiary)→`text-neutral-900/50`(Primary)に濃くなった。理由: README 2.1節が「Tertiary(700/300)は主要操作ラベルに使うな」と明記しており、旧実装がその規約に違反していた。`surface`色への統一で自動的に是正された。
3. **DaySectionの元に戻すボタン**: hover背景が`neutral-300/700`→`neutral-200/800`に変わった。理由: README 3節の「Sub Surface (Hovered/Selected)」トークンと完全一致させたため（旧実装はそこから外れた独自色だった）。
4. **ThemeToggle**: 文字色が`text-neutral-600/400`→`text-neutral-700/300`に変わった。理由: `neutral-600`/`dark:neutral-400`はREADMEのテキスト階層表に存在しない値（900/50, 800/200, 700/300, 500のみが定義済み）で、旧実装がそもそも規約外の色を使っていた。
5. **DaySection・ThemeToggleとも**: dark時のfocus-visible ringが`neutral-400`固定→`dark:neutral-600`が追加された。理由: 両方とも元々`dark:`バリアントの指定漏れ（README 10節のチェック項目5違反）だった。

いずれも「良かれと思ったデザイン変更」ではなく、`README-design.md`の既存規定と実装の食い違いをButton統一の副産物として是正したものであり、新規のデザイン判断は行っていない。

## 見送ったもの

なし。4形すべてButtonへ折り込んだ。ただし`nav`サイズは意図的にgap/レスポンシブ文字サイズをButton側に持たせず呼び出し側classNameに残した（SidebarActionButtonとThemeToggleでgap・文字サイズが実際に違っており、無理に共通化すると片方の見た目が変わるため）。
