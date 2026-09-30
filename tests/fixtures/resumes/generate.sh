#!/usr/bin/env bash
# Rebuilds the fake resume fixtures. PDFs come from the HTML files via headless Chrome (macOS path below);
# the .docx comes from make-docx.mjs (plain Node, any OS).
set -euo pipefail
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$PWD/alex-rivera.pdf" "file://$PWD/alex-rivera.html"
"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$PWD/blank.pdf" "file://$PWD/blank.html"
node make-docx.mjs
echo "Wrote alex-rivera.pdf, alex-rivera.docx and blank.pdf"
