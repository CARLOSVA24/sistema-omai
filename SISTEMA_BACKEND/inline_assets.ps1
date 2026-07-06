$html = Get-Content index.html -Raw
$css = Get-Content style.css -Raw
$js = Get-Content script.js -Raw

# Replace CSS link
$html = $html -replace '<link rel="stylesheet" href="style.css">', "<style>`n$css`n</style>"

# Replace JS script tag
$html = $html -replace '<script src="script.js"></script>', "<script>`n$js`n</script>"

Set-Content -Path "index.html" -Value $html -Encoding utf8
Write-Host "Inlining complete."
