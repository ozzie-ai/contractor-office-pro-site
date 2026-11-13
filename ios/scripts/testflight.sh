#!/usr/bin/env bash
# Archive a Release build and upload it to App Store Connect / TestFlight.
# Needs: Xcode signed in to the Apple Developer account, and the app record created in App Store Connect.
# Usage: DEVELOPMENT_TEAM=ABCDE12345 ios/scripts/testflight.sh
set -euo pipefail
cd "$(dirname "$0")/.."

: "${DEVELOPMENT_TEAM:?Set DEVELOPMENT_TEAM to your 10-character Apple Team ID}"
BUILD_NUMBER="${BUILD_NUMBER:-$(date +%Y%m%d%H%M)}"   # must increase with every upload
ARCHIVE=build/ContractorOfficePro.xcarchive

xcodegen generate
rm -rf "$ARCHIVE" build/export

xcodebuild -scheme ContractorOfficePro -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM" CODE_SIGN_STYLE=Automatic \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  archive

sed "s/TEAM_ID/$DEVELOPMENT_TEAM/" scripts/ExportOptions.plist > build/ExportOptions.plist
xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportOptionsPlist build/ExportOptions.plist -exportPath build/export \
  -allowProvisioningUpdates

echo "Uploaded build $BUILD_NUMBER. It appears in App Store Connect → TestFlight after processing (~5–15 min)."
