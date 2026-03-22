-- -------------------------------------------------------
-- ナレッジ（Markdown 本文は body。一覧は title / 論理削除は deleted_at）
-- 前提: [set_title_from_body] は projects マイグレーションで定義済み
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    deleted_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own knowledge" ON knowledge FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own knowledge" ON knowledge FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own knowledge" ON knowledge FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_knowledge_user_id_updated_at_active
    ON knowledge (user_id, updated_at DESC)
    WHERE deleted_at IS NULL;

CREATE TRIGGER set_knowledge_title_from_body
    BEFORE INSERT OR UPDATE ON knowledge
    FOR EACH ROW
    EXECUTE FUNCTION set_title_from_body();

CREATE TRIGGER update_knowledge_updated_at
    BEFORE UPDATE ON knowledge
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
