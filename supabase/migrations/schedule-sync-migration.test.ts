import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
    new URL('./20260802171500_add_schedule_day_revisions.sql', import.meta.url),
    'utf8'
);

describe('schedule revision migration', () => {
    it('removes the unversioned authenticated RPC signature', () => {
        expect(migration).toContain(
            'DROP FUNCTION public.replace_schedules_for_day(timestamptz, timestamptz, jsonb);'
        );
    });

    it('serializes a day before checking its revision and replacing rows', () => {
        const lockPosition = migration.indexOf('pg_advisory_xact_lock');
        const revisionCheckPosition = migration.indexOf(
            'p_expected_revision IS DISTINCT FROM v_current_revision'
        );
        const deletePosition = migration.indexOf('DELETE FROM schedules');

        expect(lockPosition).toBeGreaterThan(-1);
        expect(revisionCheckPosition).toBeGreaterThan(lockPosition);
        expect(deletePosition).toBeGreaterThan(revisionCheckPosition);
    });

    it('returns a serialization error without changing rows on stale revisions', () => {
        expect(migration).toContain("ERRCODE = '40001'");
        expect(migration).toContain('SET revision = revision + 1');
        expect(migration).toContain('RETURN v_next_revision');
    });

    it('prevents schedule items outside the requested day from being inserted', () => {
        expect(migration).toContain(
            'IF v_start_at < p_day_start_utc OR v_start_at >= p_day_end_utc THEN'
        );
    });
});
