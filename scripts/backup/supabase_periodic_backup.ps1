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
# ■ Dockerを使わない設計(2026-08-30、当初のDocker版から書き換え)
#   当初はDocker経由(npx supabase db dump --linked)で実装したが、同日Docker Desktopが
#   sailor-ingest.sockのバインドに失敗して繰り返しクラッシュする不具合を実地で踏んだ
#   (Windows側の問題で、WSLの完全シャットダウンでも直らなかった)。無人実行のたびに
#   Docker Desktop(GUIアプリ)の起動待ちに依存するのはそれ自体が壊れやすい設計だったため、
#   WSL2(Ubuntu)へ直接 postgresql-client-17 を入れ、pg_dumpをDocker無しで直接実行する方式へ
#   切り替えた。`wsl.exe`はGUIセッションが無くても動くコマンドラインツールなので、
#   Docker Desktopより無人実行との相性が良い。
#
# ■ 資格情報を一切永続化しない(docs/supabase-backup.md の既存方針を踏襲)
#   `npx supabase db dump --linked --dry-run` が接続情報(PGHOST/PGPORT/PGUSER/PGPASSWORD/
#   PGDATABASE)を都度解決する(CLIのログイン済みセッションを使う。dry-runはDockerを使わない
#   ことを実地で確認済み)。取得した値はこのスクリプト内のメモリ上でのみ扱い、ディスク上の
#   どのファイルにも書かない。WSLへは`$env:WSLENV`(コロン区切り。スラッシュ区切りだと
#   このWSLビルドでは転送に失敗することを実地で確認した)経由で環境変数として渡すのみ。
#
# ■ スキーマ変更に追随するためスクリプトを書き直さない設計
#   pg_dumpはテーブル名を一切ハードコードせず、その時点の実スキーマを丸ごと読む。テーブルの
#   追加・削除・列変更があっても、このスクリプトは無変更で次回から新しいスキーマのダンプを
#   取る。プレーンSQLで保存するのは、pg_restoreが無くても psql -f だけで中身を読める/
#   戻せるようにするため。
#
# ■ WSL側の前提(初回のみ手動セットアップ済み。以降は自動判定してスキップ)
#   WSL Ubuntuディストロに postgresql-client-17 (apt.postgresql.org / PGDG) を導入済み。
#   本番がPostgreSQL 17系のため、pg_dumpもバージョンを合わせる必要がある
#   (バージョンが古いと `aborting because of server version mismatch` で拒否される)。
#   未導入の環境で動かす場合は Install-PgDump17IfMissing が自動導入を試みる。

param(
    [int]$RetentionDays = 30
)

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$repoRoot    = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$taskboxRoot = 'C:\Users\tm976\mf\taskbox'
$backupRoot  = Join-Path $repoRoot 'backups\auto'
$log         = Join-Path $backupRoot 'backup.log'
$statusPath  = Join-Path $backupRoot 'backup-status.json'
$wslDistro   = 'Ubuntu'
$pgDumpBin   = '/usr/lib/postgresql/17/bin/pg_dump'

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
  - ``wsl_pgdump_missing`` … WSL Ubuntu側に postgresql-client-17 が無い/壊れている。
    ``wsl -d Ubuntu -- /usr/lib/postgresql/17/bin/pg_dump --version`` で手動確認する
  - ``credentials_failed`` … ``npx supabase db dump --linked --dry-run`` 自体が失敗。CLIログイン
    セッションの失効(``npx supabase login``)、ネットワーク、Supabase側の障害を疑う
  - ``timeout`` … ``npx supabase db dump --linked --dry-run`` が応答なしで打ち切られた(具体的な
    秒数・どちらの段階(プロセス終了/出力読み取り)で止まったかは上の「検出された異常」を見る)。
    ``%LOCALAPPDATA%\npm-cache\_logs\`` の最新debugログに「Ok to proceed」等のインストール確認
    プロンプト待ちの痕跡が無いかをまず確認する(2026-09-09に実際にこれが原因だった。supabase
    パッケージが monocore の依存に無いため npx が毎回レジストリを引き、新版が出るたびに
    インストール確認が挟まる)。無ければCLIログインセッションの失効
    (``npx supabase login``で手動確認)を疑う
  - ``dryrun_spawn_failed`` … ``npx supabase db dump --linked --dry-run`` のプロセス起動自体が
    失敗。cmd.exe/npxが見つからない、権限の問題などを疑う
  - ``dump_failed`` … pg_dump自体の失敗。バージョン不一致・接続エラーなどログ本文を見る
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

# ---------------------------------------------------------------
# 1. WSL側にpg_dump 17があるか確認(無ければ導入を試みる)
# ---------------------------------------------------------------
function Test-PgDump17 {
    & wsl.exe -d $wslDistro -- test -x $pgDumpBin
    return ($LASTEXITCODE -eq 0)
}

if (-not (Test-PgDump17)) {
    Write-Log 'WSL側にpg_dump 17が無い。PGDGリポジトリから導入を試みる'
    & wsl.exe -d $wslDistro -- bash -c 'sudo install -d /usr/share/postgresql-common/pgdg && sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list && sudo apt-get update -qq && sudo apt-get install -y -qq postgresql-client-17' *> $null

    if (-not (Test-PgDump17)) {
        $reason = 'wsl_pgdump_missing'
        $problems += 'WSL(Ubuntu)にpostgresql-client-17を自動導入できなかった'
        Write-Log ('異常: ' + $problems[-1])
        Write-Status $false
        Add-QueueFailureTask
        Write-Log ("===== monocore db backup end {0} exit=1 (wsl pg_dump missing) =====" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
        exit 1
    }
    Write-Log 'pg_dump 17の導入完了'
}

# ---------------------------------------------------------------
# 2. 本番の接続情報を解決(npx supabase db dump --linked --dry-run。Dockerは使わない)
#
# タイムアウト付きで実行する(2026-09-09追加)。単純な `& npx ... | Out-String` には
# タイムアウトが無く、2026-09-09朝の枠でこの呼び出しが3時間以上ハングした実測がある。
#
# ■ 根本原因(npm debugログ %LOCALAPPDATA%\npm-cache\_logs\ から特定できた)
#   supabase は monocore の package.json / node_modules\.bin に無く、`npx supabase` は毎回
#   レジストリを引く。新版が出てローカルキャッシュが古くなると、npxが「インストールしてよいか」
#   の確認を対話コンソール(TTY)へ出そうとする(libnpmexec の no-tty 判定は
#   process.stdin.isTTY を見るだけで、CI/無人フラグは自動では立たない)。無人環境では誰も
#   応答できず無期限に固まる。**`--yes` でこのプロンプト自体を無効化するのが本丸の対策**
#   (標準入力を閉じるだけでも noTTY() 判定で暗黙に回避されるが、暗黙の副作用に頼らない)。
#
# ■ `npx`は.cmdファイルなので `[Diagnostics.Process]::Start` に直接渡せず(実測: FileNotFound)、
#   `cmd.exe /c` 経由で起動する。`.Arguments`(単一文字列)を使う — `.ArgumentList` は
#   Windows PowerShell 5.1 に無く、taskbox READMEが5.1での手動実行を明示的に想定しているため
#   (今回の引数はどれもスペースを含まないので単純結合で安全)。
#
# ■ タイムアウトは2箇所ある
#   (a) プロセスの終了(WaitForExit)。
#   (b) 標準出力/エラーの読み切り(ReadToEndAsync)。**(a)だけでは不十分** — cmd.exeが終わっても、
#       npxが生成した孫プロセスが標準出力のパイプハンドルを握ったまま残ると、出力の読み取りは
#       そのハンドルが閉じるまで無期限に待つ(実測で再現・確認)。放置すると今回直したのと
#       同じ形で無期限ハングが再現するため、こちらにも上限を設ける(2026-09-09レビューで発覚)。
#
# ■ taskkillは `/T` でプロセスツリーごと終了を試みる。**(a)のタイムアウト(cmd.exeがまだ
#   生きている)では、孫プロセスまで含めて確実に終了することを実測済み。(b)のタイムアウト
#   (cmd.exeは既に終了、孫だけ残っている)では、対象PID(cmd.exeのもの)が既に存在しないため
#   taskkillは失敗し、孫プロセスは終了できないことも実測で確認した。** その場合でも
#   このスクリプト自体は確実にexitするので、無人パイプライン全体が無期限にブロックされる
#   (今回のインシデントと同じ形)事態は防げる — taskkillの失敗はログに残るだけで処理は続行する。
#   孫プロセスの確実な後始末にはジョブオブジェクト(Win32 API)が要るが、そこまではやっていない。
# ---------------------------------------------------------------
$dryRunTimeoutSeconds = 120  # 通常は数十秒未満で終わる工程(実測: CLIフルインストールでも
                              # 約11秒)。無人パイプラインを何時間も塞がないための上限
$dryRunReadTimeoutSeconds = 15  # プロセス終了後、標準出力/エラーの読み切りに許す追加の猶予

function Complete-DryRunFailure([string]$ReasonCode, [string]$Message, [int]$ProcId) {
    if ($ProcId -gt 0) {
        try {
            & taskkill /T /F /PID $ProcId 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) { Write-Log ("taskkillが exit={0} で終わった(プロセスが既に終了している可能性)" -f $LASTEXITCODE) }
        } catch { Write-Log ('taskkillの実行に失敗: ' + $_.Exception.Message) }
    }
    $script:reason = $ReasonCode
    $script:problems += $Message
    Write-Log ('異常: ' + $Message)
    Write-Status $false
    Add-QueueFailureTask
    Write-Log ("===== monocore db backup end {0} exit=1 ({1}) =====" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $ReasonCode)
    exit 1
}

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "$env:ComSpec"
$psi.Arguments = '/c npx --yes supabase db dump --linked --dry-run'
$psi.WorkingDirectory = $repoRoot
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.RedirectStandardInput = $true
$psi.CreateNoWindow = $true

try {
    $dryRunProc = [System.Diagnostics.Process]::Start($psi)
} catch {
    Complete-DryRunFailure 'dryrun_spawn_failed' `
        ('npx supabase db dump --linked --dry-run の起動に失敗: ' + $_.Exception.Message) 0
}
$dryRunProc.StandardInput.Close()
$dryRunStdoutTask = $dryRunProc.StandardOutput.ReadToEndAsync()
$dryRunStderrTask = $dryRunProc.StandardError.ReadToEndAsync()
$dryRunExited = $dryRunProc.WaitForExit($dryRunTimeoutSeconds * 1000)

if (-not $dryRunExited) {
    Complete-DryRunFailure 'timeout' `
        ("npx supabase db dump --linked --dry-run が{0}秒応答なしのため打ち切った" -f $dryRunTimeoutSeconds) `
        $dryRunProc.Id
}

# プロセス自体は終わっていても、孫プロセスが標準出力ハンドルを握ったまま残っていると
# ここが無期限に返らない(冒頭のコメント参照)。
if (-not [System.Threading.Tasks.Task]::WaitAll(@($dryRunStdoutTask, $dryRunStderrTask), $dryRunReadTimeoutSeconds * 1000)) {
    Complete-DryRunFailure 'timeout' `
        ("npx supabase db dump --linked --dry-run の出力読み取りが{0}秒応答なしのため打ち切った(プロセス自体は終了済み)" -f $dryRunReadTimeoutSeconds) `
        $dryRunProc.Id
}
$dryRunOut = $dryRunStdoutTask.Result + "`n" + $dryRunStderrTask.Result

function Get-DryRunVar([string]$name, [string]$text) {
    $m = [regex]::Match($text, "export $name=`"([^`"]+)`"")
    if ($m.Success) { return $m.Groups[1].Value }
    return $null
}

$pgHost = Get-DryRunVar 'PGHOST' $dryRunOut
$pgPort = Get-DryRunVar 'PGPORT' $dryRunOut
$pgUser = Get-DryRunVar 'PGUSER' $dryRunOut
$pgPassword = Get-DryRunVar 'PGPASSWORD' $dryRunOut
$pgDatabase = Get-DryRunVar 'PGDATABASE' $dryRunOut

if (-not $pgHost -or -not $pgPort -or -not $pgUser -or -not $pgPassword -or -not $pgDatabase) {
    $reason = 'credentials_failed'
    $problems += 'npx supabase db dump --linked --dry-run から接続情報を解決できなかった'
    Write-Log ('異常: ' + $problems[-1])
    Write-Status $false
    Add-QueueFailureTask
    Write-Log ("===== monocore db backup end {0} exit=1 (credentials failed) =====" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
    exit 1
}
Write-Log ("接続情報を解決: host=${pgHost} port=${pgPort} user=${pgUser} db=${pgDatabase}")

# ---------------------------------------------------------------
# 3. ダンプ取得(スキーマ + データ、WSL側のpg_dump 17を直接実行)
#    テーブル名を一切ハードコードしない — その時点の実スキーマをそのまま読む。
# ---------------------------------------------------------------
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$runDir = Join-Path $backupRoot $ts
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

$schemaPath = Join-Path $runDir 'schema.sql'
$dataPath = Join-Path $runDir 'data.sql'

$env:PGHOST = $pgHost
$env:PGPORT = $pgPort
$env:PGUSER = $pgUser
$env:PGPASSWORD = $pgPassword
$env:PGDATABASE = $pgDatabase
$env:WSLENV = 'PGHOST:PGPORT:PGUSER:PGPASSWORD:PGDATABASE'

try {
    Write-Log 'スキーマダンプ開始(WSL pg_dump 17)'
    $schemaCmd = "$pgDumpBin --host=`"`$PGHOST`" --port=`"`$PGPORT`" --username=`"`$PGUSER`" --dbname=`"`$PGDATABASE`" --role=postgres --schema-only --no-owner --no-privileges"
    & wsl.exe -d $wslDistro -- bash -c $schemaCmd 2>$($schemaPath + '.err') 1>$schemaPath
    $schemaExit = $LASTEXITCODE
    if ($schemaExit -ne 0) {
        $errText = if (Test-Path ($schemaPath + '.err')) { Get-Content ($schemaPath + '.err') -Raw } else { '' }
        $problems += "スキーマダンプが exit=${schemaExit}: ${errText}"
    }

    Write-Log 'データダンプ開始(WSL pg_dump 17)'
    $dataCmd = "$pgDumpBin --host=`"`$PGHOST`" --port=`"`$PGPORT`" --username=`"`$PGUSER`" --dbname=`"`$PGDATABASE`" --role=postgres --data-only"
    & wsl.exe -d $wslDistro -- bash -c $dataCmd 2>$($dataPath + '.err') 1>$dataPath
    $dataExit = $LASTEXITCODE
    if ($dataExit -ne 0) {
        $errText = if (Test-Path ($dataPath + '.err')) { Get-Content ($dataPath + '.err') -Raw } else { '' }
        $problems += "データダンプが exit=${dataExit}: ${errText}"
    }
} finally {
    Remove-Item Env:\PGHOST, Env:\PGPORT, Env:\PGUSER, Env:\PGPASSWORD, Env:\PGDATABASE, Env:\WSLENV -ErrorAction SilentlyContinue
    Remove-Item ($schemaPath + '.err'), ($dataPath + '.err') -ErrorAction SilentlyContinue
}

if (Test-Path $schemaPath) { $schemaBytes = (Get-Item $schemaPath).Length }
if (Test-Path $dataPath) { $dataBytes = (Get-Item $dataPath).Length }

if ($schemaBytes -le 64) { $problems += "schema.sqlが小さすぎる(${schemaBytes} bytes)" }
if ($dataBytes -le 64) { $problems += "data.sqlが小さすぎる(${dataBytes} bytes)" }

if ($problems.Count -gt 0) {
    if (-not $reason) { $reason = 'dump_failed' }
    foreach ($p in $problems) { Write-Log ('異常: ' + $p) }
    Write-Status $false
    Add-QueueFailureTask
    Write-Log ("===== monocore db backup end {0} exit=1 (dump failed) =====" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
    exit 1
}

Write-Log ("ダンプ成功: schema=${schemaBytes} bytes, data=${dataBytes} bytes, dir=${runDir}")

# ---------------------------------------------------------------
# 4. 保持期間を超えた古い定期バックアップを削除(既定30日)
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
