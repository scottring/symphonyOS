#!/bin/zsh
# Cuts the walk's tall overlook painting into the app's image sets.
#
#   apple/SymphonyOS/scripts/cut-overlook.sh <master.png>
#
# The master is the owner's 1:3 painting (2896 x 8688, summit to ledge; where it lives:
# PLANNING.md, "The art"). It never goes in the repository or the app. This writes, into
# SymphonyOS/App/Assets.xcassets:
#   - WalkOverlookTall: the whole painting at 2048 x 6144, for the walk (WalkArt.overlookTall);
#   - one square cut per everyday view (WalkArt.Cut), each a square of the painting in pixels.
# A `cut` line is: image set, the region's left and top as fractions of the painting's width
# and height, its width as a fraction of the painting's width (its height is a third of that,
# so it is square), and the cut's side in pixels. The numbers are WalkArt.Cut's, and a unit
# test (WalkArtCutTests) reads this file to keep the two the same.
set -euo pipefail

master=${1:?usage: cut-overlook.sh <master.png>}
here=${0:A:h}
assets=$here/../SymphonyOS/App/Assets.xcassets
quality=90
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

size=($(sips -g pixelWidth -g pixelHeight "$master" | awk '/pixel/ {print $2}'))
mw=${size[1]}; mh=${size[2]}
(( mh == 3 * mw )) || { print -u2 "the master must be three times as high as wide (got ${mw} x ${mh})"; exit 1; }

# Writes one image set holding one JPEG.
imageset() {
    local name=$1 png=$2 dir=$assets/$1.imageset file=${(L)1}.jpg
    rm -rf "$dir"; mkdir -p "$dir"
    sips -s format jpeg -s formatOptions $quality "$png" --out "$dir/$file" >/dev/null
    print -r -- "{
  \"images\" : [
    {
      \"filename\" : \"$file\",
      \"idiom\" : \"universal\"
    }
  ],
  \"info\" : {
    \"author\" : \"xcode\",
    \"version\" : 1
  }
}" > "$dir/Contents.json"
    print -r -- "$name: $(sips -g pixelWidth -g pixelHeight "$dir/$file" | awk '/pixel/ {printf "%s ", $2}')px, $(stat -f %z "$dir/$file") bytes"
}

# A square region of the master, scaled to `side` pixels.
cut() {
    local name=$1 left=$2 top=$3 width=$4 side=$5
    local x=$(( int(rint(left * mw)) )) y=$(( int(rint(top * mh)) )) w=$(( int(rint(width * mw)) ))
    (( x >= 0 && y >= 0 && x + w <= mw && y + w <= mh )) || { print -u2 "$name lies outside the painting"; exit 1; }
    ffmpeg -loglevel error -y -i "$master" -vf "crop=${w}:${w}:${x}:${y},scale=${side}:${side}:flags=lanczos" "$work/$name.png"
    imageset "$name" "$work/$name.png"
}

zmodload zsh/mathfunc

ffmpeg -loglevel error -y -i "$master" -vf "scale=2048:6144:flags=lanczos" "$work/WalkOverlookTall.png"
imageset WalkOverlookTall "$work/WalkOverlookTall.png"

#   image set                left    top     width   side
cut OverlookToday            0.000   0.620   1.000   2071
cut OverlookTodayShort       0.000   0.665   1.000   1500
cut OverlookWeek             0.200   0.498   0.800   2317
cut OverlookHalfOpenLaptop   0.000   0.220   1.000   2700
cut OverlookHalfOpenBook     0.000   0.215   1.000   2896
