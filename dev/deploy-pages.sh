#!/bin/sh
# Puts dist/ on Cloudflare Pages. make deploy runs this through sage-secret, which supplies the token.
#   sh dev/deploy-pages.sh --ready    stop if the vault item is a stub or the tree has changes
#   sh dev/deploy-pages.sh PROJECT    create the project if needed, then upload dist/
# master goes to production. Any other branch gets a preview address.
set -eu

WRANGLER="bunx wrangler@4.156.0"

# An empty token would fall through to whoever is logged in to wrangler on this Mac.
for value in "${CLOUDFLARE_API_TOKEN:-}" "${CLOUDFLARE_ACCOUNT_ID:-}"; do
  case "$value" in
    "" | REPLACE-ME | bw:*)
      echo "Fill the vault item cloudflare-sage-is-pages-deploy first." >&2
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
$WRANGLER pages project list --json | grep -q "\"$project\"" ||
  $WRANGLER pages project create "$project" --production-branch master
$WRANGLER pages deploy dist --project-name "$project" --branch "$(git rev-parse --abbrev-ref HEAD)"
