$ErrorActionPreference = 'Stop'

$releasePath = 'F:\Burd\benchmark\target\release\burd-agent.exe'
$debugPath = 'F:\Burd\benchmark\target\debug\burd-agent.exe'
$destinationDir = 'F:\Burd\app\src-tauri\binaries'
$destinationPath = Join-Path $destinationDir 'burd-agent.exe'

$sourcePath = $null

if (Test-Path -LiteralPath $releasePath) {
  $sourcePath = $releasePath
}
elseif (Test-Path -LiteralPath $debugPath) {
  $sourcePath = $debugPath
}
else {
  throw 'burd-agent.exe não encontrado. Rode primeiro: cd F:\Burd\benchmark && cargo build --release'
}

if (-not (Test-Path -LiteralPath $destinationDir)) {
  New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
}

Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force

"Binário encontrado: $sourcePath"
"Destino: $destinationPath"
'Sync concluído com sucesso.'
