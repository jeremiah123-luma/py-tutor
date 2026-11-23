#!/bin/bash
# Turns rendered orb frames (transparent PNGs from scripts/orb_scene.py) into the web loops in public/orb:
# each laid on the talk screen's exact background (#0B0B0B), H.264 for every browser, plus a poster frame.
# Usage: scripts/orb_encode.sh <render_dir>   (render_dir has idle/, thinking/, speaking/)
set -e
IN="$1"; OUT="$(dirname "$0")/../public/orb"; mkdir -p "$OUT"
for s in idle thinking speaking; do
  ffmpeg -v error -y -f lavfi -i color=c=0x0B0B0B:s=640x640:r=60 -framerate 60 -i "$IN/$s/f%04d.png" \
    -filter_complex "[0][1]overlay=shortest=1,format=yuv420p" -c:v libx264 -preset slow -crf 22 -profile:v high \
    -movflags +faststart -an "$OUT/$s.mp4"
  ffmpeg -v error -y -f lavfi -i color=c=0x0B0B0B:s=640x640 -i "$IN/$s/f0001.png" -filter_complex "[0][1]overlay" \
    -frames:v 1 -q:v 3 "$OUT/$s.jpg"
  echo "$s: $(du -h "$OUT/$s.mp4" | cut -f1)"
done
