$outputDir = Join-Path $PSScriptRoot "../../output/playwright/hero-live-skill-audit"
$heroes = @("Needle", "Mandy", "Fairy Mina", "Brock Zeus", "Kaze", "Wukong Mico", "Persephone Lumi", "Katty")
Remove-Item (Join-Path $outputDir "report.*.json") -ErrorAction SilentlyContinue
foreach ($hero in $heroes) {
  $env:HERO_LIVE_AUDIT_URL = "http://localhost"
  $env:HERO_LIVE_AUDIT_HERO = $hero
  Write-Output "AUDIT $hero"
  node (Join-Path $PSScriptRoot "hero-live-skill-audit.cjs") | Out-File (Join-Path $outputDir "$($hero.ToLower().Replace(' ', '-'))-console.json") -Encoding utf8
  Copy-Item (Join-Path $outputDir "report.json") (Join-Path $outputDir "report.$($hero.ToLower().Replace(' ', '-')).json") -Force
}
Remove-Item Env:HERO_LIVE_AUDIT_HERO -ErrorAction SilentlyContinue
