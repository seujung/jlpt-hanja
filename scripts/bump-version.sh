#!/bin/sh
# 배포 전에 실행합니다. index.html의 ?v= 값과 sw.js의 VERSION을 지금 시각으로 바꿉니다.
set -eu
cd "$(dirname "$0")/.."
V=$(date +%Y%m%d%H%M)
sed -i '' -E "s/\?v=[0-9]+/?v=$V/g" index.html
sed -i '' -E "s/^const VERSION = \"[0-9]+\";/const VERSION = \"$V\";/" sw.js
echo "version: $V"
