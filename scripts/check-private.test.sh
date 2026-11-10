#!/usr/bin/env bash
# Proves check-private.sh passes public paths and fails private paths and ticket ids in commit messages.
set -euo pipefail
script="$(cd "$(dirname "$0")" && pwd)/check-private.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
failures=0

new_repo() {
  rm -rf "$work/repo"
  git init -q "$work/repo"
  cd "$work/repo"
  git config user.name test
  git config user.email test@example.com
  git config commit.gpgsign false
}

commit_path() {
  mkdir -p "$(dirname "$1")"
  echo x >"$1"
  git add -f "$1"
  git commit -q -m "$2"
}

expect() {
  local want=$1 label=$2 got
  shift 2
  if "$@" >/dev/null 2>&1; then got=pass; else got=fail; fi
  if [ "$got" = "$want" ]; then
    echo "ok    $want  $label"
  else
    echo "FAIL  expected $want, got $got  $label"
    failures=$((failures + 1))
  fi
}

for path in apps/web/next.config.ts next-env.d.ts docs/planner.md .env.example; do
  new_repo
  commit_path "$path" "[S1] chore(repo): add file"
  expect pass "$path" "$script"
done

for path in notes/x.md NEXT.md docs/PLAN.md CLAUDE.md AGENTS.md .claude/settings.json .env.local a.payload.json; do
  new_repo
  commit_path "$path" "[S1] chore(repo): add file"
  expect fail "$path" "$script"
done

new_repo
commit_path README.md "[S1] feat(pack): add encumbrance"
expect pass "commit message without a ticket id" "$script" HEAD

new_repo
commit_path README.md "[S1] feat(pack): add encumbrance for MOS-010"
expect fail "commit message with a ticket id" "$script" HEAD

[ "$failures" -eq 0 ] || exit 1
