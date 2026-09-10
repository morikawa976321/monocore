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
  - ``wsl_unresponsive`` … ``wsl.exe`` 自体が既定の秒数(上の「検出された異常」参照)返ってこない、
    または起動できなかった。WSLの仮想マシンが起動途中/前回のクラッシュ残骸で固まっている疑い。
    ``wsl -l -v`` で状態を見て、必要なら ``wsl --shutdown`` してから手動で1回起動する
  - ``credentials_failed`` … ``npx supabase db dump --linked --dry-run`` 自体が失敗。CLIログイン
    セッションの失効(``npx supabase login``)、ネットワーク、Supabase側の障害を疑う
  - ``timeout`` … ``npx supabase db dump --linked --dry-run`` のプロセス自体が既定の秒数
    (上の「検出された異常」参照)応答なしのため打ち切られた。
    ``%LOCALAPPDATA%\npm-cache\_logs\`` の最新debugログに「Ok to proceed」等のインストール確認
    プロンプト待ちの痕跡が無いかをまず確認する(2026-09-09に実際にこれが原因だった。supabase
    パッケージが monocore の依存に無いため npx が毎回レジストリを引き、新版が出るたびに
    インストール確認が挟まる。現在は ``--yes`` で無効化済みなので、再発したら別原因を疑う)。
    無ければCLIログインセッションの失効(``npx supabase login``で手動確認)を疑う
  - ``dryrun_spawn_failed`` … ``npx supabase db dump --linked --dry-run`` のプロセス起動自体が
    失敗。cmd.exe/npxが見つからない、権限の問題などを疑う
  - ``dryrun_io_setup_failed`` … プロセスは起動できたが直後の標準入出力ハンドル操作が失敗。
    まれなOSレベルの異常を疑う
  - ``dryrun_read_timeout`` … プロセス自体は正常終了したが、標準出力/エラーの読み切りが
    既定の秒数応答なしで打ち切られた。孫プロセス(node.exe等)がパイプハンドルを握ったまま
    生き残っている可能性がある。``Get-Process node`` で古いnode.exeが残っていないか確認する
    (自動でのkillは意図的に行っていない — 終了済みPIDの再利用による誤爆を避けるため)
  - ``dryrun_read_failed`` … 標準出力/エラーの読み取り自体が例外で失敗。まれなOSレベルの
    異常を疑う
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

# 失敗経路の集約(2026-09-09追加。2026-09-10に汎用名へ改め、定義位置を1節の前へ移した —
# WSL関連の失敗もこの経路へ合流させるため。中身は変えていない)。
# 理由コードを1つ取り、Write-Status(backup-status.json) → Add-QueueFailureTask(queueへ調査タスク)
# → exit 1 という**このスクリプト唯一の異常終了経路**を通す。**drain報告板には出さない**
# (2026-09-05のユーザー決定。engine [[monocore-db-backup-result-stays-off-the-board]])。
function Complete-BackupFailure([string]$ReasonCode, [string]$Message, [int]$ProcId) {
    # $ProcId は「taskkillに意味がある」呼び出し元だけが正の値を渡す(下の2節のコメント参照)。
    # 0 なら taskkill 自体を試みない(実害は無いが呼んでも何も終了できない段階のため)。
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

# Windowsのコマンドライン規則に従って引数配列を1本の文字列へ組み立てる。空白か " を含む引数だけを
# 引用符で囲み、" の直前と末尾の逆スラッシュ列は倍にする。`wsl.exe -- bash -c '<" を含むスクリプト>'`
# がこの規則で正しく渡ることを実測で確認済み(直接 `& wsl.exe ...` と同一の出力になる)。
function ConvertTo-BoundedArgumentLine {
    param([string[]]$Arguments = @())
    $q  = [string][char]34   # "
    $bs = [string][char]92   # 逆スラッシュ。ソース中に直接書くとエスケープの読み違いを招くので定数化する
    $parts = @()
    foreach ($a in @($Arguments)) {
        $x = [string]$a
        if ($x.Length -eq 0) { $parts += ($q + $q); continue }
        if (-not ($x.Contains(' ') -or $x.Contains([string][char]9) -or $x.Contains($q))) {
            $parts += $x
            continue
        }
        $sb = New-Object System.Text.StringBuilder
        [void]$sb.Append($q)
        $slashes = 0
        foreach ($ch in $x.ToCharArray()) {
            if ($ch -eq [char]92) { $slashes++; [void]$sb.Append($ch); continue }
            if ($ch -eq [char]34) {
                [void]$sb.Append($bs * $slashes)
                [void]$sb.Append($bs + $q)
            } else {
                [void]$sb.Append($ch)
            }
            $slashes = 0
        }
        [void]$sb.Append($bs * $slashes)
        [void]$sb.Append($q)
        $parts += $sb.ToString()
    }
    return ($parts -join ' ')
}

# ---------------------------------------------------------------
# 外部プロセスをタイムアウト付きで実行する(2026-09-10追加)
#
# 下の「2. 本番の接続情報を解決」節にある dry-run のインライン実装と同じ設計。あちらは
# 2026-09-09のインシデント対応で書いた**動作実績のあるコード**なので、共通化のために
# 書き換えることはしない(このスクリプトは無人バックアップの本体で、書き換えの利得より
# 退行のほうが高くつく)。taskbox 側に同型の実装(lib/proc.ps1)があるが**dot-sourceしない** —
# 別リポジトリのファイルへ実行時依存すると、taskbox が無い環境でこのスクリプトが動かなくなる。
#
# 戻り値: @{ ok; timedOut; exitCode; stdout; stderr; output; failure; message }
#   failure は $null / spawn_failed / io_setup_failed / timeout / read_timeout / read_failed /
#   internal_error。**例外は投げない** — 呼び出し元が Complete-BackupFailure へ合流させる。
function Invoke-BoundedProcess {
    param(
        [Parameter(Mandatory)][string]$FileName,
        [string[]]$Arguments = @(),
        [int]$TimeoutSeconds = 120,
        [int]$ReadTimeoutSeconds = 15,
        [string]$Label = '外部コマンド'
    )
    $r = @{ ok = $false; timedOut = $false; exitCode = $null; stdout = ''; stderr = ''
            output = ''; failure = $null; message = $null }
    $proc = $null
    $prevEap = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Stop'
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = $FileName
        # .ArgumentList は Windows PowerShell 5.1 に無いので単一文字列で渡す。
        $psi.Arguments = (ConvertTo-BoundedArgumentLine $Arguments)
        $psi.UseShellExecute = $false
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.RedirectStandardInput = $true
        $psi.CreateNoWindow = $true
        try {
            $proc = [System.Diagnostics.Process]::Start($psi)
        } catch {
            $r.failure = 'spawn_failed'
            $r.message = ("{0} の起動に失敗: {1}" -f $Label, $_.Exception.Message)
            return $r
        }
        try {
            # 標準入力を閉じる。sudo のパスワード待ち等で無人環境が固まるのを防ぐ。
            $proc.StandardInput.Close()
            $outTask = $proc.StandardOutput.ReadToEndAsync()
            $errTask = $proc.StandardError.ReadToEndAsync()
        } catch {
            $r.failure = 'io_setup_failed'
            $r.message = ("{0} の入出力設定に失敗: {1}" -f $Label, $_.Exception.Message)
            try { & taskkill /T /F /PID $proc.Id 2>&1 | Out-Null } catch {}
            return $r
        }
        if (-not $proc.WaitForExit($TimeoutSeconds * 1000)) {
            $r.timedOut = $true
            $r.failure = 'timeout'
            $r.message = ("{0} が{1}秒応答なしのため打ち切った" -f $Label, $TimeoutSeconds)
            # この時点だけはプロセスが確実に生きているとわかっている。なお wsl.exe を殺しても
            # WSL側(Linux)のプロセスは残りうる。ここで保証するのは「呼び出し元が有限時間で
            # 戻ること」だけで、WSL内の後始末はしない。
            try { & taskkill /T /F /PID $proc.Id 2>&1 | Out-Null } catch {}
            return $r
        }
        try {
            $readOk = [System.Threading.Tasks.Task]::WaitAll(@($outTask, $errTask), $ReadTimeoutSeconds * 1000)
        } catch {
            $r.failure = 'read_failed'
            $r.message = ("{0} の出力読み取りが失敗: {1}" -f $Label, $_.Exception.Message)
            return $r
        }
        if (-not $readOk) {
            $r.failure = 'read_timeout'
            $r.message = ("{0} の出力読み取りが{1}秒応答なしのため打ち切った(プロセス自体は終了済み)" -f $Label, $ReadTimeoutSeconds)
            return $r
        }
        $r.exitCode = $proc.ExitCode
        $r.stdout = [string]$outTask.Result
        $r.stderr = [string]$errTask.Result
        # wsl.exe 自身の診断メッセージはUTF-16LEで出るため既定のデコードではNUL混じりになる。
        # ログに載せる用途だけなのでNULを落として読める形にする(WSL内プロセスの出力は素通し)。
        $r.output = (($r.stdout + "`n" + $r.stderr) -replace "`0", '').Trim()
        $r.ok = ($r.exitCode -eq 0)
        return $r
    } catch {
        $r.failure = 'internal_error'
        $r.message = ("{0} の実行中に予期しない例外: {1}" -f $Label, $_.Exception.Message)
        return $r
    } finally {
        $ErrorActionPreference = $prevEap
        if ($proc) { try { $proc.Dispose() } catch {} }
    }
}

# ---------------------------------------------------------------
# 1. WSL側にpg_dump 17があるか確認(無ければ導入を試みる)
# ---------------------------------------------------------------
# wsl.exe の呼び出しにタイムアウトを掛ける(2026-09-10追加)。WSLの仮想マシン自体が応答しない
# (初回起動・前回のクラッシュ残骸等)と `wsl.exe` そのものが返らず、drain全体が無期限に止まる。
# 値はいずれも実測に基づかない暫定の上限。
$wslProbeTimeoutSeconds   = 180  # VMのコールドスタートを含みうる軽量コマンド
$wslInstallTimeoutSeconds = 900  # apt-get update + install。ネットワーク依存で重い

function Test-PgDump17 {
    return (Invoke-BoundedProcess -FileName 'wsl.exe' `
                -Arguments @('-d', $wslDistro, '--', 'test', '-x', $pgDumpBin) `
                -TimeoutSeconds $wslProbeTimeoutSeconds -Label 'WSLのpg_dump 17の有無確認')
}

# 「wsl.exeが返ってこない/起動できない」と「pg_dumpが無い(exit≠0)」は別物として扱う。前者で
# 導入へ進んでも、応答しないWSLに対して導入の上限ぶんだけ余計に待つだけで結論は変わらない。
$pgDumpProbe = Test-PgDump17
if ($pgDumpProbe.failure) {
    Complete-BackupFailure 'wsl_unresponsive' ('WSLが応答しないため確認できなかった: ' + $pgDumpProbe.message) 0
}

if (-not $pgDumpProbe.ok) {
    Write-Log 'WSL側にpg_dump 17が無い。PGDGリポジトリから導入を試みる'
    # 内側にも上限を置く(2026-09-10): curl は --connect-timeout/--max-time、apt は
    # DEBIAN_FRONTEND=noninteractive。外側の $wslInstallTimeoutSeconds だけでも無期限化は
    # 防げるが、内側にもあると「どの段で詰まったか」がWSL側の終了コードとして残る。
    # sudo -n はパスワードを要求する構成のときに待たず失敗させるため(無人実行では誰も
    # 入力できないので、待っても結論は同じ)。
    $pgdgInstallScript = 'sudo -n install -d /usr/share/postgresql-common/pgdg && sudo -n curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail --connect-timeout 20 --max-time 120 https://www.postgresql.org/media/keys/ACCC4CF8.asc && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | sudo -n tee /etc/apt/sources.list.d/pgdg.list && sudo -n env DEBIAN_FRONTEND=noninteractive apt-get -o Acquire::Retries=1 -o Acquire::http::Timeout=30 update -qq && sudo -n env DEBIAN_FRONTEND=noninteractive apt-get -o Acquire::Retries=1 -o Acquire::http::Timeout=30 install -y -qq postgresql-client-17'
    $install = Invoke-BoundedProcess -FileName 'wsl.exe' `
                    -Arguments @('-d', $wslDistro, '--', 'bash', '-c', $pgdgInstallScript) `
                    -TimeoutSeconds $wslInstallTimeoutSeconds -Label 'postgresql-client-17の自動導入'
    if ($install.failure) {
        Write-Log ('自動導入を完了できなかった: ' + $install.message)
    } elseif (-not $install.ok) {
        Write-Log ("自動導入が exit={0} で終わった: {1}" -f $install.exitCode, $install.output)
    }

    $pgDumpProbe = Test-PgDump17
    if ($pgDumpProbe.failure) {
        Complete-BackupFailure 'wsl_unresponsive' ('WSLが応答しないため確認できなかった: ' + $pgDumpProbe.message) 0
    }
    if (-not $pgDumpProbe.ok) {
        Complete-BackupFailure 'wsl_pgdump_missing' 'WSL(Ubuntu)にpostgresql-client-17を自動導入できなかった' 0
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
#   代償: supabaseがどこにも固定されていないため、`--yes` は「レジストリの最新版を無人で
#   自動導入することへの常時同意」でもある。CLIの破壊的変更で `db dump --dry-run` の出力形式が
#   変われば下の `Get-DryRunVar` が黙って外れ、`credentials_failed` と誤報告される。
#   devDependenciesへの追加やバージョン固定(`npx supabase@<major>`)による恒久対策は
#   今回は見送った(このインシデントの直接原因ではないため)。
#
# ■ `npx`は.cmdファイルなので `[Diagnostics.Process]::Start` に直接渡せず(実測: FileNotFound)、
#   `cmd.exe /c` 経由で起動する。`.Arguments`(単一文字列)を使う — `.ArgumentList` は
#   Windows PowerShell 5.1に無く(実測)、taskbox READMEが5.1での手動実行を明示的に
#   想定しているため避けた(今回の引数はどれもスペースを含まないので単純結合で安全)。
#
# ■ タイムアウト・失敗経路は複数箇所あり、`Complete-BackupFailure` に集約している
#   (a) プロセス起動自体の失敗(`dryrun_spawn_failed`、taskkill無し=起動していないので不要)。
#   (b) 標準入出力ハンドルの取得に失敗(`dryrun_io_setup_failed`)。プロセス自体は起動できて
#       いる(高確率で生存)ので、taskkillを試みる。
#   (c) プロセスの終了待ち(WaitForExit)がタイムアウト(`timeout`)。**この時点だけは
#       プロセスが確実に生きているとわかっている**ので、taskkillでプロセスツリーごと
#       終了させる(実測で孫プロセスまで含めて確実に終了することを確認済み)。
#   (d) 標準出力/エラーの読み切り(ReadToEndAsync)が失敗(`dryrun_read_failed`)または
#       タイムアウト(`dryrun_read_timeout`)。**(c)だけでは不十分** — cmd.exeが終わっても、
#       npxが生成した孫プロセスが標準出力のパイプハンドルを握ったまま残ると、出力の読み取りは
#       そのハンドルが閉じるまで無期限に待つ(実測で再現・確認)。放置すると今回直したのと
#       同じ形で無期限ハングが再現するため、こちらにも上限を設けた(2026-09-09レビューで発覚)。
#       **この段階ではtaskkillを呼んでも孫には届かない** — WaitForExitが既にtrueを返している
#       =cmd.exeは既に終了しており、`taskkill /T /PID <cmd.exeのPID>`は死んだ親からは
#       子孫を辿れず「not found」で無害に失敗するだけ(2026-09-09の当初レビューでは「終了済み
#       PIDが数秒スケールで再利用され無関係なプロセスを誤爆する」と結論したが、これは誤りだった
#       — `Process`オブジェクト(`$dryRunProc`)がスクリプトスコープでハンドルを保持している間、
#       WindowsはそのPIDを再利用しないことを2000回のプロセス生成で実測・再確認した)。誤爆は
#       起きないが、taskkillを呼んでも孫プロセスの終了には効果が無いため、無駄な呼び出しと
#       ログを避けるだけの理由で呼んでいない。孫プロセスの後始末は諦め、「無人パイプラインを
#       無期限に塞がない」ことだけを優先する(ジョブオブジェクト(Win32 API)を使えば
#       確実な後始末も可能だが、今回は見送った)。
#   `ReadToEndAsync`が例外(faulted task)を投げるケースは、`$ErrorActionPreference='Continue'`
#   を自スコープに置いていても呼び出し元(taskbox `Invoke-BackupJob`)まで貫通し、
#   backup-status.jsonの更新もqueueタスクの積み込みも両方スキップされる実害を確認したため、
#   明示的にtry/catchで拾って同じ失敗経路へ合流させている(2026-09-09レビューで発覚)。
# ---------------------------------------------------------------
$dryRunTimeoutSeconds = 120  # 通常は数十秒未満で終わる工程(実測: CLIフルインストールでも
                              # 約11秒)。無人パイプラインを何時間も塞がないための上限
$dryRunReadTimeoutSeconds = 15  # プロセス終了後、標準出力/エラーの読み切りに許す追加の猶予

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
    Complete-BackupFailure 'dryrun_spawn_failed' `
        ('npx supabase db dump --linked --dry-run の起動に失敗: ' + $_.Exception.Message) 0
}

try {
    $dryRunProc.StandardInput.Close()
    $dryRunStdoutTask = $dryRunProc.StandardOutput.ReadToEndAsync()
    $dryRunStderrTask = $dryRunProc.StandardError.ReadToEndAsync()
} catch {
    Complete-BackupFailure 'dryrun_io_setup_failed' `
        ('npx supabase db dump --linked --dry-run の入出力設定に失敗: ' + $_.Exception.Message) `
        $dryRunProc.Id
}

$dryRunExited = $dryRunProc.WaitForExit($dryRunTimeoutSeconds * 1000)
if (-not $dryRunExited) {
    Complete-BackupFailure 'timeout' `
        ("npx supabase db dump --linked --dry-run が{0}秒応答なしのため打ち切った" -f $dryRunTimeoutSeconds) `
        $dryRunProc.Id
}

try {
    $dryRunReadOk = [System.Threading.Tasks.Task]::WaitAll(@($dryRunStdoutTask, $dryRunStderrTask), $dryRunReadTimeoutSeconds * 1000)
} catch {
    Complete-BackupFailure 'dryrun_read_failed' `
        ('npx supabase db dump --linked --dry-run の出力読み取りが失敗: ' + $_.Exception.Message) 0
}
if (-not $dryRunReadOk) {
    Complete-BackupFailure 'dryrun_read_timeout' `
        ("npx supabase db dump --linked --dry-run の出力読み取りが{0}秒応答なしのため打ち切った(プロセス自体は終了済み)" -f $dryRunReadTimeoutSeconds) `
        0
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
