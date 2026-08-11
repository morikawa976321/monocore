# drain報告板 実装計画書

- 起票日: 2026-08-11
- 背景: taskbox drainは1日4枠(01:00/07:00/13:00/19:00)で無人稼働しているが、各枠が「起動したか・何をしたか・成功したか」を確認する手段が「セッション内でboard見せてと尋ねる」しかなく、都度尋ねる運用は無駄というユーザー指摘に基づく。
- 目的: Monocore上に新規ページ(報告板)を作り、drainの各枠の結果を**尋ねずに**閲覧できるようにする。
- スコープ確認済み事項(ユーザー回答、2026-08-11):
  - 表示対象は**taskboxのタスク処理だけでなくdrain全体**(0c判断回収・0d handover整理・6 engine整理バッチ・7 プロジェクト板更新・バックアップ・ロック処理を含む)。これは実際にユーザーが選択した回答。
- **未確認のまま計画者(Claude)の判断で仮置きした事項**(以下2点は質問がスキップされており、ユーザーは回答していない。「[No preference]」はスキップ時にツールが入れるプレースホルダであり、「お任せする」という意思表示ではない。誤って「ユーザー回答」として扱ってしまった経緯があるため、ここで明示的に区別する):
  - `/projects`の`project_notes`のような「ユーザーが返信してdrainが拾う」連動 → 計画では**なし(読み取り専用)**として仮置き。理由は後述§9(あくまでClaudeの推奨理由であり、ユーザー承認ではない)。
  - データの反映元 → 計画では**drain側からSupabaseへの直接upsert**として仮置き。理由は後述§9(同上)。
  - **この2点は実装(特にM3: drain.ps1改修)に着手する前に、ユーザーに改めて確認すること。**

## 1. 結論(採用する設計)

`/projects`・`/reports`と同型(service_role upsertスクリプト → read-onlyテーブル → 一覧ページ)のパターンを踏襲しつつ、**書き込みはLLMセッションではなくPowerShellラッパー(`drain.ps1`)自身が行う**。

理由: `drain.ps1`は各run(枠)について「起動理由・使ったモデル/エフォート・exit code・バックアップ結果・PROJECT_BOARD_CHECKEDの有無」を**既に変数として持っている**。さらに`taskbox/traces/<task-id>.json`(タスク単位の実行トレース、構造化JSON、完了ゲート通過が前提)を走査すれば、タスク単位の結果も機械的に取得できる。LLMセッションに新しい手順(SKILL.mdの新ステップ)を追加して自己申告させる必要が一切ない。

これはtaskboxが一貫して採っている「完了は自己申告で決めない、機械判定を根拠にする」という設計思想(完了ゲート`verify-task.ps1`と同じ発想)に合致する。副次的な利点として、Supabaseのservice_role鍵をLLMの会話コンテキストに一切触れさせずに済む(現行の0c/7はセッション内でconfig.jsonを読んでいるが、この新機能はPowerShellだけで完結する)。

**SKILL.mdの変更は不要**。変更は次の3箇所に閉じる:
1. `taskbox/drain.ps1`の改修(run結果のJSON組み立て+投入スクリプト呼び出し)
2. `monocore/scripts/upsert-drain-run.mjs`(+`drain-run-payload.mjs`)の新設
3. Monocore側の新規ページ・クエリ層・DBスキーマ

## 2. データモデル

新規マイグレーション: `supabase/migrations/<timestamp>_add_drain_runs.sql`(命名は既存の`squashed_baseline.sql`以降のファイルに倣う)。

```sql
-- drain_runs（drain 1回=1枠につき1行。起動した場合もトリアージでスキップした場合も1行書く）
CREATE TABLE public.drain_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at TIMESTAMPTZ NOT NULL UNIQUE,
    ended_at TIMESTAMPTZ,
    run_type TEXT NOT NULL CHECK (run_type IN ('launched', 'skipped')),
    trigger_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,   -- $reasons をそのまま(起動時)。skip時は空配列
    model TEXT,
    effort TEXT,
    exit_code INTEGER,
    tasks_done_count INTEGER NOT NULL DEFAULT 0,
    tasks_failed_count INTEGER NOT NULL DEFAULT 0,
    handover_touched BOOLEAN NOT NULL DEFAULT false,      -- handover.md の mtime が run window内か(ヒューリスティック)
    engine_commits_count INTEGER NOT NULL DEFAULT 0,      -- git rev-list --count <run前SHA>..<run後SHA>
    project_board_checked BOOLEAN NOT NULL DEFAULT false, -- 既存の PROJECT_BOARD_CHECKED 検出をそのまま転記
    lock_residue_cleared BOOLEAN NOT NULL DEFAULT false,  -- 既存の DRAIN_LOCK_ACQUIRED 残骸検出をそのまま転記
    backup_ok BOOLEAN,
    backup_duration_sec NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.drain_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select drain runs"
ON public.drain_runs
FOR SELECT
TO authenticated
USING (true);

CREATE INDEX idx_drain_runs_started_at ON public.drain_runs (started_at DESC);

-- drain_run_tasks（1タスク=1行。traces/<task-id>.json をほぼそのまま持つ）
CREATE TABLE public.drain_run_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES public.drain_runs (id) ON DELETE CASCADE,
    task_id TEXT NOT NULL,
    title TEXT,
    outcome TEXT CHECK (outcome IN ('done', 'failed')),
    gate_passed BOOLEAN,
    target_dir TEXT,
    trace JSONB NOT NULL,   -- traces/<task-id>.json の内容そのもの
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (run_id, task_id)
);

ALTER TABLE public.drain_run_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select drain run tasks"
ON public.drain_run_tasks
FOR SELECT
TO authenticated
USING (true);

CREATE INDEX idx_drain_run_tasks_run_id ON public.drain_run_tasks (run_id);

GRANT SELECT ON public.drain_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drain_runs TO service_role;
GRANT SELECT ON public.drain_run_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drain_run_tasks TO service_role;
```

`project_cards`(既存)と同じく`authenticated`はSELECTのみ、書き込みは`service_role`(ローカルスクリプト経由)のみ。手入力欄は持たない(`docs/design.md`の「導出物に手入力欄を作らない」原則に合致)。

`drain_run_tasks.trace`にtraces JSON全体をそのまま格納するのは、taskbox側のtrace schemaが今後変わってもMonocore側のマイグレーション追従を不要にするため(表示側で`trace.qa`や`trace.failures`を直接参照する)。

## 3. データ投入経路 — `drain.ps1`改修

現行`drain.ps1`の構造(確認済み、行番号は目安):

- 冒頭: `$root`/`$log`/`$lock`/`$state`/`$engine`を定義し、`Write-Log "===== drain start ..."`を出す
- トリアージ: `$reasons`配列に理由を積む。`$queueCount`・`$notesPending`・`$engineSha`/`$engineDirty`/`$lastSha`・`$inboxCount`を算出
- `if ($reasons.Count -eq 0 -and -not $Force) { ...; Invoke-Backup; exit 0 }` ← **スキップ経路**
- `$why`組み立て → `claude.exe`起動 → `$out`/`$exit`取得 → `DRAIN_LOCK_ACQUIRED`検出でロック残骸削除 → `PROJECT_BOARD_CHECKED`検出で`$state`(`drain-state.json`)のSHA更新 → `Invoke-Backup` → 終了ログ ← **起動経路**

### 3.1 追加する共通関数 `Report-DrainRun`

`Invoke-Backup`関数の近くに新規関数を追加する。

```powershell
function Report-DrainRun {
    param(
        [string]$RunType,          # 'launched' | 'skipped'
        [datetime]$StartedAt,
        [datetime]$EndedAt,
        [string[]]$Reasons = @(),
        [string]$Model = $null,
        [string]$Effort = $null,
        [Nullable[int]]$ExitCode = $null,
        [bool]$BoardChecked = $false,
        [bool]$LockResidueCleared = $false,
        [string]$EngineShaBefore = $null
    )

    # config.json が読めない/接続できない場合は drain を止めず、ログに1行残してスキップする(0cと同じ方針)
    $cfgPath = Join-Path $env:USERPROFILE '.monocore\config.json'
    if (-not (Test-Path $cfgPath)) {
        Write-Log 'wrapper: config.json が無いため drain報告板への投入をスキップ'
        return
    }
    try {
        $cfg = ((Get-Content $cfgPath -Raw -Encoding UTF8) -replace "^\uFEFF", '') | ConvertFrom-Json
    } catch {
        Write-Log ('wrapper: config.json の読み込みに失敗したため drain報告板への投入をスキップ: ' + $_.Exception.Message)
        return
    }

    # タスク単位: run window(StartedAt〜EndedAt)内に更新された traces/*.json を機械的に収集
    $tasks = @()
    if ($RunType -eq 'launched') {
        $traceDir = Join-Path $root 'traces'
        Get-ChildItem $traceDir -File -Filter '*.json' -ErrorAction SilentlyContinue |
            Where-Object { $_.LastWriteTime -ge $StartedAt -and $_.LastWriteTime -le $EndedAt } |
            ForEach-Object {
                try {
                    $trace = (Get-Content $_.FullName -Raw -Encoding UTF8) | ConvertFrom-Json
                    $tasks += [pscustomobject]@{
                        task_id     = $trace.task_id
                        title       = $trace.title
                        outcome     = $trace.outcome
                        gate_passed = $trace.gate.passed
                        target_dir  = $trace.target_dir
                        trace       = $trace
                    }
                } catch {
                    Write-Log ("wrapper: trace読み込み失敗のためdrain報告板から除外: $($_.FullName)")
                }
            }
    }
    $doneCount   = @($tasks | Where-Object { $_.outcome -eq 'done' }).Count
    $failedCount = @($tasks | Where-Object { $_.outcome -eq 'failed' }).Count

    # handover.md の更新有無(mtimeヒューリスティック。0dが実際に走ったかの近似値)
    $hoTouched = $false
    $hoPath = Join-Path $root 'handover.md'
    if (Test-Path $hoPath) {
        $hoTouched = (Get-Item $hoPath).LastWriteTime -ge $StartedAt
    }

    # engineのコミット数(0が整理バッチ含む変更なし、それ以外は7の板更新や6のバッチが動いた可能性)
    $engineCommits = 0
    if ($EngineShaBefore) {
        try {
            $afterSha = (git -C $engine rev-parse HEAD 2>$null)
            if ($afterSha -and $afterSha -ne $EngineShaBefore) {
                $engineCommits = [int](git -C $engine rev-list --count "$EngineShaBefore..$afterSha" 2>$null)
            }
        } catch {}
    }

    # バックアップ結果(Invoke-Backupが書いた backup-status.json をそのまま読む)
    $backupOk = $null; $backupDur = $null
    $st = Join-Path $root 'backup-status.json'
    if (Test-Path $st) {
        try {
            $status = ((Get-Content $st -Raw -Encoding UTF8) -replace "^\uFEFF", '') | ConvertFrom-Json
            if ($status.ran_at -and ([datetime]$status.ran_at) -ge $StartedAt) {
                $backupOk = $status.ok
            }
        } catch {}
    }

    $payload = [pscustomobject]@{
        run = [pscustomobject]@{
            started_at             = $StartedAt.ToString('o')
            ended_at               = if ($EndedAt) { $EndedAt.ToString('o') } else { $null }
            run_type                = $RunType
            trigger_reasons         = @($Reasons)
            model                   = $Model
            effort                  = $Effort
            exit_code               = $ExitCode
            tasks_done_count        = $doneCount
            tasks_failed_count      = $failedCount
            handover_touched        = $hoTouched
            engine_commits_count    = $engineCommits
            project_board_checked   = $BoardChecked
            lock_residue_cleared    = $LockResidueCleared
            backup_ok               = $backupOk
        }
        tasks = @($tasks)
    }

    $tmpFile = Join-Path $env:TEMP ("drain-run-report-{0}.json" -f [guid]::NewGuid())
    ($payload | ConvertTo-Json -Depth 20) | Out-File -FilePath $tmpFile -Encoding utf8

    try {
        $env:SUPABASE_URL = $cfg.envs.remote.url
        $env:SUPABASE_SERVICE_ROLE_KEY = $cfg.envs.remote.service_key
        $result = & node 'C:\Users\tm976\mf\monocore\scripts\upsert-drain-run.mjs' $tmpFile 2>&1
        Write-Log ('wrapper: drain報告板へ投入 ' + ($result -join ' / '))
    } catch {
        Write-Log ('wrapper: drain報告板への投入に失敗(drain自体は続行): ' + $_.Exception.Message)
    } finally {
        Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue
        Remove-Item Env:\SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
    }
}
```

**フェイルオープン原則**: 投入に失敗してもdrain本体は絶対に止めない(try/catchで囲み、失敗はdrain.logに1行残すだけ)。既存の0c(判断回収)・7(プロジェクト板)と同じ姿勢。

### 3.2 呼び出し箇所

**(a) スキップ経路**(`if ($reasons.Count -eq 0 -and -not $Force)`ブロック内、`Invoke-Backup`の直後):
```powershell
Invoke-Backup
Report-DrainRun -RunType 'skipped' -StartedAt $runStartedAt -EndedAt (Get-Date) `
    -Reasons @() -ExitCode 0
Write-Log ("===== drain end ... (skipped) =====")
exit 0
```

**(b) 起動経路**(最後の`Invoke-Backup`呼び出しの直後、終了ログの前):
```powershell
Invoke-Backup
Report-DrainRun -RunType 'launched' -StartedAt $runStartedAt -EndedAt (Get-Date) `
    -Reasons $reasons -Model $Model -Effort $Effort -ExitCode $exit `
    -BoardChecked $boardChecked -LockResidueCleared $lockResidueCleared -EngineShaBefore $engineSha

Write-Log ("===== drain end {0} exit={1} =====" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $exit)
```

**(c) 前提となる変数追加**:
- `$runStartedAt = Get-Date` をスクリプト冒頭(`Write-Log "===== drain start ..."`を出す直前)に追加する。
- `$lockResidueCleared`: 既存の`if (($out -join "`n") -match 'DRAIN_LOCK_ACQUIRED' -and (Test-Path $lock)) { ... }`ブロックの中で`$true`に設定する変数を新設(現状はロジックはあるが結果を変数に残していない)。

### 3.3 `handover_touched`・`engine_commits_count`はヒューリスティックである旨の明記

`handover_touched`はmtimeベースの近似値であり、handover.mdが0d以外の理由で更新された場合も`true`になりうる。`engine_commits_count`も同様に、6(整理バッチ)以外の理由(通常のノート追記等)のコミットも含みうる。これらは「0dや6が確実に実行された証明」ではなく「その可能性を示す参考値」として画面に表示する(§8のUI設計で「厳密な実行フラグ」ではなく「観測値」として見せる)。

## 4. 投入スクリプト(Monocore側)

`scripts/project-cards-payload.mjs` / `scripts/upsert-project-cards.mjs`のペアと同じ構成を踏襲。

### `scripts/drain-run-payload.mjs`(純関数、テスト対象)
- `ALLOWED_RUN_TYPES = ['launched', 'skipped']`
- `ALLOWED_OUTCOMES = ['done', 'failed']`
- `normalizeRun(raw)` — run行を`drain_runs`のカラムに整形(欠損フィールドはデフォルト値で補完)
- `validateRun(run)` — `started_at`必須・`run_type`が許可値か等を検査、不正なら例外
- `normalizeTask(raw, runId)` — task行を`drain_run_tasks`のカラムに整形(`trace`はそのままJSONB化)
- `validateTask(task)` — `task_id`必須・`outcome`が許可値か検査

### `scripts/upsert-drain-run.mjs`
```
node scripts/upsert-drain-run.mjs <path-to-json>
```
処理フロー: JSONファイル読み込み(`{run, tasks}`)→`normalizeRun`+`validateRun`(不正なら**1行も書かずに**exit 1。project_cardsと同じ「全部揃ってから書く」原則)→`drain_runs`へ`upsert(row, {onConflict: 'started_at'})`し`id`を取得(`.select('id').single()`)→各taskに`run_id`を付与し`normalizeTask`+`validateTask`→`drain_run_tasks`へ`upsert(rows, {onConflict: 'run_id,task_id'})`。標準出力に`done件数/failed件数/run_id`を1行で出す(drain.logに残る)。

`scripts/drain-run-payload.test.mjs`をvitestで用意し、`project-cards-payload.test.mjs`と同じ粒度(正常系・欠損フィールド・不正なrun_type/outcome)でテストする。

## 5. Monocore側実装(画面)

`docs/directory_structure.md`§5の標準フローに従う: DB → 型 → クエリ層 → コンポーネント → page.tsx。

1. **DB**: §2のマイグレーションを適用後、`src/types/database.types.ts`を再生成(または手動追記)。
2. **クエリ層**: `src/lib/supabase/queries/drain-runs.ts`
   - `getDrainRuns(limit = 50)` — `drain_runs`を`started_at desc`で取得し、`drain_run_tasks(*)`をネストselect(`.select('*, drain_run_tasks(*)')`)。件数は月間120run程度の想定でページネーションは不要、`limit`で直近のみ表示(board.mdの「完了(直近10件)」と同じ発想)。
3. **コンポーネント**: `src/components/drain-runs/`
   - `DrainRunsSection.tsx` — 一覧のラッパー(ローディング/エラー/空表示)
   - `DrainRunCard.tsx` — 1run分のカード。`/projects`の`ProjectCard.tsx`と同じ開閉トグルパターンを流用。ヘッダに日時・run_type(launched/skipped)バッジ・model/effort・done/failed件数。展開するとタスク一覧(`title`・`outcome`・`gate_passed`・`target_dir`)とrunレベルの観測値(handover_touched・engine_commits_count・project_board_checked・lock_residue_cleared・backup_ok)を表示。
4. **ページ**: `src/app/drain-log/page.tsx`(`'use client'`)。`/projects`page.tsxと同じ構造(`useMemo`でクライアント生成→`useEffect`でロード→`PageHeader`にリロードボタン)。
5. **サイドバー**: `src/components/layout/Sidebar.tsx`のMENU_ITEMS配列に`/drain-log`(ラベル案「実行ログ」)を追加。

### デザイン制約(`README-design.md`準拠、§10自己チェックリストを適用すること)
- 色はneutral/amber/red/transparentのみ。**green(成功色)は使わない** — `done`件数や`backup_ok=true`は色を使わず、`failed`件数やエラーのみamber/redで強調する設計にする。
- 角丸は`rounded-sm`/`rounded`のみ、shadow禁止。
- アイコンは`lucide-react`のみ。
- Button/Input/TextareaはUI共通コンポーネントを使い、自作しない(このページは入力フォームを持たないため主にButtonのみ使用見込み)。

## 6. 初回バックフィル(任意・ベストエフォート)

- **`drain_run_tasks`**: 既存の`taskbox/traces/*.json`(64件、2026-08-06以降)を一括で読み、`run_id`を持たない暫定行として投入することは可能だが、`drain_runs`側のrunレベル情報(起動理由・model/effort・backup結果等)は**過去分については構造化データとして残っていない**(drain.logの自由文をパースするのは脆く非推奨)。
- **方針**: バックフィルは行わず、本改修が入った時点から新規に記録を開始する。理由は「過去ログの無理な構造化」より「今後の記録の正確さ」を優先するため(taskbox自体が「トレースは2026-08-06以降のみ、遡及生成なし」という前例を持つ)。
- 必要なら`traces/*.json`全件を`drain_run_tasks`にrun_idなしで参考投入する低優先度タスクを別途検討可能だが、本計画のスコープ外とする。

## 7. 実装ステップ(マイルストーン)

taskboxのタスクファイルとして積む場合の単位を想定して分割する。

| # | 内容 | target_dir | 備考 |
|---|---|---|---|
| M1 | マイグレーション作成・適用・型更新 | monocore | §2。ローカル/リモート両方に適用し`database.types.ts`更新まで |
| M2 | `drain-run-payload.mjs`+テスト、`upsert-drain-run.mjs` | monocore | §4。手作りのサンプルJSON(`drain-run.sample.json`)で単体テスト |
| M3 | `drain.ps1`改修 | taskbox | §3。**最初は手動実行(`-Model`指定)で検証**し、スケジュールタスクには最後に反映する |
| M4 | 画面実装(クエリ層・コンポーネント・page・Sidebar) | monocore | §5 |
| M5 | 結合検証 | taskbox / monocore | M3のdrain.ps1を手動実行→Supabaseに行が入る→M4の画面に表示される、を1本の線で確認 |

M1→M2→(M3, M4は並行可)→M5の順で進めるのが自然。M3はスケジュールタスクの本番スクリプトを触るため、§9のリスク対応を必ず先に読むこと。

## 8. UI設計の要点(参考イメージ)

```
実行ログ
─────────────────────────────
▸ 08/11 19:00  launched  opus/xhigh  done 3 / failed 0
▸ 08/11 13:00  launched  opus/xhigh  done 6 / failed 0
▾ 08/11 07:00  launched  opus/xhigh  done 2 / failed 1
    起動理由: queueに4件 / engineに新しいコミット
    タスク:
      - duocad-circular-pattern-logic   done   gate:pass
      - xxxxx-yyyy                      failed gate:fail  (target_dir: ...)
    観測値: handover整理=touched / engine差分=3コミット / 板更新確認=済 / ロック残骸処理=なし / バックアップ=成功
▸ 08/11 01:00  skipped  (queue=0, 判断待ち=0, engine=変更なし, handover=閾値内, inbox=12件)
```

`skipped`行も1行として残すことで、「その枠は本当に何もなかったのか、それとも動かなかっただけなのか」が一覧から判別できる(現状はdrain.logを見るまで分からない)。

## 9. Claudeの判断としての推奨理由(ユーザー未承認・要確認)

以下の2点は、質問がスキップされ**ユーザーからの回答を得られていない**まま、計画者(Claude)が仮に採用した設計である。「妥当だろう」という判断の根拠は示すが、ユーザーの合意を得たものではない。実装着手前に改めて確認すること。

- **既読管理・返信連動なし(仮)**: drain結果は「ユーザーが把握する」ためのログであり、「ユーザーが判断を返す」窓口ではない、という位置づけで設計した。判断が必要な項目は既に`/projects`の`decisions`(＋`project_notes`)という専用の窓口があり、SKILL.md手順7-(0)も「boardは監査ログ、カードが窓口」と明確に役割分担している。この報告板もその原則に従わせ、**監査ログ専用(読み取り専用)**とする案。将来「この失敗タスクについてコメントしたい」等のニーズが出た場合は、`project_notes`と同型のテーブルを追加すれば対応できる(可逆な設計のつもり)。
- **反映元はdrain.ps1からの直接upsert(仮)**: §1の理由の通り、機械判定できる情報をLLMの自己申告に頼らせない方が、taskboxの既存思想(完了ゲート等)と一貫すると判断した案。副次的にSKILL.mdの複雑化を避けられ、service_role鍵をLLMコンテキストから遠ざけられる。

## 10. 残る確認事項(実装前に決めておくと手戻りが減る点)

- **§9の2点(既読管理連動の要否、反映元の設計)— ユーザーの実際の意思確認がまだ済んでいない。最優先で確認すること。**
- ページのURLとサイドバーのラベル文言(本計画では仮に`/drain-log`・「実行ログ」としている)。
- `drain_run_tasks`の保持期間・件数上限は当面設けない方針でよいか(月間タスク数はqueueの実績から見て数十件/月程度と推測され、当面は問題にならない想定)。
- Monocoreのデプロイ先(Vercel等)を確認できなかった。本機能はブラウザ側の変更のみで、投入はローカル(drain.ps1)から行うため通常はデプロイ経路に影響しないが、念のためM4着手時に確認する。
