#!/usr/bin/env bash
# Fails when a pull request title breaks the commit subject format or the title or body holds a
# private word. Reads PR_TITLE and PR_BODY; the word list comes from check-private.sh.
set -euo pipefail
words=$(sed -n "s/^WORDS='\(.*\)'\$/\1/p" "$(dirname "$0")/check-private.sh")
[ -n "$words" ] || { echo "word list missing from check-private.sh"; exit 1; }
subject='^\[S[1-6]\] (feat|fix|refactor|perf|test|docs|build|ci|chore|style|ui)\([a-z0-9-]+\): .+$'
fail=0
if ! grep -qE "$subject" <<<"$PR_TITLE"; then
  echo "title must match $subject"
  fail=1
fi
if printf '%s\n%s\n' "$PR_TITLE" "${PR_BODY:-}" | grep -iE "$words"; then
  echo "private word in title or body"
  fail=1
fi
exit "$fail"
