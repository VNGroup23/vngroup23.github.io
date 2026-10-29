#!/usr/bin/env sh
# Builds the app and publishes dist/ to the gh-pages branch, which GitHub Pages serves.
set -e
cd "$(dirname "$0")/.."

ORIGIN="$(git remote get-url origin)"
NAME="$(git config user.name)"
EMAIL="$(git config user.email)"

npm run build
touch dist/.nojekyll

cd dist
git init -q -b gh-pages
git add -A
git -c user.name="$NAME" -c user.email="$EMAIL" commit -q -m "Deploy $(date '+%Y-%m-%d %H:%M')"
git push -f -q "$ORIGIN" gh-pages
rm -rf .git
echo "Deployed to gh-pages"
