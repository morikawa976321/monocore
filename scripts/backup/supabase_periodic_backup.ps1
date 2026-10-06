# monocore 本番Supabase — 定期バックアップ(スキーマ+データ)
#
# 起動: taskbox drain.ps1 が毎run終了時に呼ぶ(Invoke-MonocoreDbBackup)が、取るのは 00:00 と 12:00 の
#       枠ごとに1回(2026-10-07〜。判定は taskbox の lib/backup.ps1 の Test-DbBackupDue)。判断が要らない
#       機械工程なので claude は起動しない。
#       手動: pwsh -ExecutionPolicy Bypass -File C:\Users\tm976\mf\monocore\scripts\backup\supabase_periodic_backup.ps1
#
# 経緯(2026-08-30): inboxes.contentが空文字列で上書きされ、直近の手動バックアップ
# (backups/manual)が2026-08-11までしか遡れなかった。手動バックアップは「必要なタイミングで
# 取る」運用のため、日常的な取りこぼしを防ぐ定期実行が無かった。
#
# ■ Docker も WSL も使わない設計(2026-09-30、WSL版から書き換え。その前は2026-08-30にDocker版から書き換え)
#   当初(2026-08-30)はDocker経由(npx supabase db dump --linked)で実装したが、同日Docker Desktopが
#   sailor-ingest.sockのバインドに失敗して繰り返しクラッシュする不具合を実地で踏んだ
#   (Windows側の問題で、WSLの完全シャットダウンでも直らなかった)。無人実行のたびに
#   Docker Desktop(GUIアプリ)の起動待ちに依存するのはそれ自体が壊れやすい設計だったため、
#   WSL2(Ubuntu)の postgresql-client-17 で pg_dump を直接実行する方式へ切り替えた。
#   2026-09-30 に Debian 移行計画の Phase 1 で WSL の Ubuntu ディストロを削除した結果、pg_dump が
#   消えて毎時のバックアップが 19:03 の回から失敗した(reason=wsl_pgdump_missing)。
#   Windows には PostgreSQL 17 が入っており(C:\Program Files\PostgreSQL\17、pg_dump 17.11)、
#   pg_dump.exe は GUI も仮想マシンも要らずコマンドラインだけで動く。WSL の起動待ち・ディストロの
#   状態・環境変数の受け渡し(WSLENV)への依存が丸ごと無くなるので、Windowsネイティブの
#   pg_dump.exe を直接実行する方式へ切り替えた。
#
# ■ 資格情報を一切永続化しない(docs/supabase-backup.md の既存方針を踏襲)
#   `npx supabase db dump --linked --dry-run` が接続情報(PGHOST/PGPORT/PGUSER/PGPASSWORD/
#   PGDATABASE)を都度解決する(CLIのログイン済みセッションを使う。dry-runはDockerを使わない
#   ことを実地で確認済み)。取得した値はこのスクリプト内のメモリ上でのみ扱い、ディスク上の
#   どのファイルにも書かない。pg_dump.exe へは子プロセスの環境変数(PGHOST等)として渡すのみで、
#   コマンドラインには載せない。
#
# ■ スキーマ変更に追随するためスクリプトを書き直さない設計
#   pg_dumpはテーブル名を一切ハードコードせず、その時点の実スキーマを丸ごと読む。テーブルの
#   追加・削除・列変更があっても、このスクリプトは無変更で次回から新しいスキーマのダンプを
#   取る。プレーンSQLで保存するのは、pg_restoreが無くても psql -f だけで中身を読める/
#   戻せるようにするため。
#
# ■ pg_dump の前提(自動導入はしない)
#   Windows に PostgreSQL 17 以上のクライアントツール(pg_dump.exe)があること。探索先は
#   <ProgramFiles>\PostgreSQL\<メジャー>\bin\pg_dump.exe で、17以上のうち最大のメジャーを使う。
#   本番がPostgreSQL 17系のため、pg_dumpが古いと `aborting because of server version mismatch` で
#   拒否される(新しい分には問題ない)。見つからなければ pgdump_missing で失敗する(drain 報告板の run カードに error 行で出る)。
#   自動導入は試みない: Windows では導入に管理者権限か対話が要り、無人実行では誰も操作できない。

param(
    # 2026-10-07本人判断で30日から14日へ短縮した(同時に取る回数を毎時から1日2回へ減らした。taskbox/lib/backup.ps1)。
    [int]$RetentionDays = 14
)

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$repoRoot    = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backupRoot  = Join-Path $repoRoot 'backups\auto'
$log         = Join-Path $backupRoot 'backup.log'
$statusPath  = Join-Path $backupRoot 'backup-status.json'
$pgDumpMinMajor = 17   # 本番のPostgreSQLのメジャー。これ未満の pg_dump は version mismatch で拒否される

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

# 失敗経路の集約(2026-09-09追加。2026-09-10に汎用名へ改め、定義位置を1節の前へ移した —
# WSL関連の失敗もこの経路へ合流させるため。中身は変えていない)。
# 理由コードを1つ取り、Write-Status(backup-status.json)
# → exit 1 という**このスクリプト唯一の異常終了経路**を通す。失敗は呼び出し側(taskbox lib/backup.ps1 →
# lib/board.ps1 の New-DbBackupStep)が drain 報告板の run カードに error 行で出す(2026-10-05本人判断)。
# 2026-09-05〜10-05 は板に出さず、ここから taskbox の queue へ調査タスクを積んでいた。
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
    Write-Log ("===== monocore db backup end {0} exit=1 ({1}) =====" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $ReasonCode)
    exit 1
}

# Windowsのコマンドライン規則に従って引数配列を1本の文字列へ組み立てる。空白か " を含む引数だけを
# 引用符で囲み、" の直前と末尾の逆スラッシュ列は倍にする。この規則で、2026-09-30 まで使っていた
# WSL 版の `wsl.exe -- bash -c '<" を含むスクリプト>'` も正しく渡ることを実測で確認していた
# (直接 `& wsl.exe ...` と同一の出力になる)。今は pg_dump.exe と npx にこの規則で引数を渡す。
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
            # 標準入力を閉じる。対話プロンプトで待つ子(npx のインストール確認等)で無人環境が固まるのを防ぐ。
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
            # この時点だけはプロセスが確実に生きているとわかっているので、プロセスツリーごと終了させる
            # (taskkill /T /F)。ここで保証するのは「呼び出し元が有限時間で戻ること」だけ。
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
        # 子の出力にNUL(UTF-16LEの診断メッセージなど)が混じることがあるので落とす。ログに載せる用途だけ。
        # なお pg_dump.exe は日本語ロケールだとエラー文をCP932で出し、ここ(UTF-8として読む)では
        # 文字化けする。そのため呼び出し側(Invoke-PgDump)で LC_MESSAGES=C を設定して英語で出させている。
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
# 1. Windows の pg_dump.exe を探して動作確認する(2026-09-30、WSL版から書き換え)
# ---------------------------------------------------------------
# 外部プロセスはすべてタイムアウト付きで呼ぶ(2026-09-09のハング事故と同じ理由)。
# 値はいずれも実測に基づかない暫定の上限。
$pgDumpProbeTimeoutSeconds = 60    # --version だけ。コールドスタートが遅くても余る
$pgDumpTimeoutSeconds      = 900   # schema / data それぞれ。実測は数秒(data.sql 約2MB)なので桁違いに余る

# 環境変数を設定/削除する。$null なら**本当に削除する**。`[Environment]::SetEnvironmentVariable(名前, $null)` は
# pwsh 7.6 で変数を消さず**空の値で残す**(子プロセスに `PGSSLMODE=` のように渡り、libpq が空の値を設定済みと
# 解釈しうる。実測)。Remove-Item Env:\名前 と `$env:名前 = $null` は正しく消える。
function Set-EnvVar {
    # $Value に [string] を付けてはいけない: PowerShell は $null を空文字へ変換してしまい、削除の分岐に入らない。
    param([string]$Name, $Value)
    if ($null -eq $Value) { Remove-Item -LiteralPath ('Env:\' + $Name) -ErrorAction SilentlyContinue }
    else { Set-Item -LiteralPath ('Env:\' + $Name) -Value $Value }
}

# pg_dump.exe の呼び出し。LC_MESSAGES=C で英語のメッセージを出させる(2026-09-30、独立レビューの指摘)。
# 日本語ロケールの pg_dump.exe はエラー文を CP932 で出し、Invoke-BoundedProcess は UTF-8 として読むので
# 文字化けする。エラー文はログ・backup-status.json・drain 報告板の run カードに載る(本人に届く唯一の経路)ので、
# 読めなければ意味が無い(旧 WSL 版は英語で出ていた)。ダンプ本文(SQL)はメッセージ翻訳の対象ではない
# ので出力は変わらない。呼び出しの間だけ設定し、終わったら元へ戻す(drain と同じプロセスで動くため)。
function Invoke-PgDump {
    param([string]$Bin, [string[]]$Arguments, [int]$TimeoutSeconds, [string]$Label)
    $prev = $env:LC_MESSAGES
    $env:LC_MESSAGES = 'C'
    try {
        return (Invoke-BoundedProcess -FileName $Bin -Arguments $Arguments -TimeoutSeconds $TimeoutSeconds -Label $Label)
    } finally {
        Set-EnvVar 'LC_MESSAGES' $prev
    }
}

# 候補: <ProgramFiles>\PostgreSQL\<メジャー>\bin\pg_dump.exe のうち $pgDumpMinMajor 以上を、新しい順に全部返す。
# 32bit の PowerShell では ProgramFiles が x86 を指すので、64bit 側(ProgramW6432)も探す。
function Find-PgDump {
    $found = @()
    $bases = @($env:ProgramW6432, $env:ProgramFiles, ${env:ProgramFiles(x86)}) | Where-Object { $_ } | Select-Object -Unique
    foreach ($base in $bases) {
        $pg = Join-Path $base 'PostgreSQL'
        if (-not (Test-Path $pg)) { continue }
        foreach ($d in (Get-ChildItem $pg -Directory -ErrorAction SilentlyContinue)) {
            $exe = Join-Path $d.FullName 'bin\pg_dump.exe'
            $major = 0
            if ([int]::TryParse($d.Name, [ref]$major) -and $major -ge $pgDumpMinMajor -and (Test-Path $exe)) {
                $found += [pscustomobject]@{ Major = $major; Path = $exe }
            }
        }
    }
    return @($found | Sort-Object Major -Descending)
}

# 動く最初の候補を採る(最新版のフォルダが壊れていても、次の候補=17へ戻る)。17以上かは、ディレクトリ名
# ではなく --version の実際の出力で確かめる。
$pgDumpBin = $null
$pgDumpVersion = ''
$probeNotes = @()
foreach ($cand in @(Find-PgDump)) {
    $probe = Invoke-PgDump -Bin $cand.Path -Arguments @('--version') -TimeoutSeconds $pgDumpProbeTimeoutSeconds -Label 'pg_dump --version'
    if ($probe.failure -or -not $probe.ok) {
        $why = if ($probe.failure) { $probe.message } else { "exit={0}: {1}" -f $probe.exitCode, $probe.output }
        $probeNotes += ("{0}: {1}" -f $cand.Path, $why)
        continue
    }
    if ($probe.output -match 'pg_dump \(PostgreSQL\) (\d+)' -and [int]$Matches[1] -ge $pgDumpMinMajor) {
        $pgDumpBin = $cand.Path
        $pgDumpVersion = $probe.output
        break
    }
    $probeNotes += ("{0}: バージョンが {1} 未満か読めない: {2}" -f $cand.Path, $pgDumpMinMajor, $probe.output)
}
if (-not $pgDumpBin) {
    $detail = if ($probeNotes.Count -gt 0) { ' — ' + ($probeNotes -join ' / ') } else { '' }
    Complete-BackupFailure 'pgdump_missing' ("PostgreSQL {0} 以上の動く pg_dump.exe が見つからない(探索先: <ProgramFiles>\PostgreSQL\<メジャー>\bin){1}" -f $pgDumpMinMajor, $detail) 0
}
Write-Log ('pg_dump: ' + $pgDumpVersion + ' (' + $pgDumpBin + ')')

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
    Write-Log ("===== monocore db backup end {0} exit=1 (credentials failed) =====" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
    exit 1
}
Write-Log ("接続情報を解決: host=${pgHost} port=${pgPort} user=${pgUser} db=${pgDatabase}")

# ---------------------------------------------------------------
# 3. ダンプ取得(スキーマ + データ、Windowsネイティブの pg_dump.exe を直接実行)
#    テーブル名を一切ハードコードしない — その時点の実スキーマをそのまま読む。
# ---------------------------------------------------------------
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$runDir = Join-Path $backupRoot $ts
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

$schemaPath = Join-Path $runDir 'schema.sql'
$dataPath = Join-Path $runDir 'data.sql'

# 環境の隔離(2026-09-30、独立レビューの指摘): Windows 側や drain のプロセスに PGSSLMODE / PGSERVICE /
# PGOPTIONS / PGPASSFILE などがあると、pg_dump.exe がそれを受け継いでダンプの接続が黙って変わる。
# 旧 WSL 版は WSLENV で渡した5つだけが見えていたので、それと同じにするため、既存の PG* をいったん
# 全部退避して消し、終わったら戻す。
$savedPgEnv = @{}
foreach ($e in @(Get-ChildItem Env: | Where-Object { $_.Name -like 'PG*' })) { $savedPgEnv[$e.Name] = $e.Value }
foreach ($k in @($savedPgEnv.Keys)) { Set-EnvVar $k $null }

$env:PGHOST = $pgHost
$env:PGPORT = $pgPort
$env:PGUSER = $pgUser
$env:PGPASSWORD = $pgPassword
$env:PGDATABASE = $pgDatabase

# 接続先・資格情報は上の環境変数(PGHOST等)で渡し、コマンドラインには載せない。
# 出力は標準出力のリダイレクトではなく --file で書かせる: PowerShell のリダイレクトは
# エンコーディングを掛けうる(Windows PowerShell 5.1 は UTF-16)ので、SQL を壊さないため。
# --encoding=UTF8 は明示(サーバのエンコーディングと同じで、出力は変わらない)。
try {
    Write-Log 'スキーマダンプ開始(pg_dump.exe)'
    $schemaRun = Invoke-PgDump -Bin $pgDumpBin -TimeoutSeconds $pgDumpTimeoutSeconds -Label 'スキーマダンプ' `
        -Arguments @('--role=postgres', '--schema-only', '--no-owner', '--no-privileges', '--encoding=UTF8', ('--file=' + $schemaPath))
    if ($schemaRun.failure) {
        $problems += $schemaRun.message
    } elseif (-not $schemaRun.ok) {
        $problems += "スキーマダンプが exit=$($schemaRun.exitCode): $($schemaRun.output)"
    }

    if ($schemaRun.timedOut) {
        # DB が応答していない可能性が高い。データも同じ上限だけ待つと、最悪 上限の2倍ぶん drain を塞ぐ。
        $problems += 'データダンプは、スキーマダンプがタイムアウトしたため省略した'
    } else {
        Write-Log 'データダンプ開始(pg_dump.exe)'
        $dataRun = Invoke-PgDump -Bin $pgDumpBin -TimeoutSeconds $pgDumpTimeoutSeconds -Label 'データダンプ' `
            -Arguments @('--role=postgres', '--data-only', '--encoding=UTF8', ('--file=' + $dataPath))
        if ($dataRun.failure) {
            $problems += $dataRun.message
        } elseif (-not $dataRun.ok) {
            $problems += "データダンプが exit=$($dataRun.exitCode): $($dataRun.output)"
        }
    }
} finally {
    foreach ($k in 'PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE') { Set-EnvVar $k $null }
    foreach ($k in $savedPgEnv.Keys) { Set-EnvVar $k $savedPgEnv[$k] }
}

if (Test-Path $schemaPath) { $schemaBytes = (Get-Item $schemaPath).Length }
if (Test-Path $dataPath) { $dataBytes = (Get-Item $dataPath).Length }

if ($schemaBytes -le 64) { $problems += "schema.sqlが小さすぎる(${schemaBytes} bytes)" }
if ($dataBytes -le 64) { $problems += "data.sqlが小さすぎる(${dataBytes} bytes)" }

if ($problems.Count -gt 0) {
    if (-not $reason) { $reason = 'dump_failed' }
    foreach ($p in $problems) { Write-Log ('異常: ' + $p) }
    # 失敗した回のディレクトリを、正常な回と見分けられるようにする(タイムアウトで打ち切られた不完全な
    # ダンプが残りうる。backup-status.json は最新の1回分しか持たない)。消さない: 破損の証拠になる。
    # ディレクトリ名は変えない: 保持期間の削除が名前(yyyyMMdd-HHmmss)で判定するため。
    try {
        $mark = @("reason=$reason", ('ran_at=' + (Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK'))) + @($problems | ForEach-Object { "- $_" })
        [System.IO.File]::WriteAllText((Join-Path $runDir 'FAILED.txt'), (($mark -join "`r`n") + "`r`n"), $script:Utf8NoBom)
    } catch {
        Write-Log ('FAILED.txt を書けなかった: ' + $_.Exception.Message)
    }
    Write-Status $false
    Write-Log ("===== monocore db backup end {0} exit=1 (dump failed) =====" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
    exit 1
}

Write-Log ("ダンプ成功: schema=${schemaBytes} bytes, data=${dataBytes} bytes, dir=${runDir}")

# ---------------------------------------------------------------
# 4. 保持期間を超えた古い定期バックアップを削除(既定14日。2026-10-07に30日から短縮)
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
