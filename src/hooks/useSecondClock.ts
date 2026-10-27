'use client';

import { useSyncExternalStore } from 'react';

// タイマーの表示(ヘッダー・タブ名・モーダル)が共有する1秒ごとの時計。購読者が別々に setInterval を持つと
// 秒の切り替わりがずれるので1つにまとめる。
// 拍は Worker の setInterval で打つ。Chrome は隠れて5分たったタブの main thread のタイマーを1分に1回まで
// 間引く(intensive throttling)ので、main thread の setInterval だと別タブで作業中にタブ名の残り時間が止まる。
// Worker を作れない環境では main thread の setInterval で代える。
const WORKER_SOURCE = 'setInterval(() => postMessage(0), 1000);';

const listeners = new Set<() => void>();
let current: number | null = null;
let stop: (() => void) | null = null;

function tick() {
    current = Date.now();
    listeners.forEach((l) => l());
}

function start(): () => void {
    let url: string | null = null;
    let worker: Worker | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const release = () => {
        worker?.terminate();
        worker = null;
        if (url) URL.revokeObjectURL(url);
        url = null;
    };
    const switchToInterval = () => {
        release();
        if (intervalId === null) intervalId = setInterval(tick, 1000);
    };
    try {
        url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
        worker = new Worker(url);
        worker.onmessage = tick;
        // 生成のあとで読み込みや起動に失敗したときは error イベントで来る(例外にならない)。
        worker.onerror = switchToInterval;
    } catch {
        switchToInterval();
    }
    return () => {
        release();
        if (intervalId !== null) clearInterval(intervalId);
    };
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    if (!stop) {
        tick();
        stop = start();
    }
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && stop) {
            stop();
            stop = null;
        }
    };
}

/** 今の時刻(epoch ミリ秒)。1秒ごとに更新する。サーバ描画と hydration が食い違わないよう、サーバでは null。 */
export function useSecondClock(): number | null {
    return useSyncExternalStore(
        subscribe,
        () => current,
        () => null,
    );
}
