-- -------------------------------------------------------
-- news-thumbs — /news のサムネイル(480×320 の WebP)を置く公開バケット
--
-- 理由: og:image を原寸のまま読むと、初回表示だけで約 11MB になっていた
-- (実測。中央値 229KB・最大 2.9MB)。scraper が記事の取得時に縮小して置き、
-- articles.image_url にはここの公開 URL を入れる。詳細は scraper/thumbnails.py。
--
-- 公開バケットにする理由: 中身は公開ニュースの og:image を縮めたもので秘匿情報が無く、
-- <img> から認証なしで読める方が実装も表示も軽い。オブジェクト名は記事 link の
-- ハッシュなので、一覧の列挙(storage.objects の SELECT ポリシー)は与えない。
-- 書き込み・削除は service_role(scraper)だけで、RLS を通らないのでポリシーは足さない。
--
-- 上限 512KB は実測(中央値 12KB 程度)に対する余裕で、壊れた入力を弾く安全弁。
-- 画像が消えても、画面は読み込み失敗で「画像なし」に落ちるだけで記事は読める。
-- -------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('news-thumbs', 'news-thumbs', true, 524288, ARRAY['image/webp'])
ON CONFLICT (id) DO NOTHING;
