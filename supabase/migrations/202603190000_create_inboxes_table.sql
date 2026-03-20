-- -------------------------------------------------------
-- インボックステーブル（ユーザーごとに1レコード）
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS inboxes (
    user_id UUID PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id),
    content TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE inboxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own inbox" ON inboxes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own inbox" ON inboxes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own inbox" ON inboxes FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_inboxes_updated_at
    BEFORE UPDATE ON inboxes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
