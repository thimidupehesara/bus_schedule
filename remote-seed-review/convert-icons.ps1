Add-Type -AssemblyName System.Drawing

function Convert-Icon {
    param(
        [string]$SourcePath,
        [string]$DestPath,
        [int]$Width,
        [int]$Height
    )

    $srcImg = [System.Drawing.Image]::FromFile($SourcePath)
    Write-Host "Source: $SourcePath ($($srcImg.Width)x$($srcImg.Height))"

    $bitmap = New-Object System.Drawing.Bitmap $Width, $Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.DrawImage($srcImg, 0, 0, $Width, $Height)

    $srcImg.Dispose()
    $graphics.Dispose()

    # Save to temp path then replace
    $tempPath = [System.IO.Path]::GetTempFileName()
    $bitmap.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()

    Move-Item -Force $tempPath $DestPath
    Write-Host "Saved: $DestPath ($Width x $Height PNG)"
}

$mobilePublic = "T:\New folder\remote-seed-review\apps\mobile\public"
$tvPublic = "T:\New folder\remote-seed-review\apps\tv\public"

# We can use the 512 or 192 source file (which has high resolution 1.6MB)
$sourceMaster = "$mobilePublic\icon-512.png"

# Convert mobile icons
Convert-Icon -SourcePath $sourceMaster -DestPath "$mobilePublic\icon-192.png" -Width 192 -Height 192
Convert-Icon -SourcePath $sourceMaster -DestPath "$mobilePublic\icon-512.png" -Width 512 -Height 512

# Convert tv icons
Convert-Icon -SourcePath $sourceMaster -DestPath "$tvPublic\icon-192.png" -Width 192 -Height 192
Convert-Icon -SourcePath $sourceMaster -DestPath "$tvPublic\icon-512.png" -Width 512 -Height 512

