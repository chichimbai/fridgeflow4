Add-Type -AssemblyName System.Drawing
$root = "C:\Users\Jangabil\fridgeflow"
$utf8 = New-Object System.Text.UTF8Encoding $false

function Get-JpegDataUri([string]$path) {
  $img = [System.Drawing.Image]::FromFile($path)
  $bmp = $null
  $graphics = $null
  try {
    $width = $img.Width
    $height = $img.Height
    $max = 1400
    if ($width -gt $max) {
      $height = [int]($height * $max / $width)
      $width = $max
      $bmp = New-Object System.Drawing.Bitmap $width, $height
      $graphics = [System.Drawing.Graphics]::FromImage($bmp)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.DrawImage($img, 0, 0, $width, $height)
      $source = $bmp
    } else {
      $source = $img
    }
    $stream = New-Object System.IO.MemoryStream
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
    $params = New-Object System.Drawing.Imaging.EncoderParameters 1
    $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]72)
    $source.Save($stream, $codec, $params)
    $bytes = $stream.ToArray()
    $stream.Dispose()
    return "data:image/jpeg;base64," + [Convert]::ToBase64String($bytes)
  } finally {
    if ($graphics) { $graphics.Dispose() }
    if ($bmp) { $bmp.Dispose() }
    $img.Dispose()
  }
}

$names = @(
  "images/vegetables.jpg",
  "images/greens.jpg",
  "images/eggs.jpg",
  "images/meal.jpg",
  "images/board.jpg",
  "images/roast.jpg",
  "images/prep.jpg",
  "images/pantry.jpg",
  "images/spread.jpg",
  "images/sidebar-art.svg"
)

$builder = New-Object System.Text.StringBuilder
[void]$builder.AppendLine("(function () {")
[void]$builder.AppendLine("  const files = {")
foreach ($name in $names) {
  $full = Join-Path $root ($name -replace "/", "\")
  if ($name.EndsWith(".svg")) {
    $bytes = [System.IO.File]::ReadAllBytes($full)
    $uri = "data:image/svg+xml;base64," + [Convert]::ToBase64String($bytes)
  } else {
    $uri = Get-JpegDataUri $full
  }
  [void]$builder.AppendLine(('    "{0}": "{1}",' -f $name, $uri))
}
$script = @'
  };

  const backgrounds = [
    [".why-card-accent", "images/spread.jpg", 'linear-gradient(160deg, rgba(18, 56, 44, 0.15), rgba(18, 56, 44, 0.45)), url("%s") center / cover'],
    [".ready", "images/meal.jpg", 'linear-gradient(100deg, rgba(13, 43, 34, 0.88), rgba(13, 43, 34, 0.55)), url("%s") right center / cover'],
    [".sidebar::before", "images/sidebar-art.svg", 'url("%s") center / contain no-repeat'],
  ];

  function watch(img) {
    const original = img.getAttribute("src");
    if (!original || !files[original] || img.dataset.photo === original) return;
    img.dataset.photo = original;
    const fallback = () => {
      if (img.dataset.photo === original) img.src = files[original];
    };
    if (img.complete && img.naturalWidth === 0) fallback();
    else img.addEventListener("error", fallback, { once: true });
  }

  function watchTree(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.tagName === "IMG") watch(node);
    node.querySelectorAll("img").forEach(watch);
  }

  document.querySelectorAll("img").forEach(watch);
  new MutationObserver((records) => {
    records.forEach((record) => {
      if (record.type === "attributes") watch(record.target);
      record.addedNodes.forEach(watchTree);
    });
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src"],
  });

  backgrounds.forEach(([selector, path, pattern]) => {
    const probe = new Image();
    probe.addEventListener("error", () => {
      const style = document.createElement("style");
      style.textContent = selector + "{background:" + pattern.replace("%s", files[path]) + " !important}";
      document.head.append(style);
    });
    probe.src = path;
  });

  window.fridgePhotosReady = true;
})();
'@
[void]$builder.Append($script)
[System.IO.File]::WriteAllText((Join-Path $root "images-data.js"), $builder.ToString(), $utf8)
Write-Output ("bytes " + (Get-Item (Join-Path $root "images-data.js")).Length)
