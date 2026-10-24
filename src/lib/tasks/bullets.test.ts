import { describe, expect, it } from 'vitest';
import { fromBulletedText } from './bullets';

describe('fromBulletedText', () => {
    it('keeps one task per line', () => {
        expect(fromBulletedText('数社に応募\nポートフォリオ完成まで')).toBe('数社に応募\nポートフォリオ完成まで');
    });

    it('drops empty lines so pressing Enter at the end saves nothing extra', () => {
        expect(fromBulletedText('a\n\n  \nb\n')).toBe('a\nb');
        expect(fromBulletedText('')).toBe('');
    });

    it('removes bullets typed by hand at the start of a line, since the card draws its own', () => {
        expect(fromBulletedText('・a\n・・b\n・')).toBe('a\nb');
    });
});
