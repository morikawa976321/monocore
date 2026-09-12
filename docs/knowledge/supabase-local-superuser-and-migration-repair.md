---
name: supabase-local-superuser-and-migration-repair
description: 運用知見 — ローカルSupabaseのpostgresロールはsuperuserではない(superuserはsupabase_admin)。migration履歴のdriftは repair --status applied で帳簿だけ合わせる
created: 2026-07-17
updated: 2026-07-17
---

# ローカルSupabaseの superuser と migration drift の直し方

## superuser は `postgres` ではなく `supabase_admin`

ローカルSupabase(`supabase start`)の `postgres` ロールは `rolsuper = false`(`rolbypassrls` は true)。そのため拡張の導入などで `permission denied to create extension` になる。superuserは **`supabase_admin`**:

```
docker exec -i -e PGPASSWORD=postgres <db_container> psql -U supabase_admin -d postgres
```

(パスワード無しだと `password authentication failed` になるので `PGPASSWORD=postgres` が要る)

## migration履歴のdrift

「スキーマ上は適用済みだが `supabase_migrations.schema_migrations` に記録が無い」状態だと、`supabase migration up` が既適用分を再実行しようとして失敗する。**帳簿だけを合わせる**:

```
npx supabase migration repair --status applied <version> --local
```

これはスキーマもデータも触らない記録操作なので安全。**再実行してはいけない理由がある場合ほど repair が正解**: 2026-07-17時点のmonocoreの `202606061200` は、非冪等な `CREATE TRIGGER` に加えて **sort_order のバックフィルUPDATE** を含むため、再実行するとユーザーの手動並び順が壊れる。

関連: [[postgres-dead-tuple-recovery]] / [[monocore-ai-edit-skill]]
