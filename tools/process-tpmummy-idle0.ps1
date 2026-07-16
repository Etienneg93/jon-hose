param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [int]$CanvasWidth = 80,
  [int]$CanvasHeight = 116,
  [int]$TargetHeight = 108
)

Add-Type -AssemblyName System.Drawing

$source = [System.Drawing.Bitmap]::new($InputPath)
try {
  $key = $source.GetPixel(0, 0)
  $left = $source.Width
  $top = $source.Height
  $right = -1
  $bottom = -1

  for ($y = 0; $y -lt $source.Height; $y++) {
    for ($x = 0; $x -lt $source.Width; $x++) {
      $c = $source.GetPixel($x, $y)
      $dr = [int]$c.R - [int]$key.R
      $dg = [int]$c.G - [int]$key.G
      $db = [int]$c.B - [int]$key.B
      $isPinkSpill = (
        ((([int]$c.R - [int]$c.G) -gt 8) -and (([int]$c.B - [int]$c.G) -gt 8)) -or
        (([int]$c.R -gt 100) -and ([int]$c.R -gt [int]$c.G) -and ([int]$c.B -gt [int]$c.G)) -or
        (([int]$c.R -gt 140) -and (([int]$c.R - [int]$c.G) -gt 20) -and (([int]$c.B - [int]$c.G) -gt -15)) -or
        (([int]$c.R -gt 20) -and ([int]$c.G -lt 10) -and ([int]$c.B -gt ([int]$c.R * 0.7)))
      )
      if (($dr * $dr + $dg * $dg + $db * $db) -gt 9000 -and -not $isPinkSpill) {
        if ($x -lt $left) { $left = $x }
        if ($x -gt $right) { $right = $x }
        if ($y -lt $top) { $top = $y }
        if ($y -gt $bottom) { $bottom = $y }
      }
    }
  }

  if ($right -lt $left -or $bottom -lt $top) {
    throw "No non-background sprite pixels found."
  }

  $canvasW = $CanvasWidth
  $canvasH = $CanvasHeight
  $targetH = $TargetHeight
  $bboxW = $right - $left + 1
  $bboxH = $bottom - $top + 1
  $targetW = [Math]::Min($canvasW, [int][Math]::Round($bboxW * $targetH / $bboxH))
  $destX = [int][Math]::Floor(($canvasW - $targetW) / 2)
  $destY = $canvasH - $targetH - 4

  $output = [System.Drawing.Bitmap]::new($canvasW, $canvasH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    for ($y = 0; $y -lt $canvasH; $y++) {
      for ($x = 0; $x -lt $canvasW; $x++) {
        $output.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
      }
    }

    # Sample the approved image once at final runtime resolution. Avoiding an
    # intermediate logical-size image preserves small features and contours.
    for ($dy = 0; $dy -lt $targetH; $dy++) {
      for ($dx = 0; $dx -lt $targetW; $dx++) {
        $sx = [Math]::Min($right, $left + [int][Math]::Floor(($dx + 0.5) * $bboxW / $targetW))
        $sy = [Math]::Min($bottom, $top + [int][Math]::Floor(($dy + 0.5) * $bboxH / $targetH))
        $c = $source.GetPixel($sx, $sy)
        $dr = [int]$c.R - [int]$key.R
        $dg = [int]$c.G - [int]$key.G
        $db = [int]$c.B - [int]$key.B
        $isPinkSpill = (
          ((([int]$c.R - [int]$c.G) -gt 8) -and (([int]$c.B - [int]$c.G) -gt 8)) -or
          (([int]$c.R -gt 100) -and ([int]$c.R -gt [int]$c.G) -and ([int]$c.B -gt [int]$c.G)) -or
          (([int]$c.R -gt 140) -and (([int]$c.R - [int]$c.G) -gt 20) -and (([int]$c.B - [int]$c.G) -gt -15)) -or
          (([int]$c.R -gt 20) -and ([int]$c.G -lt 10) -and ([int]$c.B -gt ([int]$c.R * 0.7)))
        )
        if (($dr * $dr + $dg * $dg + $db * $db) -gt 9000 -and -not $isPinkSpill) {
          $output.SetPixel($destX + $dx, $destY + $dy,
            [System.Drawing.Color]::FromArgb(255, $c.R, $c.G, $c.B))
        }
      }
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
