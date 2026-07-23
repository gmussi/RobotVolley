#!/usr/bin/env bash
# Re-encode music assets to web-friendly sizes (requires ffmpeg).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/src/assets/audio"

if ! command -v ffmpeg >/dev/null; then
  echo "ffmpeg not found — install with: brew install ffmpeg"
  exit 1
fi

encode_mp3() {
  local src="$1"
  local dst="$2"
  local tmp="$DIR/.encode_tmp.mp3"
  cp "$src" "$tmp"
  ffmpeg -y -i "$tmp" -c:a libmp3lame -b:a 128k "$dst" -loglevel error
  rm -f "$tmp"
  echo "  MP3: $dst"
}

encode_ogg() {
  local src="$1"
  local dst="$2"
  ffmpeg -y -i "$src" -c:a libopus -b:a 96k "$dst" -loglevel error
  echo "  OGG: $dst"
}

for base in music_menu_loop music_match_a music_match_b; do
  src="$DIR/${base}.mp3"
  if [[ ! -f "$src" ]]; then
    echo "Skip $base (no source MP3)"
    continue
  fi
  echo "Encoding $base..."
  encode_mp3 "$src" "$src"
  encode_ogg "$src" "$DIR/${base}.ogg"
done

echo "Done."
ls -lh "$DIR"/music_menu_loop.* "$DIR"/music_match_a.* "$DIR"/music_match_b.* 2>/dev/null || true
