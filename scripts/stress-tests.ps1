<#
.SYNOPSIS
  T09b: run the test suite repeatedly and keep the full log of every failing run.

.DESCRIPTION
  Each run's output goes to a log file. A run is kept (verbose log + JUnit XML) when its exit code
  is not 0 or its output has a "[file-errors]" line (scripts/vitest-file-errors-reporter.ts);
  logs of clean runs are deleted. One CSV row per run goes to summary.csv in the log directory.

  Modes:
    full      whole suite, verbose + JUnit
    shuffle   whole suite, --sequence.shuffle with a random seed (recorded in the CSV)
    check     pnpm check (typecheck, lint, test), as in the original failure
    revise    packages/host/test/revise.test.ts alone
    host      the @cb/host project alone
    hanging   whole suite once with the hanging-process reporter (lists handles left open)

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/stress-tests.ps1 -Mode full -Runs 20
  powershell -ExecutionPolicy Bypass -File scripts/stress-tests.ps1 -Mode revise -Runs 50 -LogDir C:\tmp\cb
#>
param(
  [ValidateSet("full", "shuffle", "check", "revise", "host", "hanging")]
  [string]$Mode = "full",
  [int]$Runs = 10,
  [string]$LogDir = (Join-Path $env:TEMP "cb-stress")
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force $LogDir | Out-Null
$summary = Join-Path $LogDir "summary.csv"
if (-not (Test-Path $summary)) {
  "time,mode,run,seed,exit,seconds,testFiles,tests,fileErrors,log" | Out-File -Encoding utf8 $summary
}

$reporter = "--reporter=./scripts/vitest-file-errors-reporter.ts"
$kept = 0

Push-Location $repo
try {
  for ($i = 1; $i -le $Runs; $i++) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $base = Join-Path $LogDir "$Mode-$stamp-$i"
    $log = "$base.log"
    $xml = "$base.junit.xml"
    $seed = ""
    $vitest = "pnpm exec vitest run --reporter=verbose --reporter=junit --outputFile.junit=`"$xml`" $reporter"
    switch ($Mode) {
      "full"    { $cmd = $vitest }
      "shuffle" { $seed = Get-Random -Minimum 1 -Maximum 1000000
                  $cmd = "$vitest --sequence.shuffle --sequence.seed=$seed" }
      "check"   { $cmd = "pnpm check" }
      "revise"  { $cmd = "$vitest packages/host/test/revise.test.ts" }
      "host"    { $cmd = "$vitest --project @cb/host" }
      "hanging" { $cmd = "pnpm exec vitest run --reporter=default --reporter=hanging-process $reporter" }
    }

    # cmd /c keeps stdout and stderr in one file without PowerShell 5.1's stderr ErrorRecords.
    $t0 = Get-Date
    cmd /c "$cmd < NUL > `"$log`" 2>&1"
    $exit = $LASTEXITCODE
    $secs = [math]::Round(((Get-Date) - $t0).TotalSeconds, 1)

    $text = (Get-Content -Raw $log) -replace "\x1b\[[0-9;]*m", ""
    $files = if ($text -match "Test Files\s+([^\r\n]+)") { $Matches[1].Trim() } else { "" }
    $tests = if ($text -match "\n\s+Tests\s+([^\r\n]+)") { $Matches[1].Trim() } else { "" }
    $fileErrors = ([regex]::Matches($text, "\[file-errors\]")).Count

    $keep = ($exit -ne 0) -or ($fileErrors -gt 0) -or ($Mode -eq "hanging")
    if ($keep) {
      $kept++
      Write-Host "run $i/$Runs ($Mode): exit $exit, $files | $tests -> kept $log" -ForegroundColor Yellow
    } else {
      Remove-Item -Force $log
      if (Test-Path $xml) { Remove-Item -Force $xml }
      Write-Host "run $i/$Runs ($Mode): ok in $secs s, $tests"
    }
    $logCol = if ($keep) { $log } else { "" }
    "$(Get-Date -Format s),$Mode,$i,$seed,$exit,$secs,`"$files`",`"$tests`",$fileErrors,`"$logCol`"" |
      Out-File -Append -Encoding utf8 $summary
  }
} finally {
  Pop-Location
}

Write-Host "$Mode`: $Runs runs, $kept kept. Summary: $summary"
if ($kept -gt 0 -and $Mode -ne "hanging") { exit 1 }
