Add-Type -AssemblyName System.Drawing
$originalPath = 'd:\bsf\bis_app\assets\mainlogo.jpg'
$tempPath = 'd:\bsf\bis_app\assets\mainlogo_temp.jpg'

$img = [System.Drawing.Image]::FromFile($originalPath)
$max = [Math]::Max($img.Width, $img.Height)
$newImg = New-Object System.Drawing.Bitmap($max, $max)
$g = [System.Drawing.Graphics]::FromImage($newImg)

# Fill background with White
$g.Clear([System.Drawing.Color]::White)

# Center the original image
$x = ($max - $img.Width) / 2
$y = ($max - $img.Height) / 2
$g.DrawImage($img, $x, $y, $img.Width, $img.Height)

# Save as JPG
$newImg.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)

$g.Dispose()
$newImg.Dispose()
$img.Dispose()

# Overwrite original
Move-Item -Path $tempPath -Destination $originalPath -Force
