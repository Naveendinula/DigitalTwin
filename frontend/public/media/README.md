# Media Assets for Demos

This directory holds the published demo clips and posters shown in the root `README.md`.

## Conventions
- MP4 files: `frontend/public/media/mp4/<feature>.mp4` (H.264, 30fps, 960x540–1280x720, ~800–1500 kbps).
- Posters: `frontend/public/media/posters/<feature>.png` (small, compressed).
- Suggested filenames (8 clips): `upload`, `structure-properties`, `focus`, `isolate`, `section-plane`, `view-presets`, `xray`, `ec-panel`.
- Source model: `frontend/uploads/00d5eddc_Ifc4_SampleHouse.ifc` (or note the model used if different).

## Capture & Optimization
1) Record raw takes (any resolution) into `media_sources/` at repo root.
2) Transcode with ffmpeg (example to 1280x720 @ 30fps):
```
ffmpeg -i input.mov -vf "scale=1280:-2,fps=30" -c:v libx264 -profile:v high -preset slow -crf 23 -b:v 1200k -c:a aac -b:a 96k output.mp4
```
3) Generate a poster PNG:
```
ffmpeg -i output.mp4 -ss 00:00:01.000 -vframes 1 poster.png
```
4) Place outputs into `mp4/` and `posters/` with the naming above.

## Replacement Workflow
- Re-record clips when UI changes; keep duration short (<15s) and focused on one feature.
- Verify playback locally with `npm run dev` (videos are served from `/media/...`).
- Keep files small to avoid bloating the repo; prefer trimming over higher bitrates.
