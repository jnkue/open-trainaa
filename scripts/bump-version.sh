#!/bin/bash
set -euo pipefail

# Version bump script for the trainaa monorepo.
# Updates all version references across backend, app, and landing.
#
# Usage:
#   ./scripts/bump-version.sh <new-version>
#   ./scripts/bump-version.sh <new-version> --min-supported <min-version>
#
# Examples:
#   ./scripts/bump-version.sh 1.0.4
#   ./scripts/bump-version.sh 1.0.4 --min-supported 1.0.1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Parse arguments
NEW_VERSION=""
MIN_SUPPORTED=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --min-supported)
            MIN_SUPPORTED="$2"
            shift 2
            ;;
        -*)
            echo "Unknown option: $1"
            exit 1
            ;;
        *)
            if [[ -z "$NEW_VERSION" ]]; then
                NEW_VERSION="$1"
            else
                echo "Unexpected argument: $1"
                exit 1
            fi
            shift
            ;;
    esac
done

if [[ -z "$NEW_VERSION" ]]; then
    echo "Usage: $0 <new-version> [--min-supported <min-version>]"
    echo "Example: $0 1.0.4"
    exit 1
fi

# Validate semver format (basic check: X.Y.Z)
if ! echo "$NEW_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "Error: Version must be in semver format (X.Y.Z), got: $NEW_VERSION"
    exit 1
fi

# Read current min supported version if not overriding
if [[ -z "$MIN_SUPPORTED" ]]; then
    MIN_SUPPORTED=$(python3 -c "import json; print(json.load(open('$ROOT_DIR/version.config.json'))['minSupportedVersion'])")
fi

if ! echo "$MIN_SUPPORTED" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "Error: Min supported version must be in semver format (X.Y.Z), got: $MIN_SUPPORTED"
    exit 1
fi

echo "Bumping version to $NEW_VERSION (min supported: $MIN_SUPPORTED)"
echo ""

# 1. Update version.config.json
python3 -c "
import json
config = json.load(open('$ROOT_DIR/version.config.json'))
config['appVersion'] = '$NEW_VERSION'
config['minSupportedVersion'] = '$MIN_SUPPORTED'
with open('$ROOT_DIR/version.config.json', 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')
"
echo "  Updated version.config.json"

# 2. Update backend pyproject.toml
sed -i '' "s/^version = \".*\"/version = \"$NEW_VERSION\"/" "$ROOT_DIR/src/backend/pyproject.toml"
echo "  Updated src/backend/pyproject.toml"

# 3. Update backend version.py
cat > "$ROOT_DIR/src/backend/api/version.py" << EOF
# Version constants - managed by ./dev.sh bump <version>
# Do not edit manually. Use the bump script to update all version references.

APP_VERSION = "$NEW_VERSION"
MIN_SUPPORTED_VERSION = "$MIN_SUPPORTED"
EOF
echo "  Updated src/backend/api/version.py"

# 4. Update app package.json (sed to preserve formatting)
sed -i '' 's/"version": ".*"/"version": "'"$NEW_VERSION"'"/' "$ROOT_DIR/src/app/package.json"
echo "  Updated src/app/package.json"

# 5. Update app version constant
cat > "$ROOT_DIR/src/app/constants/version.ts" << EOF
// Version constants - managed by ./dev.sh bump <version>
// Do not edit manually. Use the bump script to update all version references.
export const APP_VERSION = "$NEW_VERSION";

export const getAppVersion = (): string => {
  return APP_VERSION;
};
EOF
echo "  Updated src/app/constants/version.ts"

# 6. Update landing package.json (sed to preserve formatting)
sed -i '' 's/"version": ".*"/"version": "'"$NEW_VERSION"'"/' "$ROOT_DIR/src/landing/package.json"
echo "  Updated src/landing/package.json"

# 7. Run expo prebuild to sync native projects (iOS Info.plist, etc.)
if command -v bunx &> /dev/null; then
    (cd "$ROOT_DIR/src/app" && bunx expo prebuild --no-install)
    echo "  Ran expo prebuild (native files synced)"
else
    echo "  Warning: bunx not found, skipping expo prebuild. Run 'cd src/app && bunx expo prebuild' manually."
fi

#7. Run uv sync to update version in uv.lock
if command -v uv &> /dev/null; then
    (cd "$ROOT_DIR/src/backend" && uv sync)
    echo "  Ran uv sync (uv.lock updated)"
else
    echo "  Warning: uv not found, skipping uv sync. Run 'cd src/backend && uv sync' manually."
fi

echo ""
echo "All versions bumped to $NEW_VERSION"
echo "Min supported version: $MIN_SUPPORTED"
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff"
echo "  2. Commit: git commit -am 'chore: bump version to $NEW_VERSION'"
echo "  3. Open PR to main"
