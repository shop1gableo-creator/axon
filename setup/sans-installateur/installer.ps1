# =====================================================================================
#  Installateur d'Axon (Windows). Lancé par « Installer Axon.cmd » (double-clic).
#  1. vérifie Node.js (l'installe avec winget s'il manque)
#  2. copie l'app dans %USERPROFILE%\Axon\app
#  3. installe les dépendances et construit l'interface
#  4. crée les raccourcis (Bureau + menu Démarrer) et le guide
#  5. lance Axon : au premier lancement tu choisis ton dossier (Google Drive ou PC), le cerveau s'y crée,
#     et Claude est branché automatiquement.
#  Ton cerveau (tes notes) n'est JAMAIS dans le dossier de l'app : on peut réinstaller l'app sans rien perdre.
# =====================================================================================
$ErrorActionPreference = "Stop"
$source = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$racine = Join-Path $env:USERPROFILE "Axon"
$app = Join-Path $racine "app"

function Titre($t) { Write-Host ""; Write-Host "==> $t" -ForegroundColor White }
function Ok($t) { Write-Host "    OK  $t" -ForegroundColor Green }

Write-Host ""
Write-Host "   A X O N   ·   installation" -ForegroundColor White
Write-Host "   L'app va dans : $app"

# 1. Node.js
Titre "Node.js"
$node = Get-Command node -ErrorAction SilentlyContinue
$okNode = $false
if ($node) { $v = (& node -v).TrimStart("v").Split(".")[0]; if ([int]$v -ge 20) { $okNode = $true; Ok "Node $(& node -v) déjà installé" } }
if (-not $okNode) {
  Write-Host "    Node.js 20+ est nécessaire. Installation avec winget (accepte si Windows te le demande)..."
  winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js n'a pas pu être installé. Installe-le depuis https://nodejs.org (version LTS) puis relance Installer Axon.cmd." }
  Ok "Node $(& node -v) installé"
}

# 2. Copier l'app
Titre "Copie de l'app"
New-Item -ItemType Directory -Force $app | Out-Null
if ((Resolve-Path $source).Path -ne (Resolve-Path $app).Path) {
  robocopy $source $app /E /NFL /NDL /NJH /NJS /NP /XD node_modules .git .models "renderer\dist" "connector\server" | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "La copie a échoué (robocopy $LASTEXITCODE)." }
}
Ok $app

# 3. Dépendances + interface
Titre "Installation des composants (2 à 5 minutes la première fois)"
Set-Location $app
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "npm install a échoué. Vérifie ta connexion internet puis relance." }
# npm récent bloque parfois les scripts d'installation : on télécharge Electron (le moteur de la fenêtre) nous-mêmes.
if (-not (Test-Path "node_modules\electron\dist\electron.exe")) { node node_modules\electron\install.js }
if (-not (Test-Path "node_modules\electron\dist\electron.exe")) { throw "Electron n'a pas pu être téléchargé. Vérifie ta connexion internet puis relance." }
npm run build
if ($LASTEXITCODE -ne 0) { throw "La construction de l'interface a échoué." }
Ok "Composants installés"

# 4. Raccourcis + guide
Titre "Raccourcis"
$electron = Join-Path $app "node_modules\electron\dist\electron.exe"
$ico = Join-Path $app "build\axon.ico"
$sh = New-Object -ComObject WScript.Shell
foreach ($lnk in @(([Environment]::GetFolderPath("Desktop") + "\Axon.lnk"), ([Environment]::GetFolderPath("Programs") + "\Axon.lnk"))) {
  $s = $sh.CreateShortcut($lnk); $s.TargetPath = $electron; $s.Arguments = '"' + $app + '"'; $s.WorkingDirectory = $app; $s.IconLocation = $ico; $s.Description = "Axon, ton second cerveau"; $s.Save()
}
Copy-Item (Join-Path $app "guide\index.html") (Join-Path $racine "Guide Axon.html") -Force
Copy-Item (Join-Path $app "setupsans-installateurDesinstaller Axon.cmd") (Join-Path $racine "Desinstaller Axon.cmd") -Force
Ok "Bureau + menu Démarrer + $racine\Guide Axon.html"

# 5. Lancer
Titre "C'est installé."
Write-Host "    Axon s'ouvre : choisis ton prénom, ton dossier (Google Drive ou PC) et tes domaines."
Write-Host "    Le guide s'ouvre aussi dans ton navigateur."
Start-Process (Join-Path $racine "Guide Axon.html")
Start-Process $electron -ArgumentList ('"' + $app + '"') -WorkingDirectory $app
