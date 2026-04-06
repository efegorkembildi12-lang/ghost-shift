#!/usr/bin/env bash
# Prepares /tmp/gs-demo for the VHS demo recording.
# Run once before: vhs assets/demo.tape
set -e

rm -rf /tmp/gs-demo
mkdir /tmp/gs-demo
cd /tmp/gs-demo

git init -q
git config user.email demo@ghostshift.dev
git config user.name Demo

echo 'const token = read();' > auth.ts
git add auth.ts
git commit -q -m 'initial commit'

sed -i '' 's/const token/const parsedToken/' auth.ts
git add auth.ts
git commit -q -m 'rename auth variable'

echo "Demo repo ready at /tmp/gs-demo"
