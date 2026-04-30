@echo off
setlocal enabledelayedexpansion

:: Initialisation du compteur
set count=1

echo Lancement du renommage sequentiel...

:: Boucle sur tous les fichiers du dossier actuel
for %%f in (*.*) do (
    :: On ne renomme pas le script lui-même
    if not "%%f"=="%~nx0" (
        set "extension=%%~xf"
        echo Renommage de "%%f" en "!count!!extension!"
        ren "%%f" "!count!!extension!"
        set /a count+=1
    )
)

echo.
echo Operation terminee. !count! fichiers traites (moins le script).
pause
