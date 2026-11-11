#!/usr/bin/env bash
cd "$(dirname "$0")"
while read -r cat repo; do
  [ -z "$repo" ] && continue
  dir="$cat/$(basename "$repo")"
  [ -d "$dir/.git" ] && { echo "deja $repo"; continue; }
  mkdir -p "$cat"
  git clone -q --depth 1 --filter=blob:limit=1m "https://github.com/$repo.git" "$dir" 2>/dev/null && echo "ok $repo" || echo "ECHEC $repo"
done < repos.txt
echo FIN
