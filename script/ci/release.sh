#!/bin/bash -eu
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"; pwd)" # Figure out where the script is running
. "$SCRIPT_DIR"/lib/robust-bash.sh

require_env_var CI "This script must be run from CI. If you are running locally, note that it stamps your repo git settings."
require_env_var GITHUB_ACTOR
require_env_var NODE_AUTH_TOKEN


if [ ! -z "${ONLY_DOWNLOAD_PACT_FOR_WINDOWS:-}" ]; then 
    error "The environment variable ONLY_DOWNLOAD_PACT_FOR_WINDOWS is set"
    echo "   - you cannot run a release with this variable set"
    echo "     as only the windows binaries would be included"
    echo "*** STOPPING RELEASE PROCESS ***"
    exit 1
fi

# Setup git for github actions
git config user.email "${GITHUB_ACTOR}@users.noreply.github.com"
git config user.name "${GITHUB_ACTOR}"

# It's easier to read the release notes 
# from the standard version tool before it runs
RELEASE_NOTES="$(npx standard-version --dry-run | awk 'BEGIN { flag=0 } /^---$/ { if (flag == 0) { flag=1 } else { flag=2 }; next } flag == 1')"
# Don't release if there are no changes
if [ "$(echo "$RELEASE_NOTES" | wc -l)" -eq 1 ] ; then
    error "This release would have no release notes. Does it include changes?"
    echo "   - You must have at least one fix / feat commit to generate release notes"
    echo "*** STOPPING RELEASE PROCESS ***"
    exit 1
fi
# This is github actions' method for emitting multi-line values
RELEASE_NOTES="${RELEASE_NOTES//'%'/'%25'}"
RELEASE_NOTES="${RELEASE_NOTES//$'\n'/'%0A'}"
RELEASE_NOTES="${RELEASE_NOTES//$'\r'/'%0D'}"
echo "::set-output name=notes::$RELEASE_NOTES"

"$SCRIPT_DIR"/build-and-test-nix.sh
npm run release

# Emit version to next step
VERSION="$("$SCRIPT_DIR/lib/get-version.sh")"
echo "::set-output name=version::$VERSION"

"$SCRIPT_DIR"/lib/publish.sh

# Push the new commit back to the repo.
git push --follow-tags
