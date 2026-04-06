[CmdletBinding()]
param()

Add-Type -AssemblyName System.Drawing

function Fix-Image {
    param([string]$FilePath)

    # Check if the file exists
    if (-not (Test-Path $FilePath)) {
        Write-Host "File not found: $FilePath" -ForegroundColor Yellow
        return
    }

    $fullPath = (Resolve-Path $FilePath).Path
    $tempPath = "$fullPath.tmp.png"

    Write-Host "Processing $FilePath..."

    try {
        # Attempt to load the image. This will validate if it's readable.
        $img = [System.Drawing.Image]::FromFile($fullPath)
        
        # We re-save it to a temporary path, forcing pure PNG format.
        # This strips out corrupted chunks, EXIF anomalies, or fixes wrong extensions (e.g. WebP saved as PNG).
        $img.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $img.Dispose()

        # Replace original file with the valid clean PNG
        Remove-Item $fullPath -Force
        Rename-Item $tempPath -NewName (Split-Path $fullPath -Leaf) -Force

        Write-Host " [OK] Successfully validated and re-exported: $FilePath" -ForegroundColor Green
    }
    catch {
        Write-Host " [ERROR] Failed to process $FilePath. It might be completely corrupted or not an image. Error: $($_.Exception.Message)" -ForegroundColor Red
        if (Test-Path $tempPath) {
            Remove-Item $tempPath -Force
        }
    }
}

# The images to validate
$assetsPath = Join-Path -Path $PSScriptRoot -ChildPath "assets"

$logoPath = Join-Path -Path $assetsPath -ChildPath "logo.png"
$splashPath = Join-Path -Path $assetsPath -ChildPath "splash.png"

Fix-Image -FilePath $logoPath
Fix-Image -FilePath $splashPath

Write-Host "Image validation complete." -ForegroundColor Cyan
