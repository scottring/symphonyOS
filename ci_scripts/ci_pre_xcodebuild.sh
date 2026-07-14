#!/bin/sh
set -e

# Xcode Cloud stamps each build with its own incrementing CI_BUILD_NUMBER (small
# integers: 14, 15, …). Those are BELOW manually-uploaded builds (100/101 and a
# 1200 API upload), so TestFlight treats them as older and never offers them as
# an update — the "stuck on an old build" bug (July 2026). Offset by 2000 so the
# build number always clears the highest existing build and stays monotonic.
#
# LOCATION MATTERS: because the Xcode project lives in a subfolder
# (apple/SymphonyOS), Xcode Cloud only runs ci_scripts from the REPOSITORY ROOT,
# not from next to the project. This file must stay at repo-root ci_scripts/.
BUILD_NUMBER=$((CI_BUILD_NUMBER + 2000))

INFO_PLIST="$CI_PRIMARY_REPOSITORY_PATH/apple/SymphonyOS/SymphonyOS/App/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD_NUMBER" "$INFO_PLIST"

echo "ci_pre_xcodebuild: set CFBundleVersion to $BUILD_NUMBER"
