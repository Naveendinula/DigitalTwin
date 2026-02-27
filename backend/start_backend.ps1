param(
    [string]$BindHost = "0.0.0.0",
    [int]$Port = 8000,
    [string]$EnvFile = ".env",
    [switch]$NoReload
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonExe = Join-Path $scriptDir "venv\Scripts\python.exe"

if (-not (Test-Path $pythonExe)) {
    Write-Error "Missing virtual environment python at '$pythonExe'. Create it first: python -m venv venv"
    exit 1
}

$envPath = Join-Path $scriptDir $EnvFile
$uvicornArgs = @("-m", "uvicorn", "main:app", "--host", $BindHost, "--port", "$Port")

if (-not $NoReload) {
    $uvicornArgs += "--reload"
}

if (Test-Path $envPath) {
    $uvicornArgs += @("--env-file", $envPath)
} else {
    Write-Warning "Env file not found at '$envPath'. Starting without --env-file."
}

Push-Location $scriptDir
try {
    & $pythonExe @uvicornArgs
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
