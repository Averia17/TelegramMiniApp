[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$BattleArgs
)

$battleRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$binary = Join-Path $battleRoot "battle.exe"
$buildCache = Join-Path $battleRoot ".gocache"
$previousGoCache = [Environment]::GetEnvironmentVariable("GOCACHE", "Process")

Push-Location $battleRoot
try {
    # Keep Go's required build cache in one repository-local directory. Direct
    # launches must not use go run, which creates a new executable under
    # %TEMP%\go-build on every run.
    New-Item -ItemType Directory -Force -Path $buildCache | Out-Null
    [Environment]::SetEnvironmentVariable("GOCACHE", $buildCache, "Process")
    & go build -o $binary .
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    & $binary @BattleArgs
    exit $LASTEXITCODE
}
finally {
    Pop-Location
    if ($null -eq $previousGoCache) {
        [Environment]::SetEnvironmentVariable("GOCACHE", $null, "Process")
    }
    else {
        [Environment]::SetEnvironmentVariable("GOCACHE", $previousGoCache, "Process")
    }
}
