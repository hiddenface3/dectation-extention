@echo off
setlocal

:: Get the directory of this batch script
set "DIR=%~dp0"

:: 1. If this batch script is called by Chrome (meaning it has arguments), run python script
if not "%~1"=="" (
    python "%DIR%host.py" %*
    exit /b
)

:: 2. Else: Installation mode - Register the native host manifest
echo Installing Native Messaging Host...

:: Set the path to the manifest JSON inside the JSON itself programmatically (to use correct absolute path)
powershell -Command "(gc '%DIR%com.dictation.automator.json') -replace '\"path\": \".*?\"', '\"path\": \"!DIR:\\=\\\\!install.bat\"' | Out-File -encoding utf8 '%DIR%com.dictation.automator.json'"
:: Let user know the extension ID needs manually replacement before installing
echo WARNING: Before installing, please ensure your replace YOUR_EXTENSION_ID_HERE in com.dictation.automator.json with the actual string!

:: Write to registry
REG ADD "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.dictation.automator" /ve /t REG_SZ /d "%DIR%com.dictation.automator.json" /f

echo.
echo Native Messaging Host installed successfully!
echo You can now use Global Auto-Paste.
pause
