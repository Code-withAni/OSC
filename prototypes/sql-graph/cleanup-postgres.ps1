# cleanup-postgres.ps1 — kill (or count) the embedded-postgres processes
# belonging to this benchmark. Matches on CommandLine/ExecutablePath so it can
# never touch a system or user postgres (different path).
#
#   -Action kill   Stop every matching postgres.exe (idempotent)
#   -Action count  Write the number of matching processes to stdout
param([string]$Action = 'kill')

$procs = Get-CimInstance Win32_Process -Filter "Name='postgres.exe'" |
  Where-Object { $_.CommandLine -like '*@embedded-postgres*' -or $_.ExecutablePath -like '*@embedded-postgres*' }

if ($Action -eq 'kill') {
  foreach ($p in $procs) {
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
  }
  exit 0
}

Write-Output (@($procs).Count)
exit 0