param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [int]$Scale = 8
)

Add-Type -AssemblyName System.Drawing

$source = [System.Drawing.Bitmap]::new($InputPath)
try {
  $preview = [System.Drawing.Bitmap]::new($source.Width * $Scale, $source.Height * $Scale)
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($preview)
    try {
      $tile = 8 * $Scale
      for ($y = 0; $y -lt $preview.Height; $y += $tile) {
        for ($x = 0; $x -lt $preview.Width; $x += $tile) {
          $even = (([int]($x / $tile) + [int]($y / $tile)) % 2) -eq 0
          $color = if ($even) {
            [System.Drawing.Color]::FromArgb(255, 54, 58, 64)
          } else {
            [System.Drawing.Color]::FromArgb(255, 78, 83, 91)
          }
          $graphics.FillRectangle([System.Drawing.SolidBrush]::new($color), $x, $y, $tile, $tile)
        }
      }
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
      $graphics.DrawImage($source, 0, 0, $preview.Width, $preview.Height)
    } finally {
      $graphics.Dispose()
    }

    $parent = Split-Path -Parent $OutputPath
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    $preview.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $preview.Dispose()
  }
} finally {
  $source.Dispose()
}
