#!/usr/bin/env bash
# Archive a Release build and upload it to App Store Connect / TestFlight.
# Needs: Xcode signed in to the Apple Developer account, and the app record created in App Store Connect.
# Usage: ios/scripts/testflight.sh          (team 986GMWGB5V; override with DEVELOPMENT_TEAM=...)
set -euo pipefail
cd "$(dirname "$0")/.."

DEVELOPMENT_TEAM="${DEVELOPMENT_TEAM:-986GMWGB5V}"
BUILD_NUMBER="${BUILD_NUMBER:-$(date +%Y%m%d%H%M)}"   # must increase with every upload
ARCHIVE=build/ContractorOfficePro.xcarchive

xcodegen generate
rm -rf "$ARCHIVE" build/export

# Archive unsigned; the export step signs with Apple Distribution (no registered devices needed).
xcodebuild -scheme ContractorOfficePro -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM" CODE_SIGNING_ALLOWED=NO \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  archive

sed "s/TEAM_ID/$DEVELOPMENT_TEAM/" scripts/ExportOptions.plist > build/ExportOptions.plist
xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportOptionsPlist build/ExportOptions.plist -exportPath build/export \
  -allowProvisioningUpdates

echo "Uploaded build $BUILD_NUMBER. It appears in App Store Connect → TestFlight after processing (~5–15 min)."
