#!/bin/bash
# Rebuild sandbox tools after a reset: chromium (pb), lighthouse (lh), sharp (sh)
set -e
mkdir -p ~/.cache/pb ~/.cache/lh ~/.cache/sh
cd ~/.cache/pb; [ -x al/chromium ] || { npm i -s @sparticuz/chromium puppeteer-core >/dev/null 2>&1; mkdir -p al; cd al
  for f in ../node_modules/@sparticuz/chromium/bin/*.br; do n=$(basename $f .br); node -e "const z=require('zlib'),fs=require('fs');fs.writeFileSync('$n',z.brotliDecompressSync(fs.readFileSync('$f')))"; done
  for t in *.tar; do tar xf $t; done; chmod +x chromium; cd ..; }
cp /home/user/-marketingwoodex/tools/phplint/p15-mob.mjs ~/.cache/pb/
cd ~/.cache/lh; [ -d node_modules/lighthouse ] || npm i -s lighthouse >/dev/null 2>&1
cp /home/user/-marketingwoodex/tools/phplint/lh-run.sh run.sh
cd ~/.cache/sh; [ -d node_modules/sharp ] || npm i -s sharp >/dev/null 2>&1
echo tools ready
