-- -------------------------------------------------------
-- reports に本文の指紋 body_md5 を足す(2026-10-23)
--
-- Report の詳細ページは開いた本文をブラウザ(localStorage)に置き、次に開くときは小さな列だけを問い合わせて、
-- 変わっていたときだけ本文を読む(通信を減らすため。src/lib/reports/cache.ts)。比べる列に updated_at は使えない:
-- scripts/upsert-reports.mjs は updated_at に md 自身の更新時刻を入れるので、リンク先の md が後から増えて
-- 本文の HTML だけが変わったとき(リンクの書き換え)に updated_at は変わらない(sol のレビューの指摘)。
-- 本文から DB が計算する列にすれば、同期スクリプトを変えずに本文の変化と必ず一致する。暗号の強さは要らない。
-- -------------------------------------------------------
ALTER TABLE public.reports
    ADD COLUMN IF NOT EXISTS body_md5 TEXT GENERATED ALWAYS AS (md5(body_html)) STORED;
