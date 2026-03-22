-- -------------------------------------------------------
-- プロジェクト（Markdown 本文は body。一覧は title / 論理削除は deleted_at）
-- 型生成向け: title DEFAULT ''（Insert 省略可・トリガーで上書き）、body は DEFAULT なし（Insert で必須）
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    deleted_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own projects" ON projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own projects" ON projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own projects" ON projects FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_projects_user_id_updated_at_active
    ON projects (user_id, updated_at DESC)
    WHERE deleted_at IS NULL;

-- title は body から導出: 先頭改行までを1行とし、行頭の # と続く空白を除去する。
CREATE OR REPLACE FUNCTION set_title_from_body()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.title := regexp_replace(
        split_part(replace(COALESCE(NEW.body, ''), E'\r\n', E'\n'), E'\n', 1),
        '^#\s*',
        ''
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER set_projects_title_from_body
    BEFORE INSERT OR UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION set_title_from_body();

CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
