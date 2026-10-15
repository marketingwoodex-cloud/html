#!/bin/bash
# usage: lh-run.sh <path> <name>   (needs ~/.cache/lh lighthouse + ~/.cache/pb chromium)
cd ~/.cache/lh
export CHROME_PATH=~/.cache/pb/al/chromium LD_LIBRARY_PATH=~/.cache/pb/al/lib
npx lighthouse "http://localhost:8080$1" --quiet --output=json --output-path=$2.json --chrome-flags="--headless=new --no-sandbox" --form-factor=mobile >/dev/null 2>&1
node -e 'const r=require("./'$2'.json"),c=r.categories,a=r.audits,s=k=>Math.round(c[k].score*100);console.log("'$2'","perf",s("performance"),"a11y",s("accessibility"),"bp",s("best-practices"),"seo",s("seo"),"| FCP",a["first-contentful-paint"].displayValue,"LCP",a["largest-contentful-paint"].displayValue,"TBT",a["total-blocking-time"].displayValue,"CLS",a["cumulative-layout-shift"].displayValue)'
