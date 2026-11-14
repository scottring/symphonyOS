#!/bin/zsh
# Cuts the walk's tall overlook painting into the app's image sets.
#
#   apple/SymphonyOS/scripts/cut-overlook.sh <master.png>
#
# The master is the owner's 1:3 painting (2896 x 8688, summit to ledge; where it lives:
# PLANNING.md, "The art"). It never goes in the repository or the app. This writes, into
# SymphonyOS/App/Assets.xcassets:
#   - WalkOverlookTall: the whole painting at 2048 x 6144, the walk's backdrop (WalkBackdrop);
#   - one cut per everyday view (WalkArt.Cut): the part of that view's square frame that can show.
# A `cut` line is: image set; the region behind the whole frame (its left and top as fractions
# of the painting's width and height, and its width as a fraction of the painting's width: its
# height is a third of that, so it is square); the part of the frame that shows (left, top,
# width, height as fractions of the frame); and the whole frame's side in pixels. The image is
# side x shown in pixels. The numbers are WalkArt.Cut's, and a unit test (WalkArtCutTests) reads
# this file to keep the two the same. Each image set is written to a scratch folder and only
# replaces the catalog's once its image encoded.
set -euo pipefail
zmodload zsh/mathfunc

master=${1:?usage: cut-overlook.sh <master.png>}
[[ -f $master && -r $master ]] || { print -u2 "cannot read the master: $master"; exit 1; }
here=${0:A:h}
assets=$here/../SymphonyOS/App/Assets.xcassets
quality=90
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

size=($(sips -g pixelWidth -g pixelHeight "$master" 2>/dev/null | awk '/pixel/ {print $2}'))
(( ${#size} == 2 )) || { print -u2 "not an image sips can read: $master"; exit 1; }
mw=${size[1]}; mh=${size[2]}
(( mw > 0 && mh == 3 * mw )) || { print -u2 "the master must be three times as high as wide (got ${mw} x ${mh})"; exit 1; }

# Writes one image set holding one JPEG, swapping it into the catalog only once it is made.
imageset() {
    local name=$1 png=$2 file=${(L)1}.jpg
    local made=$work/$name.imageset
    mkdir -p "$made"
    sips -s format jpeg -s formatOptions $quality "$png" --out "$made/$file" >/dev/null
    [[ -s $made/$file ]] || { print -u2 "$name did not encode"; exit 1; }
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
}" > "$made/Contents.json"
    rm -rf "$assets/$name.imageset"
    mv "$made" "$assets/$name.imageset"
    print -r -- "$name: $(sips -g pixelWidth -g pixelHeight "$assets/$name.imageset/$file" | awk '/pixel/ {printf "%s ", $2}')px, $(stat -f %z "$assets/$name.imageset/$file") bytes"
}

# The shown part of a square region of the master, scaled to side x shown pixels.
cut() {
    local name=$1 left=$2 top=$3 width=$4 sx=$5 sy=$6 sw=$7 sh=$8 side=$9
    local frame=$(( width * mw ))
    local x=$(( int(rint(left * mw + sx * frame)) )) y=$(( int(rint(top * mh + sy * frame)) ))
    local w=$(( int(rint(sw * frame)) )) h=$(( int(rint(sh * frame)) ))
    local pw=$(( int(rint(side * sw)) )) ph=$(( int(rint(side * sh)) ))
    (( x >= 0 && y >= 0 && x + w <= mw && y + h <= mh )) || { print -u2 "$name lies outside the painting"; exit 1; }
    ffmpeg -loglevel error -y -i "$master" -vf "crop=${w}:${h}:${x}:${y},scale=${pw}:${ph}:flags=lanczos" "$work/$name.png"
    imageset "$name" "$work/$name.png"
}

ffmpeg -loglevel error -y -i "$master" -vf "scale=2048:6144:flags=lanczos" "$work/WalkOverlookTall.png"
imageset WalkOverlookTall "$work/WalkOverlookTall.png"

#   image set                left    top     width   shown: left  top    width  height  side
cut OverlookToday            0       0.620   1       0.046  0      0.908  1       1456
cut OverlookTodayWide        0       0.7167  0.85    0.046  0      0.908  0.718   2071
cut OverlookTodayShort       0       0.683   0.95    0.034  0.068  0.932  0.932   1500
cut OverlookWeek             0.2     0.498   0.8     0.214  0.471  0.558  0.389   2317
cut OverlookWeekWide         0.2     0.5243  0.8     0.214  0.471  0.558  0.225   2317
cut OverlookHalfOpenLaptop   0       0.220   1       0.152  0.133  0.696  0.496   2700
cut OverlookHalfOpenBook     0       0.215   1       0.33   0.15   0.446  0.729   2896
