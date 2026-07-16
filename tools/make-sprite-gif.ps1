param(
  [Parameter(Mandatory = $true)][string[]]$Frames,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [int]$DelayCentiseconds = 12
)

Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

function New-GifFrame([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $decoder = [System.Windows.Media.Imaging.PngBitmapDecoder]::new(
      $stream,
      [System.Windows.Media.Imaging.BitmapCreateOptions]::PreservePixelFormat,
      [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad
    )
    return $decoder.Frames[0]
  } finally {
    $stream.Dispose()
  }
}

$encoder = [System.Windows.Media.Imaging.GifBitmapEncoder]::new()
foreach ($frame in $Frames) {
  $encoder.Frames.Add((New-GifFrame $frame))
}

$parent = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $parent | Out-Null
$output = [System.IO.File]::Create($OutputPath)
try {
  $encoder.Save($output)
} finally {
  $output.Dispose()
}

# WPF emits frame-control blocks with zero delays and no loop extension.
$bytes = [System.IO.File]::ReadAllBytes($OutputPath)
$delayLow = [byte]($DelayCentiseconds -band 0xff)
$delayHigh = [byte](($DelayCentiseconds -shr 8) -band 0xff)
for ($i = 0; $i -le $bytes.Length - 8; $i++) {
  if ($bytes[$i] -eq 0x21 -and $bytes[$i + 1] -eq 0xf9 -and $bytes[$i + 2] -eq 0x04) {
    $bytes[$i + 3] = 0x01
    $bytes[$i + 4] = $delayLow
    $bytes[$i + 5] = $delayHigh
  }
}

$loopExtension = [byte[]](
  0x21, 0xff, 0x0b,
  0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30,
  0x03, 0x01, 0x00, 0x00, 0x00
)
$insertAt = 13
$loopingBytes = [byte[]]::new($bytes.Length + $loopExtension.Length)
[System.Array]::Copy($bytes, 0, $loopingBytes, 0, $insertAt)
[System.Array]::Copy($loopExtension, 0, $loopingBytes, $insertAt, $loopExtension.Length)
[System.Array]::Copy($bytes, $insertAt, $loopingBytes, $insertAt + $loopExtension.Length, $bytes.Length - $insertAt)
[System.IO.File]::WriteAllBytes($OutputPath, $loopingBytes)
