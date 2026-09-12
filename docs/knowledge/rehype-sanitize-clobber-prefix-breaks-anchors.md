---
name: rehype-sanitize-clobber-prefix-breaks-anchors
description: 運用知見(2026-08-09実測) — rehype-slug+rehype-sanitizeを組み合わせると、既定スキーマのclobberPrefix("user-content-")が見出しidを書き換え目次アンカーと不一致になる。自分のコンテンツのみ扱うならschema.clobberPrefix=''で無効化する
created: 2026-08-09
updated: 2026-08-09
---

# rehype-sanitizeのclobberPrefixが見出しidとtocのanchorをズレさせる（2026-08-09実測）

monocoreの `/reports` 実装（markdown→HTML変換）で、`rehype-slug`（見出しに`id`を振る）→`rehype-sanitize`（既定スキーマでサニタイズ）という定番の組み合わせを使ったところ、目次(toc)のanchorとbody_html中の実際の`id`がズレて目次リンクが機能しない状態になった。

## 原因

`rehype-sanitize`の`defaultSchema`は`id`属性そのものは`tagNames`の`*`許可リストに含めており**削除はしない**。しかし`clobberPrefix`(既定値`"user-content-"`)により、**DOMクロバリング対策として全てのid/name属性の値へ接頭辞を自動で足す**(例: `id="見出し"` → `id="user-content-見出し"`)。rehype-slugが振った素のidをtoc抽出に使うと、sanitize後のbody_html中のidと食い違う。

見た目上「idが消える」わけではなく「idの値が書き換わる」ので、`defaultSchema.tagNames`や`attributes['*']`をNode REPLで確認しただけでは気づけない(実際に両方の値を突き合わせて初めて分かる)。

## 対処

自分のmarkdownしか扱わない(外部ユーザー入力を受け付けない)前提なら、DOMクロバリング対策自体が不要なので無効化してよい:

```js
import { defaultSchema } from 'rehype-sanitize'
const schema = structuredClone(defaultSchema)
schema.clobberPrefix = ''
```

これでrehype-slugが振った素のidがそのままbody_htmlに残り、toc抽出のタイミング(sanitize前でもtoc-only用途なら後でも)によらず一致する。外部ユーザー入力を扱う場合はこの対処は不適切(クロバリング対策を無効化することになるため)。

## 一般則

**rehype-sanitizeを使うときは`defaultSchema`の中身を`tagNames`/`attributes`だけでなく`clobberPrefix`/`clobber`/`ancestors`も含めて確認する。** 「属性が許可リストに載っているか」だけでは、値が書き換えられるケースを見落とす。
