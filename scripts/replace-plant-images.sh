#!/bin/bash
# Replace plant growth images with your uncropped versions
# 
# 1. Place your 7 images in assets/plant-growth/ and name them:
#    IMG_9424.png (soil)      -> will become 1.png
#    IMG_9425.png (sprout)    -> will become 2.png
#    IMG_9426.png (leaves)    -> will become 3.png
#    IMG_9427.png (more)      -> will become 4.png
#    IMG_9428.png (bud)       -> will become 5.png
#    IMG_9429.png (taller)    -> will become 6.png
#    IMG_9430.png (bloom)     -> will become 7.png
#
# 2. Run: ./scripts/replace-plant-images.sh

set -e
cd "$(dirname "$0")/.."

SRC="assets/plant-growth"
DEST="frontend/public/plant-growth"

mkdir -p "$DEST"

for mapping in "IMG_9424:1" "IMG_9425:2" "IMG_9426:3" "IMG_9427:4" "IMG_9428:5" "IMG_9429:6" "IMG_9430:7"; do
  src_name="${mapping%%:*}"
  dest_num="${mapping##*:}"
  # Match any file starting with src_name (e.g. IMG_9424-xxx.png)
  for f in "$SRC"/${src_name}*.png; do
    if [ -f "$f" ]; then
      cp "$f" "$DEST/${dest_num}.png"
      echo "Copied $f -> $DEST/${dest_num}.png"
      break
    fi
  done
done

echo "Done. Restart the dev server if it's running."
