# Start/stop backend (FastAPI) + frontend (Vite) on Windows PowerShell.
# Usage:
#   .\scripts\dev.ps1 start
#   .\scripts\dev.ps1 stop
#   .\scripts\dev.ps1 status
#   .\scripts\dev.ps1 logs
#   .\scripts\dev.ps1 restart
param(
    [ValidateSet('start','stop','restart','status','logs')]
    [string]$Command = 'start'
)

$ErrorActionPreference = 'Stop'
$Root     = Split-Path -Parent $PSScriptRoot
$RunDir   = Join-Path $Root '.dev'
New-Item -ItemType Directory -Force -Path $RunDir | Out-Null

# Resolve Python: prefer $env:WORKFORCE_PYTHON, then miniconda, then PATH.
# (Plain 'python' on Windows often resolves to the Store shim, which has none
# of our deps installed — hence the explicit path.)
$PythonExe = $env:WORKFORCE_PYTHON
if (-not $PythonExe) {
    $candidates = @(
        "$env:USERPROFILE\miniconda3\python.exe",
        "$env:USERPROFILE\anaconda3\python.exe"
    )
    $PythonExe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $PythonExe) { $PythonExe = 'python' }

$services = @(
    @{ Name='backend';  Dir=(Join-Path $Root 'src\backend');  Exe=$PythonExe; Args='-m uvicorn app.main:app --reload --port 8000' },
    @{ Name='frontend'; Dir=(Join-Path $Root 'src\frontend'); Exe='npm.cmd';  Args='run dev' }
)

function Get-PidFile($name) { Join-Path $RunDir "$name.pid" }
function Get-LogFile($name) { Join-Path $RunDir "$name.log" }

function Test-Running($name) {
    $pf = Get-PidFile $name
    if (-not (Test-Path $pf)) { return $false }
    $raw = (Get-Content $pf -ErrorAction SilentlyContinue | Select-Object -First 1)
    if (-not $raw) { return $false }
    $procId = 0
    if (-not [int]::TryParse($raw.Trim(), [ref]$procId)) { return $false }
    return [bool](Get-Process -Id $procId -ErrorAction SilentlyContinue)
}

function Start-One($svc) {
    if (Test-Running $svc.Name) {
        Write-Host "[dev] $($svc.Name) already running (pid $(Get-Content (Get-PidFile $svc.Name)))"
        return
    }
    $log = Get-LogFile $svc.Name
    Write-Host "[dev] starting $($svc.Name) -> $log"
    # Launch via `cmd /c` with shell redirection so the child gets its own
    # console (PowerShell's -RedirectStandardOutput steals stdin from the
    # parent shell and locks it up).
    $cmdLine = '"' + $svc.Exe + '" ' + $svc.Args + ' > "' + $log + '" 2>&1'
    $p = Start-Process -FilePath 'cmd.exe' `
        -ArgumentList @('/c', $cmdLine) `
        -WorkingDirectory $svc.Dir `
        -WindowStyle Hidden -PassThru
    Set-Content -Path (Get-PidFile $svc.Name) -Value $p.Id
}

function Stop-One($name) {
    $pf = Get-PidFile $name
    if (-not (Test-Running $name)) {
        Write-Host "[dev] $name not running"
        Remove-Item $pf -ErrorAction SilentlyContinue
        return
    }
    $procId = Get-Content $pf
    Write-Host "[dev] stopping $name (pid $procId)"
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    Remove-Item $pf -ErrorAction SilentlyContinue
}

switch ($Command) {
    'start' {
        $services | ForEach-Object { Start-One $_ }
        Write-Host "[dev] backend  :8000"
        Write-Host "[dev] frontend :5173"
        Write-Host "[dev] .\scripts\dev.ps1 logs | stop | status"
    }
    'stop' {
        Stop-One 'frontend'
        Stop-One 'backend'
    }
    'restart' {
        & $PSCommandPath stop
        & $PSCommandPath start
    }
    'status' {
        Write-Host "[dev] status:"
        foreach ($s in $services) {
            if (Test-Running $s.Name) {
                Write-Host "  $($s.Name): running (pid $(Get-Content (Get-PidFile $s.Name)))"
            } else {
                Write-Host "  $($s.Name): stopped"
            }
        }
    }
    'logs' {
        Get-Content -Wait -Tail 50 (Get-LogFile 'backend'), (Get-LogFile 'frontend')
    }
}
