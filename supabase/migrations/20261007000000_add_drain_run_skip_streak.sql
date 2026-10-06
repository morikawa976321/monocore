-- -------------------------------------------------------
-- drain_runs: 連続する「静かな起動なし」を1行にまとめるための列(2026-10-07)
--
-- 1時間おきの drain は大半が起動なし(2026-09-29〜10-06 の163回中148回)で、保持48件の枠を
-- 食い、実際に働いた回の行が約2日で押し出されていた。起動なし(outcome='skipped')で
-- 注意・異常の工程が1つも無い回は、直前の行も同じなら投入時にその行を消して1行にまとめる
-- (scripts/upsert-drain-run.mjs の foldQuietSkip)。注意・異常のある回(バックアップ失敗など)はまとめない。
--   skip_count — この行が代表する連続回数(まとめていない行は 1)
--   skip_since — まとめた連続の最初の回の started_at(まとめていない行は NULL)
-- -------------------------------------------------------
ALTER TABLE public.drain_runs
    ADD COLUMN skip_count INTEGER NOT NULL DEFAULT 1 CHECK (skip_count >= 1),
    ADD COLUMN skip_since TIMESTAMPTZ;
