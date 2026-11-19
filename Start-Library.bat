@echo off
cd /d "%~dp0"
where java >nul 2>nul
if errorlevel 1 (
    echo Java 17 or later is required. Install Java and add it to PATH.
    pause
    exit /b 1
)
echo Open http://localhost:8080 once the Library Desk starts.
if exist "runtime\library.jar" (
    java -cp "runtime\library.jar;runtime\lib\*" edu.cu.library.LibraryApplication
) else (
    call mvn spring-boot:run
)
if errorlevel 1 pause
