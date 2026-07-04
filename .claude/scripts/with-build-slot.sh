#!/usr/bin/env bash
# with-build-slot.sh — machine-global governor for heavy toolchain bursts.
#
# Usage:  .claude/scripts/with-build-slot.sh <command> [args...]
#   e.g.  .claude/scripts/with-build-slot.sh pnpm install --prefer-offline
#
# WHY: agent-concurrency caps are per-workflow/per-session and don't compose —
# two repos each running a "safe" fleet still sum to an unsafe machine-wide
# load. Three kernel panics (Jun 15/16, Jul 3 2026) came from exactly that:
# ~31 GB of concurrent node demand on a 16 GB machine starved WindowServer
# until the watchdog rebooted the box. This wrapper makes the heavy bursts
# (installs, test suites, typechecks, builds) QUEUE machine-wide instead of
# stacking. Waiting is the feature — run longer, not hotter.
#
# HOW: slot files under ~/.claude/build-slots/, locked with flock(2):
#   reserved-<repo>.lock — one per repo: a repo can ALWAYS make progress
#   shared-N.lock        — floating pool (default 1): a lone repo runs hotter
# flock releases the instant the holder process dies — even kill -9 — so
# there are no stale locks and no TTL janitor. No FIFO queue: the reserved
# slot already prevents cross-repo starvation; shared slots go to whoever
# retries first (jittered poll ~8s; holds run minutes, so latency is noise).
#
# Knobs (env): BUILD_SLOT_DIR · BUILD_SLOTS_SHARED (default 1) ·
#   BUILD_SLOT_TIMEOUT (secs, default 3600 — on timeout WARN + run ungoverned;
#   never deadlock a phase) · BUILD_SLOT_REPO (identity override) ·
#   BUILD_SLOT_NODE_HEAP (MB, default 2048; 0 = leave NODE_OPTIONS alone).
set -euo pipefail

[ $# -ge 1 ] || { echo "usage: with-build-slot.sh <command> [args...]" >&2; exit 2; }

SLOT_DIR="${BUILD_SLOT_DIR:-$HOME/.claude/build-slots}"
mkdir -p "$SLOT_DIR"

# Repo identity must be the MAIN repo, not the worktree: builders run in
# .claude/worktrees/wf_*, and if each worktree counted as its own repo, every
# builder would grant itself a "reserved" slot and the governor would govern
# nothing. --git-common-dir points at the main .git even from a linked worktree.
if [ -z "${BUILD_SLOT_REPO:-}" ]; then
  common="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
  if [ -n "$common" ]; then
    BUILD_SLOT_REPO="$(basename "$(dirname "$common")")"
  else
    BUILD_SLOT_REPO="$(basename "$PWD")"
  fi
fi
repo="$(printf '%s' "$BUILD_SLOT_REPO" | tr -c 'a-zA-Z0-9_.-' '-')"

# Belt for the same incident: cap node heaps + vitest workers so one slot has
# a predictable footprint (a default vitest run forks one worker per core).
if [ "${BUILD_SLOT_NODE_HEAP:-2048}" != "0" ] && [[ "${NODE_OPTIONS:-}" != *max-old-space-size* ]]; then
  export NODE_OPTIONS="--max-old-space-size=${BUILD_SLOT_NODE_HEAP:-2048}${NODE_OPTIONS:+ $NODE_OPTIONS}"
fi
export VITEST_MAX_FORKS="${VITEST_MAX_FORKS:-2}" VITEST_MAX_THREADS="${VITEST_MAX_THREADS:-2}"

# macOS ships no flock(1); python3 (Xcode CLT) does acquire+exec in ONE
# process: the flock'd fd (made inheritable) survives execvp, so the kernel
# holds the slot for the command's exact lifetime and no longer.
command -v python3 >/dev/null 2>&1 || {
  echo "[build-slot] WARNING: python3 not found — running UNGOVERNED: $*" >&2
  exec "$@"
}

exec python3 -c "$(cat <<'PY'
import fcntl, os, random, sys, time

slot_dir, repo, shared, timeout = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
cmd = sys.argv[5:]
candidates = ["reserved-%s.lock" % repo] + ["shared-%d.lock" % i for i in range(1, shared + 1)]
deadline = time.time() + timeout
last_log = 0.0

while True:
    for name in candidates:
        fd = os.open(os.path.join(slot_dir, name), os.O_CREAT | os.O_RDWR, 0o644)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            os.close(fd)
            continue
        os.ftruncate(fd, 0)
        os.write(fd, ("pid=%d repo=%s cmd=%s\n" % (os.getpid(), repo, " ".join(cmd)[:160])).encode())
        os.set_inheritable(fd, True)  # keep the flock across execvp
        os.execvp(cmd[0], cmd)
    now = time.time()
    if now >= deadline:
        print("[build-slot] WARNING: no slot after %ds - running UNGOVERNED" % timeout, file=sys.stderr, flush=True)
        os.execvp(cmd[0], cmd)
    if now >= last_log + 30:
        holders = []
        for name in candidates:
            try:
                with open(os.path.join(slot_dir, name)) as f:
                    holders.append("%s held by [%s]" % (name, f.read().strip()))
            except OSError:
                pass
        print("[build-slot] waiting for a slot (repo=%s): %s" % (repo, "; ".join(holders) or "?"), file=sys.stderr, flush=True)
        last_log = now
    time.sleep(5 + random.random() * 5)
PY
)" "$SLOT_DIR" "$repo" "${BUILD_SLOTS_SHARED:-1}" "${BUILD_SLOT_TIMEOUT:-3600}" "$@"
