#!/usr/bin/env bash
set -euo pipefail
export TZ=UTC
root=$PWD
staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT
files=(index.html app.mjs yard.mjs yard.css)
for file in "${files[@]}"; do cp "game/$file" "$staging/$file"; done
cd "$staging"
touch -t 200001010000 "${files[@]}"
zip -q -X "$root/switchyard-yandex.zip" "${files[@]}"
sed -i '\|<script async src="/sdk.js"></script>|d' index.html
touch -t 200001010000 index.html
zip -q -X "$root/switchyard.zip" "${files[@]}"
