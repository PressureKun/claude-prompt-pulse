#!/bin/sh
# Rebuilds the README screenshots in docs/: runs scenes.tsx against the mod in
# a scratch copy, then renders what it printed to PNG with headless Chrome.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
mod=$(cd "$here/../.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

rsync -a --exclude .git --exclude docs --exclude tests "$mod/" "$work/mod/"
mkdir -p "$work/mod/tests"
cp "$here/scenes.tsx" "$work/mod/tests/scenes.test.tsx"
claude plugin test "$work/mod" > "$work/out.txt" 2>&1 || { cat "$work/out.txt"; exit 1; }

python3 -I "$here/render.py" "$work/out.txt" "$mod/docs" "$work/html"
