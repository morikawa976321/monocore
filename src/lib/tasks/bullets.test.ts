import { describe, expect, it } from 'vitest';
import { fromBulletedText, toBulletedText } from './bullets';

describe('toBulletedText / fromBulletedText', () => {
    it('adds a bullet to each line and removes it on save', () => {
        expect(toBulletedText('数社に応募\nポートフォリオ完成まで')).toBe('・数社に応募\n・ポートフォリオ完成まで');
        expect(fromBulletedText('・数社に応募\n・ポートフォリオ完成まで')).toBe('数社に応募\nポートフォリオ完成まで');
    });

    it('keeps an empty card empty so the placeholder shows', () => {
        expect(toBulletedText('')).toBe('');
        expect(fromBulletedText('・')).toBe('');
    });

    it('drops lines with nothing but a bullet and keeps lines whose bullet was deleted', () => {
        expect(fromBulletedText('・a\n・\n・  \nb')).toBe('a\nb');
    });
});
