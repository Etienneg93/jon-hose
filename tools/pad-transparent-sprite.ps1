param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][int]$CanvasWidth,
  [Parameter(Mandatory = $true)][int]$CanvasHeight
)

Add-Type -AssemblyName System.Drawing

$source = [System.Drawing.Bitmap]::new($InputPath)
try {
  if ($source.Width -gt $CanvasWidth -or $source.Height -gt $CanvasHeight) {
    throw "Source $($source.Width)x$($source.Height) exceeds target $($CanvasWidth)x$($CanvasHeight)."
  }

  $output = [System.Drawing.Bitmap]::new(
    $CanvasWidth,
    $CanvasHeight,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($output)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $x = [int][Math]::Floor(($CanvasWidth - $source.Width) / 2)
      $y = $CanvasHeight - $source.Height
      $graphics.DrawImageUnscaled($source, $x, $y)
    } finally {
      $graphics.Dispose()
    }

    $parent = Split-Path -Parent $OutputPath
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    $output.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $output.Dispose()
  }
} finally {
  $source.Dispose()
}
