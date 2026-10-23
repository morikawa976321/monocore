/**
 * 開いたレポートの本文をブラウザ(localStorage)に置いておく(2026-10-23。本文は中央値で約 40KB、最大で約 600KB あり、
 * 開くたびに全部読み直していた)。詳細ページは手元の本文をすぐ出し、updated_at だけを問い合わせて、変わっていたときだけ
 * 本文を読み直す。通信が切れていても一度開いたレポートは読める。
 * 保存に失敗したら(容量の上限)ほかのレポートの分を消してもう一度だけ試し、それでも駄目なら置かない(読むのは毎回の
 * 取得に戻るだけで、表示は壊れない)。ログアウトで全部消す(clearReportCache)。
 */
import type { Json } from '@/src/types/database.types';

const PREFIX = 'monocore:report-cache:';

export type CachedReport = {
    slug: string;
    title: string;
    bodyHtml: string;
    /** reports.toc をそのまま(表示用への変換は読む側で行う)。 */
    toc: Json;
    updatedAt: string;
};

function isCachedReport(value: unknown): value is CachedReport {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return typeof v.slug === 'string' && typeof v.title === 'string' && typeof v.bodyHtml === 'string' && typeof v.updatedAt === 'string';
}

export function readCachedReport(slug: string): CachedReport | null {
    try {
        const raw = window.localStorage.getItem(PREFIX + slug);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        return isCachedReport(parsed) && parsed.slug === slug ? parsed : null;
    } catch {
        return null;
    }
}

function cachedKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key?.startsWith(PREFIX)) keys.push(key);
    }
    return keys;
}

export function writeCachedReport(report: CachedReport): void {
    const key = PREFIX + report.slug;
    const value = JSON.stringify(report);
    try {
        window.localStorage.setItem(key, value);
        return;
    } catch {
        // 容量の上限。ほかのレポートの分を消して1回だけ試し直す。
    }
    try {
        for (const other of cachedKeys()) if (other !== key) window.localStorage.removeItem(other);
        window.localStorage.setItem(key, value);
    } catch {
        // 置けなければ置かない。
    }
}

export function removeCachedReport(slug: string): void {
    try {
        window.localStorage.removeItem(PREFIX + slug);
    } catch {
        // 消せなくても表示には影響しない。
    }
}

export function clearReportCache(): void {
    try {
        for (const key of cachedKeys()) window.localStorage.removeItem(key);
    } catch {
        // 同上。
    }
}
