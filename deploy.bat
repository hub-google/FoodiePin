@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo    FoodiePin ROBUST SYNC DEPLOY (PRO)
echo ==========================================

REM 1. Environment Check
echo [1/6] Starting Deployment Flow...

REM 2. Backend Deploy
echo [2/6] Pushing backend code...
call npx @google/clasp push -f
if %errorlevel% neq 0 goto :error

echo Creating deployment version...
call npx @google/clasp deploy --description "Auto Sync Build"
if %errorlevel% neq 0 goto :error

REM 3. URL Injection & Cache Busting
echo [3/6] Automating links and cache busting...
powershell -Command "$ts = Get-Date -Format 'yyyyMMddHHmm'; $deployments = cmd /c npx @google/clasp deployments; $url = ($deployments | Select-String -Pattern 'https://script.google.com/macros/s/[^ ]+/exec' -AllMatches).Matches.Value | Select-Object -First 1; if ($url) { $content = Get-Content index.html; $content = $content -replace 'v=\d+', ('v=' + $ts); $content | Set-Content index.html; $js = Get-Content js/app.js; $js = $js -replace 'GAS_URL: \x27.*?\x27', ('GAS_URL: \x27' + $url + '\x27'); $js | Set-Content js/app.js; $sw = Get-Content sw.js; $sw = $sw -replace 'CACHE_NAME = \x27.*?\x27', ('CACHE_NAME = \x27foodiepin-v' + $ts + '\x27'); $sw | Set-Content sw.js; Write-Host 'Updated URL, SW and Tags: ' $ts } else { Write-Host 'Warning: Could not update URL' }"

REM 4. Git Sync (master branch)
echo [4/6] Syncing to GitHub (master)...
git add .
git commit -m "Auto-Deploy: Version Update"
git push origin master
if %errorlevel% neq 0 goto :error

REM 5. Verify GitHub Pages Config
echo [5/6] Verifying GitHub Pages settings...
call gh api -X POST /repos/hub-google/FoodiePin/pages --field "source[branch]=master" --field "source[path]=/" >nul 2>&1

REM 6. Final Sync Verification
echo [6/6] Verifying remote sync...
echo Waiting for GitHub Pages to refresh...
timeout /t 5 >nul
powershell -Command "$expected = (Get-Date -Format 'yyyyMMddHHmm'); $live = cmd /c curl -L -s https://hub-google.github.io/FoodiePin/; if ($live -like '*v=' + $expected + '*') { Write-Host '--- [SUCCESS] Remote is synced! ---' -ForegroundColor Green } else { Write-Host '--- [PENDING] Server update delayed, please try hard refresh later. ---' -ForegroundColor Yellow }"

echo.
echo ==========================================
echo    Deployment Flow Complete!
echo ==========================================
pause
exit /b 0

:error
echo.
echo [ERROR] Deployment failed. Please check the logs above.
pause
exit /b 1
