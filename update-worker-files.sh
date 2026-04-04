#!/bin/bash
cp v5-svelte-migration/dist/index.html .
cp v5-svelte-migration/dist/index.html public/index.html
mkdir -p public/assets
cp v5-svelte-migration/dist/assets/* public/assets/
