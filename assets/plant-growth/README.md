# Plant growth images – uncropped versions

The current images in `frontend/public/plant-growth/` were cropped. Replace them with your **uncropped** originals.

## Quick replace

1. **Copy your 7 uncropped images** into this folder (`assets/plant-growth/`).

2. **Name them** so the script can find them (any of these patterns works):
   - `IMG_9424.png` or `IMG_9424-anything.png` → becomes 1.png (soil)
   - `IMG_9425.png` or `IMG_9425-anything.png` → becomes 2.png (sprout)
   - `IMG_9426.png` or `IMG_9426-anything.png` → becomes 3.png (sprout + leaves)
   - `IMG_9427.png` or `IMG_9427-anything.png` → becomes 4.png (more leaves)
   - `IMG_9428.png` or `IMG_9428-anything.png` → becomes 5.png (flower bud)
   - `IMG_9429.png` or `IMG_9429-anything.png` → becomes 6.png (taller bud)
   - `IMG_9430.png` or `IMG_9430-anything.png` → becomes 7.png (full bloom)

3. **Run the script:**
   ```bash
   chmod +x scripts/replace-plant-images.sh
   ./scripts/replace-plant-images.sh
   ```

## Manual replace

Or copy them directly into `frontend/public/plant-growth/` as `1.png` through `7.png` in that order.
