@echo off
setlocal

:: Get the directory of this batch script
set "DIR=%~dp0"

:: 1. If this batch script is called by browser (meaning it has arguments), run python script
if not "%~1"=="" (
    python "%DIR%host.py" %*
    exit /b
)

:: 2. Else: Installation mode
echo =====================================================
echo  Dictation Automator - Native Host Installer
echo =====================================================
echo.

:: Install required Python packages
echo Installing Python dependencies...
pip install keyboard pywin32 --quiet
echo Done.
echo.

:: Update the manifest JSON with the correct absolute path
powershell -Command "(gc '%DIR%com.dictation.automator.json') -replace '\"path\": \".*?\"', '\"path\": \"%DIR:\=\\%install.bat\"' | Out-File -encoding utf8 '%DIR%com.dictation.automator.json'"

echo WARNING: Make sure your extension ID is set correctly in com.dictation.automator.json
echo          (replace the placeholder with your actual extension ID from edge://extensions)
echo.

:: Register for Microsoft Edge
echo Registering for Microsoft Edge...
REG ADD "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.dictation.automator" /ve /t REG_SZ /d "%DIR%com.dictation.automator.json" /f

:: Register for Google Chrome (keep for compatibility)
echo Registering for Google Chrome...
REG ADD "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.dictation.automator" /ve /t REG_SZ /d "%DIR%com.dictation.automator.json" /f

echo.
echo =====================================================
echo  Native Messaging Host installed successfully!
echo  Reload your extension in edge://extensions
echo =====================================================
pause
