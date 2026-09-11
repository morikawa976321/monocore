import { describe, expect, it } from 'vitest'
import type { DrainRunListRow } from '@/src/lib/supabase/queries/drain-runs'
import { groupDrainRuns } from './group-runs'

function makeRun(startedAt: string, outcome: string): DrainRunListRow {
    return {
        started_at: startedAt,
        ended_at: startedAt,
        outcome,
        trigger_reasons: [],
        model: null,
        effort: null,
        exit_code: 0,
        steps: [],
        tasks: [],
    }
}

describe('groupDrainRuns', () => {
    it('leaves a lone skipped run ungrouped', () => {
        const run = makeRun('2026-09-11T05:00:00+09:00', 'skipped')
        expect(groupDrainRuns([run])).toEqual([{ kind: 'run', run }])
    })

    it('groups 2 or more consecutive skipped runs', () => {
        const runs = [
            makeRun('2026-09-11T14:00:00+09:00', 'skipped'),
            makeRun('2026-09-11T13:00:00+09:00', 'skipped'),
            makeRun('2026-09-11T12:00:00+09:00', 'skipped'),
        ]
        expect(groupDrainRuns(runs)).toEqual([{ kind: 'skipped-group', runs }])
    })

    it('does not merge skipped runs across a non-skipped run between them', () => {
        const a = makeRun('2026-09-11T14:00:00+09:00', 'skipped')
        const b = makeRun('2026-09-11T13:00:00+09:00', 'skipped')
        const c = makeRun('2026-09-11T12:00:00+09:00', 'completed')
        const d = makeRun('2026-09-11T11:00:00+09:00', 'skipped')
        const e = makeRun('2026-09-11T10:00:00+09:00', 'skipped')

        expect(groupDrainRuns([a, b, c, d, e])).toEqual([
            { kind: 'skipped-group', runs: [a, b] },
            { kind: 'run', run: c },
            { kind: 'skipped-group', runs: [d, e] },
        ])
    })

    it('never groups crashed runs, even next to skipped ones', () => {
        const runs = [
            makeRun('2026-09-11T14:00:00+09:00', 'skipped'),
            makeRun('2026-09-11T13:00:00+09:00', 'crashed'),
            makeRun('2026-09-11T12:00:00+09:00', 'skipped'),
        ]
        expect(groupDrainRuns(runs)).toEqual([
            { kind: 'run', run: runs[0] },
            { kind: 'run', run: runs[1] },
            { kind: 'run', run: runs[2] },
        ])
    })

    it('returns an empty list for no runs', () => {
        expect(groupDrainRuns([])).toEqual([])
    })
})
