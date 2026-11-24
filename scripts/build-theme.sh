#!/usr/bin/env bash
# Assemble le thème : Dawn v16.2.0 (gratuit, officiel Shopify) + overlay Flairou → theme/build
set -euo pipefail
cd "$(dirname "$0")/.."
DAWN_TAG="${DAWN_TAG:-v16.2.0}"
rm -rf theme/build
git clone --quiet --depth 1 --branch "$DAWN_TAG" https://github.com/Shopify/dawn.git theme/build
rm -rf theme/build/.git theme/build/.github
python3 theme/make_overlay.py theme/build
cp -R theme/overlay/. theme/build/
echo "Thème assemblé dans theme/build (Dawn $DAWN_TAG + overlay Flairou)"
