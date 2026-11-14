import { describe, expect, it } from 'vitest';
import type { Database } from '@/src/types/database.types';
import {
    dateLabelToDateStr,
    dayContentToScheduleItems,
    findDayContentIssues,
    scheduleRowsToDayContent,
} from './text-format';

type ScheduleRow = Database['public']['Tables']['schedules']['Row'];

describe('text-format', () => {
    it('parses date label to yyyy-MM-dd', () => {
        expect(dateLabelToDateStr('2026/03/01 (日)')).toBe('2026-03-01');
    });

    it('returns empty string for malformed date label', () => {
        expect(dateLabelToDateStr('2026-03-01')).toBe('');
    });

    it('converts HHMM and HHMM-HHMM blocks to schedule items', () => {
        const content = ['0900 standup', 'notes', '1000-1130 focus', '1200 lunch'].join('\n');
        const items = dayContentToScheduleItems('2026-03-20', content, 'Asia/Tokyo');

        expect(items).toHaveLength(3);
        expect(items[0].activity).toBe('standup\nnotes');
        expect(items[1].activity).toBe('focus');
        expect(items[2].activity).toBe('lunch');
        expect(items[1].end_at).not.toBeNull();
    });

    it('detects orphan lines but ignores continuation lines', () => {
        const continuationOnly = ['0900-1000 start', 'detail line', 'another detail'].join('\n');
        const orphanIncluded = ['memo before', '0900-1000 start'].join('\n');

        expect(findDayContentIssues(continuationOnly)).toEqual([]);
        expect(findDayContentIssues(orphanIncluded)).toEqual([{ line: 'memo before', kind: 'orphan' }]);
    });

    it('requires an end time except for the wake line, and rejects reversed ranges', () => {
        const content = ['0700 起床 朝食', '1050 院生ゼミ', '1300-1500 作業', '1500-1300 逆', '1000-1000 同時刻', '2200-2300 消灯'].join('\n');

        expect(findDayContentIssues(content)).toEqual([
            { line: '1050 院生ゼミ', kind: 'missing-end' },
            { line: '1500-1300 逆', kind: 'reversed' },
        ]);
        expect(findDayContentIssues('')).toEqual([]);
    });

    it('flags a line that overlaps an earlier one, but lets ranges that only touch', () => {
        const content = [
            '0700 起床',
            '0900-1000 研究',
            '1000-1100 接する(重ならない)',
            '1030-1200 重なる',
            '1100-1130 重なる2(1030-1200 の中)',
            '1300-1300 長さ0',
            '1230-1400 長さ0を挟んでも重ならない',
        ].join('\n');

        expect(findDayContentIssues(content)).toEqual([
            { line: '1030-1200 重なる', kind: 'overlap' },
            { line: '1100-1130 重なる2(1030-1200 の中)', kind: 'overlap' },
        ]);
    });

    it('does not compare lines that are already invalid (reversed, missing end) for overlap', () => {
        const content = ['0900-1200 作業', '1000 終了なし', '1100-0900 逆'].join('\n');

        expect(findDayContentIssues(content)).toEqual([
            { line: '1000 終了なし', kind: 'missing-end' },
            { line: '1100-0900 逆', kind: 'reversed' },
        ]);
    });

    it('lets only lines with 起床 as a word omit the end time (same rule as the free-time calculation)', () => {
        const content = ['0700 起床', '0710 朝の 起床', '0720 起床時刻の見直し', '0730 起床。'].join('\n');

        expect(findDayContentIssues(content)).toEqual([
            { line: '0720 起床時刻の見直し', kind: 'missing-end' },
            { line: '0730 起床。', kind: 'missing-end' },
        ]);
    });

    it('formats rows to day content and supports round-trip-like parsing', () => {
        const rows = [
            {
                start_at: '2026-03-20T00:00:00.000Z',
                end_at: '2026-03-20T01:00:00.000Z',
                activity: 'work',
            },
            {
                start_at: '2026-03-20T02:00:00.000Z',
                end_at: null,
                activity: 'single line',
            },
            {
                start_at: '2026-03-21T00:00:00.000Z',
                end_at: null,
                activity: 'other day',
            },
        ] as unknown as ScheduleRow[];

        const dayContent = scheduleRowsToDayContent(rows, '2026-03-20', 'Asia/Tokyo');
        const reparsed = dayContentToScheduleItems('2026-03-20', dayContent, 'Asia/Tokyo');

        expect(dayContent).not.toContain('other day');
        expect(reparsed).toHaveLength(2);
        expect(reparsed[0].activity).toBe('work');
        expect(reparsed[1].activity).toBe('single line');
    });

});
