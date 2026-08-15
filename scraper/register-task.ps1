# scraper を毎時実行するタスクを登録する。
#
# ■ 実行方法
#     pwsh -NoProfile -ExecutionPolicy Bypass -File .\register-task.ps1
#     pwsh -NoProfile -ExecutionPolicy Bypass -File .\register-task.ps1 -Unregister
#
# ■ このファイルは UTF-8 BOM 付きで保存すること
#     Windows PowerShell 5.1 は BOM の無い .ps1 を ANSI(cp932) として読むため、
#     日本語コメントが文字化けしてパースエラーになる（2026-08-14 に実発）。
#
# ■ pythonw.exe を直接 Execute する理由
#     powershell.exe をラッパーに挟むと毎時コンソールウィンドウが出る。pythonw.exe は
#     GUI サブシステムのバイナリなのでウィンドウを持たない（news_scraping で確立した
#     方式をそのまま踏襲する）。副次的に、タスクスケジューラが実プロセスを直接管理する
#     ので、停止時にラッパーだけ殺して子を孤児化する問題も起きない。
#
# ■ 常駐ではなくワンショット
#     旧 scheduler_runner.py は常駐して1時間ごとに自分で起こしていたが、落ちても誰も
#     気づかず再起動でしか復旧しなかった。毎時トリガーのワンショットなら、失敗した回は
#     次の枠で自然に回復する。
param(
    [string]$TaskName = "Monocore_NewsScraper",
    [switch]$Unregister
)

$ErrorActionPreference = "Stop"

$WorkDir = $PSScriptRoot
$PythonWExe = Join-Path $WorkDir ".venv\Scripts\pythonw.exe"
$Script = Join-Path $WorkDir "run_once.py"
$CurrentUser = "$env:USERDOMAIN\$env:USERNAME"

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "既存のタスクを解除しました: $TaskName"
}
if ($Unregister) {
    return
}

if (-not (Test-Path $PythonWExe)) {
    throw "pythonw.exe が見つかりません: $PythonWExe (先に .venv を作成してください)"
}

$action = New-ScheduledTaskAction -Execute $PythonWExe -Argument "`"$Script`"" -WorkingDirectory $WorkDir

# ログオン時に1回 + 0時起点で1時間ごと。RepetitionDuration を省くと無期限になる。
$triggers = @(
    (New-ScheduledTaskTrigger -AtLogOn -User $CurrentUser),
    (New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Hours 1))
)

# MultipleInstances IgnoreNew: 前の回が長引いても二重に走らせない。
# ExecutionTimeLimit 30分: OGP取得が詰まった回を無限に抱えない。
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

$principal = New-ScheduledTaskPrincipal -UserId $CurrentUser -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Description "monocore: RSSを1時間ごとに巡回し Supabase の articles を更新する" `
    -Action $action `
    -Trigger $triggers `
    -Settings $settings `
    -Principal $principal | Out-Null

Write-Host "登録しました: $TaskName"
Write-Host "  実行: $PythonWExe `"$Script`""
Write-Host "  ログ: $(Join-Path $WorkDir 'logs\scraper.log')"
Write-Host ""
Write-Host "旧タスクの解除は Phase 4 (撤収) で行う:"
Write-Host "  Unregister-ScheduledTask -TaskName NewsScraping_Scraper -Confirm:`$false"
Write-Host "  Unregister-ScheduledTask -TaskName NewsScraping_FlaskWeb -Confirm:`$false"
