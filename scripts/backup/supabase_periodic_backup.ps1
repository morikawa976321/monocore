# monocore 本番Supabase — 定期バックアップ(スキーマ+データ)
#
# 起動: taskbox drain.ps1 が毎run終了時に呼ぶ(Invoke-MonocoreDbBackup)。枠は drain と同じ
#       01/07/13/19時。判断が要らない機械工程なので claude は起動しない。
#       手動: pwsh -ExecutionPolicy Bypass -File C:\Users\tm976\mf\monocore\scripts\backup\supabase_periodic_backup.ps1
#
# 経緯(2026-08-30): inboxes.contentが空文字列で上書きされ、直近の手動バックアップ
# (backups/manual)が2026-08-11までしか遡れなかった。手動バックアップは「必要なタイミングで
# 取る」運用のため、日常的な取りこぼしを防ぐ定期実行が無かった。
#
# ■ 資格情報を一切永続化しない(docs/supabase-backup.md の既存方針を踏襲)
#   `npx supabase db dump --linked` は接続情報を都度 `supabase db dump --linked --dry-run` 相当の
#   経路で解決する(CLIのログイン済みセッションを使う)。PGPASSWORD等をこのスクリプト・
#   ディスク上のどのファイルにも書かない。
#
# ■ スキーマ変更に追随するためスクリプトを書き直さない設計
#   pg_dump(を内部で叩く supabase db dump)はテーブル名を一切ハードコードせず、その時点の
#   実スキーマを丸ごと読む。テーブルの追加・削除・列変更があっても、このスクリプトは無変更で
#   次回から新しいスキーマのダンプを取る。プレーンSQL(--use-copy)で保存するのは、pg_restore・
#   Dockerが無くても psql -f だけで中身を読める/戻せるようにするため。
#
# ■ Docker Desktopの起動はベストエフォート
#   drainが無人実行される時間帯にDocker Desktopが落ちていることがある(2026-08-30に実際に
#   発生)。自動起動を試みるが、デスクトップセッションが無い等で失敗する場合はフェイルオープンで
#   ステータスに reason=docker_unavailable を残し、queueへ調査タスクを積んで終了する
#   (backup.ps1 と同じ「検知だけで終わらせない」方針)。

param(
    [int]$RetentionDays = 30,
    [int]$DockerWaitSeconds = 90
)

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$repoRoot    = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$taskboxRoot = 'C:\Users\tm976\mf\taskbox'
$backupRoot  = Join-Path $repoRoot 'backups\auto'
$log         = Join-Path $backupRoot 'backup.log'
$statusPath  = Join-Path $backupRoot 'backup-status.json'

New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

$script:Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
function Write-Log([string]$line) {
    [System.IO.File]::AppendAllText($log, $line + "`r`n", $script:Utf8NoBom)
}

$runStart = Get-Date
Write-Log ("`n===== monocore db backup start {0} =====" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))

$problems = @()
$reason = $null
$schemaBytes = 0
$dataBytes = 0
$prunedCount = 0
$runDir = $null

function Write-Status([bool]$ok) {
    $obj = [ordered]@{
        ran_at      = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK')
        ok          = $ok
        reason      = $reason
        schema_bytes = $schemaBytes
        data_bytes   = $dataBytes
        pruned_count = $prunedCount
        dir          = $runDir
        duration_seconds = [math]::Round(((Get-Date) - $runStart).TotalSeconds, 1)
        problems     = @($problems)
    }
    $json = $obj | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($statusPath, $json, $script:Utf8NoBom)
}

function Add-QueueFailureTask {
    try {
        $qname = (Get-Date -Format 'yyyyMMdd') + '-0000-monocore-db-backup-failure.md'
        $qpath = Join-Path (Join-Path $taskboxRoot 'queue') $qname
        $already = (Test-Path $qpath) -or
                   (Test-Path (Join-Path (Join-Path $taskboxRoot 'running') $qname)) -or
                   (Test-Path (Join-Path (Join-Path $taskboxRoot 'done') $qname))
        if ($already) {
            Write-Log '調査タスクは既に積まれている(重複を避けてスキップ)'
            return
        }
        $body = @"
---
title: monocore本番DBの定期バックアップの異常を調査して報告する
target_dir: C:\Users\tm976\mf\monocore
expected_artifacts: backups/auto/backup-incident-$(Get-Date -Format 'yyyy-MM-dd').md
started:
---

## 目的

$(Get-Date -Format 'yyyy-MM-dd HH:mm') のmonocore本番Supabaseの定期バックアップ実行で異常が
検出された。原因を切り分け、
monocore/backups/auto/backup-incident-$(Get-Date -Format 'yyyy-MM-dd').md に報告を書く。

## 検出された異常

理由コード: **$(if ($reason) { $reason } else { 'unknown' })**

$($problems | ForEach-Object { "- $_" } | Out-String)

## 調べること

- ``monocore\backups\auto\backup.log`` の直近の実行ブロック
- ``monocore\backups\auto\backup-status.json``(機械可読の最新状態。``reason`` フィールドを見る)
- 理由コード別:
  - ``docker_unavailable`` … Docker Desktopが無人起動できなかった。デスクトップセッションの
    有無、Docker Desktopの自動起動設定を確認する
  - ``dump_failed`` … ``npx supabase db dump --linked`` 自体が失敗。CLIログインセッションの
    失効(``npx supabase login``)、ネットワーク、Supabase側の障害を疑う
  - それ以外 … ログの全文を見る

## 制約

- バックアップ先のファイルを消して作り直さない(破損の証拠が消える)。
- 原因が特定できないまま「復旧した」と報告しない。
"@
        [System.IO.File]::WriteAllText($qpath, $body, $script:Utf8NoBom)
        Write-Log ('queue へ調査タスクを積んだ: ' + $qname)
    } catch {
        Write-Log ('queueへの積み込みに失敗: ' + $_.Exception.Message)
    }
}

function Test-DockerReady {
    try {
        docker info *> $null
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    }
}

# ---------------------------------------------------------------
# 1. Docker daemon確認(ベストエフォートで自動起動)
# ---------------------------------------------------------------
if (-not (Test-DockerReady)) {
    Write-Log 'Docker daemon 未応答。Docker Desktop の起動を試みる'
    $dockerExe = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
    if (Test-Path $dockerExe) {
        try { Start-Process -FilePath $dockerExe | Out-Null } catch {
            Write-Log ('Docker Desktop の起動に失敗: ' + $_.Exception.Message)
        }
    } else {
        Write-Log ('Docker Desktop の実行ファイルが見つからない: ' + $dockerExe)
    }

    $waited = 0
    while (-not (Test-DockerReady) -and $waited -lt $DockerWaitSeconds) {
        Start-Sleep -Seconds 3
        $waited += 3
    }

    if (-not (Test-DockerReady)) {
        $reason = 'docker_unavailable'
        $problems += "Docker daemonが${DockerWaitSeconds}秒待っても応答しなかった"
        Write-Log ('異常: ' + $problems[-1])
        Write-Status $false
        Add-QueueFailureTask
        Write-Log ("===== monocore db backup end {0} exit=1 (docker unavailable) =====" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
        exit 1
    }
    Write-Log ("Docker daemon 応答確認(起動待ち ${waited}秒)")
}

# ---------------------------------------------------------------
# 2. ダンプ取得(スキーマ + データ、npx supabase db dump --linked)
#    テーブル名を一切ハードコードしない — その時点の実スキーマをそのまま読む。
# ---------------------------------------------------------------
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$runDir = Join-Path $backupRoot $ts
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

$schemaPath = Join-Path $runDir 'schema.sql'
$dataPath = Join-Path $runDir 'data.sql'

Push-Location $repoRoot
try {
    Write-Log 'スキーマダンプ開始(npx supabase db dump --linked)'
    $schemaOut = & npx supabase db dump --linked -f $schemaPath 2>&1
    $schemaExit = $LASTEXITCODE
    if ($schemaExit -ne 0) {
        $problems += "スキーマダンプが exit=${schemaExit}: $(($schemaOut | Out-String).Trim())"
    }

    Write-Log 'データダンプ開始(npx supabase db dump --linked --data-only --use-copy)'
    $dataOut = & npx supabase db dump --linked --data-only --use-copy -f $dataPath 2>&1
    $dataExit = $LASTEXITCODE
    if ($dataExit -ne 0) {
        $problems += "データダンプが exit=${dataExit}: $(($dataOut | Out-String).Trim())"
    }
} finally {
    Pop-Location
}

if (Test-Path $schemaPath) { $schemaBytes = (Get-Item $schemaPath).Length }
if (Test-Path $dataPath) { $dataBytes = (Get-Item $dataPath).Length }

if ($schemaBytes -le 64) { $problems += "schema.sqlが小さすぎる(${schemaBytes} bytes)" }
if ($dataBytes -le 64) { $problems += "data.sqlが小さすぎる(${dataBytes} bytes)" }

if ($problems.Count -gt 0) {
    $reason = 'dump_failed'
    foreach ($p in $problems) { Write-Log ('異常: ' + $p) }
    Write-Status $false
    Add-QueueFailureTask
    Write-Log ("===== monocore db backup end {0} exit=1 (dump failed) =====" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
    exit 1
}

Write-Log ("ダンプ成功: schema=${schemaBytes} bytes, data=${dataBytes} bytes, dir=${runDir}")

# ---------------------------------------------------------------
# 3. 保持期間を超えた古い定期バックアップを削除(既定30日)
#    backups/manual(手動バックアップ)には触れない — 別ディレクトリ。
# ---------------------------------------------------------------
$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -Path $backupRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $parsed = [datetime]::MinValue
    if ([datetime]::TryParseExact($_.Name, 'yyyyMMdd-HHmmss', [System.Globalization.CultureInfo]::InvariantCulture,
            [System.Globalization.DateTimeStyles]::None, [ref]$parsed)) {
        if ($parsed -lt $cutoff) {
            try {
                Remove-Item -Path $_.FullName -Recurse -Force
                $prunedCount += 1
                Write-Log ('保持期間超過で削除: ' + $_.Name)
            } catch {
                Write-Log ('削除に失敗: ' + $_.Name + ' - ' + $_.Exception.Message)
            }
        }
    }
}

Write-Status $true
Write-Log ("===== monocore db backup end {0} exit=0 (pruned=${prunedCount}) =====" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
exit 0
