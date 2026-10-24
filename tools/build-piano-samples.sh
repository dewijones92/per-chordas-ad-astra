#!/bin/sh
set -eu

ARCHIVE="${1:?usage: tools/build-piano-samples.sh <SalamanderGrandPianoV3+20161209_44khz16bit.tar.xz>}"
EXPECTED_SHA256=58750eb1366761e187f71ddb9b932355ea894d28ec4331e74ab8acb44c819936
SOURCE_URL=https://freepats.zenvoid.org/Piano/SalamanderGrandPiano/SalamanderGrandPianoV3+20161209_44khz16bit.tar.xz
OUT="$(cd "$(dirname "$0")/.." && pwd)/apps/web/public/piano"
LAYERS="p:4:40 mf:9:80 f:14:115"

actual=$(sha256sum "$ARCHIVE" | cut -d' ' -f1)
if [ "$actual" != "$EXPECTED_SHA256" ]; then
  echo "dewidebug piano samples: archive sha256 $actual is not the expected $EXPECTED_SHA256" >&2
  exit 1
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
patterns=""
for spec in $LAYERS; do
  layer=$(echo "$spec" | cut -d: -f2)
  patterns="$patterns --wildcards */44.1khz16bit/*v$layer.wav"
done
# shellcheck disable=SC2086
tar -xJf "$ARCHIVE" -C "$work" $patterns

rm -rf "$OUT"
mkdir -p "$OUT"
pitches=""
for spec in $LAYERS; do
  name=$(echo "$spec" | cut -d: -f1)
  layer=$(echo "$spec" | cut -d: -f2)
  for wav in "$work"/*/44.1khz16bit/*v"$layer".wav; do
    note=$(basename "$wav" | sed "s/v$layer\.wav$//")
    letter=$(echo "$note" | sed 's/[0-9]*$//')
    octave=$(echo "$note" | sed 's/^[A-G]#*//')
    case "$letter" in
      C) pc=0 ;; D#) pc=3 ;; F#) pc=6 ;; A) pc=9 ;;
      *) echo "dewidebug piano samples: unexpected note $note" >&2; exit 1 ;;
    esac
    midi=$((12 * (octave + 1) + pc))
    if [ "$midi" -lt 48 ]; then len=7; elif [ "$midi" -lt 72 ]; then len=5; else len=3.5; fi
    fade=$(awk "BEGIN { print $len - 0.5 }")
    ffmpeg -loglevel error -y -i "$wav" \
      -af "silenceremove=start_periods=1:start_threshold=-70dB,atrim=0:$len,afade=t=out:st=$fade:d=0.5,pan=mono|c0=0.5*c0+0.5*c1" \
      -c:a libopus -b:a 56k -ar 48000 "$OUT/$midi-$name.ogg"
    pitches="$pitches $midi"
  done
done

list=$(printf '%s\n' $pitches | sort -n | uniq | paste -sd, -)
cat > "$OUT/manifest.json" <<JSON
{
  "name": "Salamander Grand Piano V3 (Yamaha C5), 3 velocity layers, minor thirds",
  "author": "Alexander Holm",
  "licence": "CC BY 3.0 https://creativecommons.org/licenses/by/3.0/",
  "source": "$SOURCE_URL",
  "sha256": "$EXPECTED_SHA256",
  "pitches": [$list],
  "layers": [{ "name": "p", "velocity": 40 }, { "name": "mf", "velocity": 80 }, { "name": "f", "velocity": 115 }],
  "file": "{pitch}-{layer}.ogg"
}
JSON
(cd "$(dirname "$0")/.." && pnpm exec prettier --write "$OUT/manifest.json" >/dev/null)
count=$(find "$OUT" -name '*.ogg' | wc -l)
bytes=$(du -sb "$OUT" | cut -f1)
echo "dewidebug piano samples: wrote $count files, $bytes bytes, to $OUT"
