#!/usr/bin/env bash
# Fails when private files are tracked or private words appear in tracked files or commit messages.
# Usage: check-private.sh [git-log revision args]
set -euo pipefail
PATHS='(^|/)(notes|research|\.claude|\.cursor)/|(^|/)(NEXT|PRD|PLANS?|DECISIONS?|PITCH|SCORECARD|HANDBOOK|SPRINTS?|CLAUDE|AGENTS)([-_.][^/]*)?\.md$|(^|/)\.env(\.[^/]*)?$|\.payload\.json$'
WORDS='hackathon-kit|hackathon-foundation|kit-check|judg(e|ing)|ETHGlobal|Colosseum|withnakama|\(memory|notes/|SPRINTS|(^|[^[:alnum:]_])(MOS|OWN|CP)-[0-9]{2,3}|(^|[^[:alnum:]_])[DQ]-[0-9]{2}([^[:alnum:]]|$)'
fail=0
bad=$(git ls-files | grep -iE "$PATHS" | grep -vE '(^|/)\.env\.example$' || true)
if [ -n "$bad" ]; then echo "private path tracked:"; echo "$bad"; fail=1; fi
hits=$(git grep -nIiE "$WORDS" -- . ':(exclude)scripts/check-private.sh' ':(exclude)scripts/check-private.test.sh' || true)
if [ -n "$hits" ]; then echo "private word in tracked file:"; echo "$hits"; fail=1; fi
if [ "$#" -gt 0 ]; then
  msgs=$(git log --format=%B "$@" | grep -iE "$WORDS" || true)
  if [ -n "$msgs" ]; then echo "private word in commit message:"; echo "$msgs"; fail=1; fi
fi
exit "$fail"
