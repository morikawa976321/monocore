-- カードの2欄から主体（AI／本人）の区別を落とし、過去と未来だけで切る。
-- 判断ログ: context-engine の card-fields-time-axis-not-actor（2026-08-12・本人指示）。
-- 本人の言葉は「行為主体が誰であったか、だれであるかというのは本質的な情報ではない」。
-- 画面見出しは「AIがやったこと」→「経過」、「あなたの番」→「次の一手」。
--
-- 画面ラベルだけでなく列名まで替えるのは、カードを書く drain セッションが毎回読むのが
-- 画面ではなく SKILL.md / taskbox の README の語彙だからである。ai_recent（AIの実績欄）/
-- your_turn（本人の宿題欄）が残る限り、生成側の枠は主体で切られたままで中身が変わらない。
--
-- 実態の追認でもある: smartphone-camera-xiaomi の ai_recent は「楽天市場店で購入済み」＝
-- 本人の行為を書いていた。本人が実行した事柄の置き場が無く、既に「経過」欄として使われていた。
--
-- RENAME COLUMN は行を書き換えないので、値の移行もロックの長期保持も無い
-- （型・NOT NULL・DEFAULT・index・policy はいずれも列名の変更に追随する）。
-- 戻すときは逆向きの RENAME を1本流すだけでよい。
ALTER TABLE public.project_cards RENAME COLUMN ai_recent TO progress;
ALTER TABLE public.project_cards RENAME COLUMN your_turn TO next_actions;
