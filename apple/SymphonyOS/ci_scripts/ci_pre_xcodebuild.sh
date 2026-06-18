#!/bin/sh
set -e

# Xcode Cloud stamps each build with its own incrementing CI_BUILD_NUMBER, which
# started below the highest build (6) already uploaded to App Store Connect — so
# uploads fail with "bundle version must be higher than the previously uploaded
# version". Offset by 1000 so the build number always clears 6 and stays
# monotonically increasing for every future build.
BUILD_NUMBER=$((CI_BUILD_NUMBER + 1000))

INFO_PLIST="$CI_PRIMARY_REPOSITORY_PATH/apple/SymphonyOS/SymphonyOS/App/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD_NUMBER" "$INFO_PLIST"

echo "ci_pre_xcodebuild: set CFBundleVersion to $BUILD_NUMBER"
