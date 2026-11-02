#!/usr/bin/env bash
# Clean build caches after an iOS build (success or failure).
#
#   scripts/clean-ios-cache.sh            light clean (safe, run after any build)
#   scripts/clean-ios-cache.sh --deep     also remove ALL Xcode DerivedData, ios/Pods and the CocoaPods cache
#   scripts/clean-ios-cache.sh --dry-run  show what would be removed, delete nothing
#   scripts/clean-ios-cache.sh --deep --dry-run
#
# Never touches: your source code, node_modules, ios/ project files, Xcode Archives (.ipa sources),
# signing certificates or provisioning profiles.

set -u

DEEP=0
DRY=0
for arg in "$@"; do
    case "$arg" in
        --deep) DEEP=1 ;;
        --dry-run) DRY=1 ;;
        -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
        *) echo "Unknown option: $arg"; exit 1 ;;
    esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DERIVED="$HOME/Library/Developer/Xcode/DerivedData"
TMP="${TMPDIR:-/tmp}"

size_of() { [ -e "$1" ] && du -sh "$1" 2>/dev/null | cut -f1 || echo "-"; }

remove() {
    local target="$1"
    if [ ! -e "$target" ]; then return; fi
    printf '  %-8s %s\n' "$(size_of "$target")" "$target"
    if [ "$DRY" -eq 0 ]; then rm -rf "$target"; fi
}

if pgrep -x Xcode >/dev/null 2>&1; then
    echo "Note: Xcode is open. Close it first for the cleanest result."
fi

[ "$DRY" -eq 1 ] && echo "DRY RUN: nothing will be deleted." && echo

echo "Light clean:"
remove "$ROOT/ios/build"
remove "$ROOT/.expo/web"
for d in "$DERIVED"/CHRONOSCAPE-*; do remove "$d"; done
for d in "$TMP"/metro-* "$TMP"/haste-map-* "$TMP"/react-native-packager-cache-*; do remove "$d"; done

if [ "$DEEP" -eq 1 ]; then
    echo
    echo "Deep clean:"
    for d in "$DERIVED"/*; do remove "$d"; done
    remove "$ROOT/ios/Pods"
    remove "$HOME/Library/Caches/CocoaPods"
fi

echo
if [ "$DRY" -eq 1 ]; then
    echo "Dry run finished. Run again without --dry-run to delete."
else
    echo "Done."
    if [ "$DEEP" -eq 1 ]; then
        echo "Next: cd ios && pod install && cd ..   (or: npx expo prebuild --platform ios --clean)"
    fi
fi
