import { describe, expect, it } from 'vitest'
import {
    formatDuration,
    parseRunSteps,
    parseRunTasks,
    parseTriggerReasons,
} from './run'

describe('parseTriggerReasons', () => {
    it('keeps non-empty strings and drops anything else', () => {
        expect(parseTriggerReasons(['queueに2件', '', 42, null])).toEqual(['queueに2件'])
        expect(parseTriggerReasons(null)).toEqual([])
    })
})

describe('parseRunSteps', () => {
    it('reads the did/result pair and defaults an unknown status to ok', () => {
        expect(
            parseRunSteps([
                { did: 'タスク処理', result: '2件done / 0件failed', status: 'ok' },
                { did: 'バックアップ', result: '実行されなかった', status: 'error' },
                { did: '板の更新', result: '確認済み', status: 'success' },
            ])
        ).toEqual([
            { did: 'タスク処理', result: '2件done / 0件failed', status: 'ok' },
            { did: 'バックアップ', result: '実行されなかった', status: 'error' },
            { did: '板の更新', result: '確認済み', status: 'ok' },
        ])
    })

    it('drops steps with no label instead of rendering an empty row', () => {
        expect(parseRunSteps([{ result: 'x' }, 'nope', null])).toEqual([])
    })
})

describe('parseRunTasks', () => {
    it('reads a trace-derived task', () => {
        const tasks = parseRunTasks([
            {
                task_id: '20260812-0100-example',
                title: '例のタスク',
                outcome: 'done',
                gate_passed: true,
                target_dir: 'C:\\Users\\tm976\\mf\\duocad',
                steps: [
                    { desc: '実装', status: 'done', note: '377 passed' },
                    { desc: '', status: 'done', note: '見出しの無い工程は落とす' },
                ],
                failures: [{ phase: 'QA', symptom: '赤が1件', resolution: '直した' }],
                delegation: [
                    { target: 'cursor(auto)', calls: 2, outcome: 'ok' },
                    { target: '', calls: 1, outcome: 'ok' },
                ],
                qa_rounds: 3,
                notes: '想定外: 実機のフォントが無かった',
            },
        ])

        expect(tasks).toHaveLength(1)
        expect(tasks[0].taskId).toBe('20260812-0100-example')
        expect(tasks[0].gatePassed).toBe(true)
        expect(tasks[0].steps).toEqual([{ desc: '実装', status: 'done', note: '377 passed' }])
        expect(tasks[0].failures[0].phase).toBe('QA')
        expect(tasks[0].delegation).toEqual([{ target: 'cursor(auto)', calls: 2, outcome: 'ok' }])
        expect(tasks[0].qaRounds).toBe(3)
        expect(tasks[0].notes).toBe('想定外: 実機のフォントが無かった')
    })

    it('survives missing optional fields', () => {
        const tasks = parseRunTasks([{ task_id: 'x' }])
        expect(tasks[0]).toEqual({
            taskId: 'x',
            title: '',
            outcome: null,
            gatePassed: null,
            targetDir: null,
            steps: [],
            failures: [],
            delegation: [],
            qaRounds: null,
            notes: '',
        })
    })

    it('drops entries with no task_id', () => {
        expect(parseRunTasks([{ title: 'no id' }])).toEqual([])
    })
})

describe('formatDuration', () => {
    it('formats minutes and hours', () => {
        expect(formatDuration('2026-08-12T01:00:00+09:00', '2026-08-12T01:35:00+09:00')).toBe('35分')
        expect(formatDuration('2026-08-12T01:00:00+09:00', '2026-08-12T03:16:00+09:00')).toBe(
            '2時間16分'
        )
    })

    it('returns null when the run never wrote an end time', () => {
        expect(formatDuration('2026-08-12T01:00:00+09:00', null)).toBeNull()
    })
})
