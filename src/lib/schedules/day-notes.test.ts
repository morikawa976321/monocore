import { describe, expect, it } from 'vitest';
import { mergeNoteRows } from './day-notes';

describe('mergeNoteRows', () => {
    it('dirty な日はサーバー値で上書きしない', () => {
        const current = new Map([['2026-08-05', '編集中']]);

        const result = mergeNoteRows(
            current,
            [{ day_key: '2026-08-05', body: 'サーバー値' }],
            new Set(['2026-08-05'])
        );

        expect(result.get('2026-08-05')).toBe('編集中');
    });

    it('dirty でない日はサーバー値で更新する', () => {
        const current = new Map([['2026-08-05', '古い値']]);

        const result = mergeNoteRows(
            current,
            [{ day_key: '2026-08-05', body: '新しい値' }],
            new Set()
        );

        expect(result.get('2026-08-05')).toBe('新しい値');
    });

    it('空文字のサーバー値も反映する', () => {
        const current = new Map([['2026-08-05', '消去前']]);

        const result = mergeNoteRows(
            current,
            [{ day_key: '2026-08-05', body: '' }],
            new Set()
        );

        expect(result.get('2026-08-05')).toBe('');
    });

    it('current を変更せず新しい Map を返す', () => {
        const current = new Map([['2026-08-05', '元の値']]);

        const result = mergeNoteRows(
            current,
            [{ day_key: '2026-08-06', body: '追加値' }],
            new Set()
        );

        expect(result).not.toBe(current);
        expect(current).toEqual(new Map([['2026-08-05', '元の値']]));
        expect(result).toEqual(new Map([
            ['2026-08-05', '元の値'],
            ['2026-08-06', '追加値'],
        ]));
    });
});
