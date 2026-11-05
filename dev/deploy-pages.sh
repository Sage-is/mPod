#!/bin/sh
# Puts dist/ on Cloudflare Pages. make deploy runs this through sage-secret, which supplies the token.
#   sh dev/deploy-pages.sh --ready    stop if the vault item is a stub or the tree has changes
#   sh dev/deploy-pages.sh PROJECT    upload dist/ to that existing Pages project
# master goes to production. Any other branch gets a preview address.
set -eu

WRANGLER="bunx wrangler@4.156.0"

# An empty token would fall through to whoever is logged in to wrangler on this Mac.
for value in "${CLOUDFLARE_API_TOKEN:-}" "${CLOUDFLARE_ACCOUNT_ID:-}"; do
  case "$value" in
    "" | REPLACE-ME | bw:*)
      echo "Fill the vault item cloudflare-startr-cloud-pages-deploy first." >&2
      exit 1
      ;;
  esac
done
if [ -n "$(git status --porcelain)" ]; then
  echo "Commit first: a deploy comes from a clean tree." >&2
  exit 1
fi
[ "$1" = "--ready" ] && exit 0

project=$1
# wrangler 4.156 hands "pages project create" to Workers, which fails with no Worker entry point.
# So a project is made once through the Pages API, with master as production (mpod: 2026-11-02).
if ! $WRANGLER pages project list --json | grep -q "\"$project\""; then
  echo "No Pages project named $project. Create it once through the Pages API, with master as production." >&2
  exit 1
fi
$WRANGLER pages deploy dist --project-name "$project" --branch "$(git rev-parse --abbrev-ref HEAD)"
