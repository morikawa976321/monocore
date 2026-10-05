import { describe, expect, it } from 'vitest'
import {
    MAX_REPORT_TEXT_LENGTH,
    MAX_TASK_SUMMARY_LENGTH,
    buildAsks,
    buildRow,
    truncateReportText,
    validateRun,
} from './drain-run-payload.mjs'

/** 最小の妥当なrun。個別テストで一部だけ壊して使う。 */
function validRun(overrides = {}) {
    return {
        started_at: '2026-08-12T01:00:01+09:00',
        ended_at: '2026-08-12T02:10:00+09:00',
        outcome: 'completed',
        trigger_reasons: ['queueに2件'],
        model: 'claude-opus-5',
        effort: 'xhigh',
        exit_code: 0,
        steps: [{ did: 'タスク処理', result: '2件done / 0件failed', status: 'ok' }],
        tasks: [],
        ...overrides,
    }
}

describe('validateRun', () => {
    it('passes a well-formed run', () => {
        expect(validateRun(validRun())).toEqual([])
    })

    it('accepts a skipped run with no session fields', () => {
        expect(
            validateRun({
                started_at: '2026-08-12T07:00:00+09:00',
                outcome: 'skipped',
            })
        ).toEqual([])
    })

    it('rejects a missing or unparseable started_at', () => {
        expect(validateRun(validRun({ started_at: undefined }))[0]).toContain('started_at')
        expect(validateRun(validRun({ started_at: 'not a date' }))[0]).toContain('started_at')
    })

    it('rejects an unknown outcome', () => {
        expect(validateRun(validRun({ outcome: 'done' }))[0]).toContain('outcome')
    })

    it('rejects a non-integer exit_code but allows null', () => {
        expect(validateRun(validRun({ exit_code: '0' }))[0]).toContain('exit_code')
        expect(validateRun(validRun({ exit_code: null }))).toEqual([])
    })

    it('rejects steps without did and with an unknown status', () => {
        expect(validateRun(validRun({ steps: [{ result: 'x' }] }))[0]).toContain('"did"')
        expect(
            validateRun(validRun({ steps: [{ did: 'x', status: 'success' }] }))[0]
        ).toContain('"status"')
    })

    it('rejects tasks without task_id', () => {
        expect(validateRun(validRun({ tasks: [{ title: 'x' }] }))[0]).toContain('task_id')
    })

    it('rejects a non-object payload', () => {
        expect(validateRun(null)).toEqual(['payload must be an object'])
        expect(validateRun([])).toEqual(['payload must be an object'])
    })

    it('rejects asks without id or title', () => {
        expect(validateRun(validRun({ asks: {} }))[0]).toContain('"asks"')
        expect(validateRun(validRun({ asks: [{ title: 'x' }] }))[0]).toContain('"id"')
        expect(validateRun(validRun({ asks: [{ id: 'a#1', title: '  ' }] }))[0]).toContain('"title"')
        expect(validateRun(validRun({ asks: [{ id: 'a#1', title: 'x' }] }))).toEqual([])
    })
})

describe('buildAsks', () => {
    it('returns no rows when the run carries no asks', () => {
        expect(buildAsks(validRun())).toEqual([])
    })

    it('keeps the detail whole and nulls empty optional fields', () => {
        const detail = 'あ'.repeat(5000)
        expect(
            buildAsks(
                validRun({
                    asks: [
                        { id: ' t#1 ', source: 't', title: ' 平文の認証情報を消す ', detail },
                        { id: 't#2', title: 'Docker Desktop を直す', source: '', detail: '' },
                    ],
                })
            )
        ).toEqual([
            { id: 't#1', source: 't', title: '平文の認証情報を消す', detail },
            { id: 't#2', source: null, title: 'Docker Desktop を直す', detail: null },
        ])
    })
})

describe('buildRow', () => {
    it('fills defaults for everything the wrapper omitted', () => {
        const row = buildRow({ started_at: '2026-08-12T07:00:00+09:00', outcome: 'skipped' })
        expect(row).toEqual({
            started_at: '2026-08-12T07:00:00+09:00',
            ended_at: null,
            outcome: 'skipped',
            trigger_reasons: [],
            model: null,
            effort: null,
            exit_code: null,
            steps: [],
            tasks: [],
            report_text: null,
        })
    })

    it('defaults a step status to ok and keeps an empty result', () => {
        const row = buildRow(validRun({ steps: [{ did: '  板の更新  ' }] }))
        expect(row.steps).toEqual([{ did: '板の更新', result: '', status: 'ok' }])
    })

    it('keeps only the trace subset the card needs', () => {
        const row = buildRow(
            validRun({
                tasks: [
                    {
                        task_id: ' 20260812-0100-example ',
                        title: '例',
                        outcome: 'done',
                        gate_passed: true,
                        summary: '再開のたびに落ちるのを止めるため、初期化の順序を入れ替えた。全緑。',
                        steps: [{ n: 1, desc: '実装', status: 'done', note: '緑' }],
                        failures: [{ phase: 'QA', symptom: '赤', resolution: '直した' }],
                        qa_rounds: 2,
                        notes: '想定外: 依存が古かった',
                        // 一覧の転送量が跳ねるので運ばない項目
                        gate: { checks: [{ name: 'target_dir_exists' }] },
                        artifacts: ['C:\\somewhere'],
                    },
                ],
            })
        )
        expect(row.tasks).toHaveLength(1)
        expect(row.tasks[0].task_id).toBe('20260812-0100-example')
        expect(row.tasks[0].summary).toBe(
            '再開のたびに落ちるのを止めるため、初期化の順序を入れ替えた。全緑。'
        )
        expect(row.tasks[0].steps).toEqual([{ desc: '実装', status: 'done', note: '緑' }])
        expect(row.tasks[0].failures[0].resolution).toBe('直した')
        expect(row.tasks[0].qa_rounds).toBe(2)
        expect(row.tasks[0].notes).toBe('想定外: 依存が古かった')
        expect(row.tasks[0]).not.toHaveProperty('gate')
        expect(row.tasks[0]).not.toHaveProperty('artifacts')
    })

    it('keeps an empty summary so old traces still fall back to steps', () => {
        const row = buildRow(validRun({ tasks: [{ task_id: 'legacy', steps: [{ desc: '実装' }] }] }))
        expect(row.tasks[0].summary).toBe('')
        expect(row.tasks[0].steps).toHaveLength(1)
    })

    it('truncates an over-long summary instead of dropping the whole run', () => {
        const row = buildRow(
            validRun({ tasks: [{ task_id: 'x', summary: 'あ'.repeat(MAX_TASK_SUMMARY_LENGTH + 1) }] })
        )
        expect(row.tasks[0].summary).toContain('切り捨て')
        expect([...row.tasks[0].summary].length).toBeGreaterThan(MAX_TASK_SUMMARY_LENGTH)
    })

    it('drops non-string trigger reasons instead of writing them through', () => {
        const row = buildRow(validRun({ trigger_reasons: ['queueに2件', 42, null] }))
        expect(row.trigger_reasons).toEqual(['queueに2件'])
    })
})

describe('truncateReportText', () => {
    it('returns null for an empty report', () => {
        expect(truncateReportText('')).toBeNull()
        expect(truncateReportText(undefined)).toBeNull()
    })

    it('marks the cut so a truncated report is not read as a short one', () => {
        const text = 'あ'.repeat(MAX_REPORT_TEXT_LENGTH + 10)
        const truncated = truncateReportText(text)
        expect(truncated.length).toBeGreaterThan(MAX_REPORT_TEXT_LENGTH)
        expect(truncated).toContain('切り捨て')
    })
})
