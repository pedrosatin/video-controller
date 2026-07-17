#!/usr/bin/env bash
# Builds a minified, store-ready bundle of the extension into dist/ and zips
# it as video-controller-v<version>.zip. Minification only (esbuild) — no
# mangling/obfuscation, which the Chrome Web Store forbids.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf dist
mkdir -p dist/icons

npx --yes esbuild panelTemplate.js content.js popup.js --minify --outdir=dist
npx --yes esbuild content.css --minify --outfile=dist/content.css

cp manifest.json popup.html dist/
cp icons/*.png dist/icons/

VERSION=$(jq -r .version manifest.json)
ZIP="video-controller-v${VERSION}.zip"
rm -f "$ZIP"
(cd dist && zip -qr "../$ZIP" .)

echo "Built $ZIP ($(du -h "$ZIP" | cut -f1))"
