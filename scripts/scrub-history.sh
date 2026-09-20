#!/usr/bin/env bash
# One-time history scrub (Elliot, 2026-09-19): remove the two database dumps that
# contain client IP addresses from EVERY commit, verify the result, and print the
# exact commands to finish. This script never pushes and never touches your working
# copy: it works on a fresh clone in a temp folder. You run the final push yourself
# (force-push is on the deny list for agents, and is your call).
#
#   bash scripts/scrub-history.sh
#
# Preconditions: working tree clean, nothing committed while it runs.
set -euo pipefail
umask 077   # the work folder holds the addresses being scrubbed; keep it private

REPO="$(cd "$(dirname "$0")/.." && pwd)"
FILES=("backend/backup.sql" "backups/policypeek-db-2026-09-06.sql")
WORK="${TMPDIR:-/tmp}/policypeek-scrub-$(date +%Y%m%d-%H%M%S)"

cd "$REPO"
if [ -n "$(git status --porcelain)" ]; then echo "Working tree is not clean; commit or stash first." >&2; exit 1; fi
for f in "${FILES[@]}"; do
  if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then echo "$f is still tracked at HEAD; untrack it first." >&2; exit 1; fi
done

mkdir -p "$WORK"
echo "Working in $WORK"

# 1. Collect the addresses from the dumps, wherever they appear in history.
: > "$WORK/ips.txt"
for f in "${FILES[@]}"; do
  for c in $(git log --all --format=%H -- "$f"); do
    git show "$c:$f" 2>/dev/null | grep -oE '\b[0-9]{1,3}(\.[0-9]{1,3}){3}\b' >> "$WORK/ips.txt" || true
  done
done
sort -u "$WORK/ips.txt" -o "$WORK/ips.txt"
echo "Found $(wc -l < "$WORK/ips.txt" | tr -d ' ') distinct address(es) in the dumps (not printed)."

ORIG_TREE="$(git rev-parse 'HEAD^{tree}')"
ORIG_ORIGIN="$(git rev-parse origin/main 2>/dev/null || echo unknown)"

# 2. Rewrite a fresh clone.
git clone -q "$REPO" "$WORK/clean"
cd "$WORK/clean"
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f \
  --index-filter "git rm --cached --ignore-unmatch -q -- ${FILES[*]}" \
  --prune-empty --tag-name-filter cat -- --all >/dev/null 2>&1
for r in $(git for-each-ref --format='%(refname)' refs/original refs/remotes); do git update-ref -d "$r"; done
git reflog expire --expire=now --all
git gc -q --prune=now

# 3. Verify.
fail=0
touching="$(git log --all --oneline -- "${FILES[@]}" | wc -l | tr -d ' ')"
[ "$touching" = "0" ] || { echo "FAIL: $touching commit(s) still touch the dump files"; fail=1; }
hits=0
if [ -s "$WORK/ips.txt" ]; then
  for ip in $(cat "$WORK/ips.txt"); do
    # git grep exits 1 when nothing matches, which is the good outcome here.
    n="$(git grep -F -l "$ip" $(git rev-list --all) 2>/dev/null | wc -l | tr -d ' ' || true)"
    hits=$((hits + n))
  done
fi
[ "$hits" = "0" ] || { echo "FAIL: $hits revision(s) still contain a dumped address"; fail=1; }
NEW_TREE="$(git rev-parse 'HEAD^{tree}')"
[ "$ORIG_TREE" = "$NEW_TREE" ] || { echo "FAIL: final tree differs from your current HEAD"; fail=1; }
[ "$fail" = "0" ] || { echo "Verification failed; nothing was changed. Work folder: $WORK"; exit 1; }

echo "Verified: 0 commits touch the dumps, 0 revisions contain their addresses, final files identical."
echo "Commits: $(git -C "$REPO" rev-list --count HEAD) before, $(git rev-list --count HEAD) after."

cat <<MSG

NEXT (you run these; the push rewrites GitHub's history):

  # 1. check GitHub's current main equals what this was built against
  git -C "$REPO" ls-remote origin refs/heads/main        # expect: $ORIG_ORIGIN

  # 2. push the cleaned history (lease = only if GitHub is still at that commit)
  cd "$WORK/clean"
  git push --force-with-lease=main:$ORIG_ORIGIN "$(git -C "$REPO" remote get-url origin)" main

  # 3. point your working copy at the cleaned history (safe: your tree is clean)
  cd "$REPO"
  git fetch origin && git reset --hard origin/main
  git reflog expire --expire=now --all && git gc --prune=now

This only rewrites the branch it pushes (main). Check GitHub for any OTHER branches, tags
or pull-request refs that still hold the old history (run: git ls-remote origin) and delete
them, or the addresses stay reachable there. When finished, delete the work folder above.

Afterwards: old commits can stay reachable on GitHub by their hash for a while.
For full removal ask GitHub Support to purge cached views and dangling commits
(or delete and recreate the repository).
MSG
