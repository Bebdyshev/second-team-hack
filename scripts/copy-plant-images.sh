#!/bin/bash
# Copy your 7 plant growth images to the frontend public folder.
# Run from Hackathon root. Images should be in the order: soil -> sprout -> ... -> full bloom.
#
# If your images are in Cursor's assets folder:
#   SRC="$HOME/.cursor/projects/Users-damir-Hackathon/assets"
#   cp "$SRC/IMG_9424"*.png frontend/public/plant-growth/1.png
#   cp "$SRC/IMG_9425"*.png frontend/public/plant-growth/2.png
#   ... etc for 3-7 (IMG_9426, 9427, 9428, 9429, 9430)
#
# Or manually copy your 7 images to:
#   frontend/public/plant-growth/1.png  (soil)
#   frontend/public/plant-growth/2.png (sprout)
#   frontend/public/plant-growth/3.png
#   frontend/public/plant-growth/4.png
#   frontend/public/plant-growth/5.png (bud)
#   frontend/public/plant-growth/6.png
#   frontend/public/plant-growth/7.png  (full bloom)

mkdir -p frontend/public/plant-growth
echo "Place your 7 plant images in frontend/public/plant-growth/1.png through 7.png"
