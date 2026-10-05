# Rebuild the optimized transparent hero video

Run these commands from the repository root. The media tools are installed in a temporary directory; they are not application dependencies.

```bash
curl -L --fail -o /tmp/zur-hero-original.mp4 \
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260601_110537_3a579fa0-7bbc-4d94-9d25-0e816c7840f5.mp4'

npm install --prefix /tmp/zur-video-tools ffmpeg-static
python3 -m venv /tmp/zur-video-venv
/tmp/zur-video-venv/bin/pip install numpy opencv-python-headless Pillow

/tmp/zur-video-venv/bin/python scripts/prepare-landing-video.py \
  /tmp/zur-hero-original.mp4 packages/web/public/media \
  --ffmpeg /tmp/zur-video-tools/node_modules/ffmpeg-static/ffmpeg
```

Outputs:

- `packages/web/public/media/zur-bust.webm`: 500×540, 20 fps, transparent VP9, frequent keyframes for scrubbing.
- `packages/web/public/media/zur-bust-poster.webp`: a small transparent static fallback.

The background mask is tuned to this dark sculpture on its pale background. It preserves internal highlights, feathers the silhouette, and reduces color saturation to fit the app. Different footage requires a different mask or a segmentation model. Inspect motion and edges before replacing the production asset.

The page shows the poster first, loads video after it enters the viewport, limits desktop seeks to roughly 16 per second, and stops motion when offscreen. Reduced-motion visitors receive a static poster. Browsers that cannot decode VP9 keep the poster; alpha-video support varies by browser and must be checked on each supported platform.

This remains a video, with time scrubbing rather than physical 3D rotation. The actual 3D replacement has a separate [production brief](landing-3d-model-brief.md).
