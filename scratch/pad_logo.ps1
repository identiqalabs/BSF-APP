Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('d:\bsf\bis_app\assets\mainlogo.jpg')
$max = [Math]::Max($img.Width, $img.Height)
$newImg = New-Object System.Drawing.Bitmap($max, $max)
$g = [System.Drawing.Graphics]::FromImage($newImg)
$g.Clear([System.Drawing.Color]::White)
$x = ($max - $img.Width) / 2
$y = ($max - $img.Height) / 2
$g.DrawImage($img, $x, $y, $img.Width, $img.Height)
$newImg.Save('d:\bsf\bis_app\assets\mainlogo_square.png', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$newImg.Dispose()
$img.Dispose()
