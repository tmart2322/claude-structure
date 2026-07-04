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
# The wrapper holds the lock and spawns the command, which CO-HOLDS it via the
# inherited fd — the slot frees only when both are dead, and the kernel drops
# it the instant that happens (even kill -9): no stale locks, no TTL janitor.
# No FIFO queue: the reserved slot already prevents cross-repo starvation;
# shared slots go to whoever retries first (jittered poll ~8s; holds run
# minutes, so latency is noise).
#
# HISTORY: every acquire/release/timeout appends a JSON line (UTC timestamps)
# to ~/.claude/build-slots/history.jsonl — after a crash, acquires with no
# matching release are what was running when the machine died. While a slot is
# held, the wrapper also appends a resource sample every ~30s (node RSS,
# compressor, free-memory %), so slot concurrency can be correlated with real
# memory load to decide whether BUILD_SLOTS_SHARED can grow. Query it all with
# the user-global `build-slots` skill (displays times in the operator's tz).
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

# macOS ships no flock(1); python3 (Xcode CLT) holds the lock, spawns the
# command with the fd inherited (command co-holds the slot), waits, and logs
# the release — so history gets durations + exit codes, while a SIGKILL of
# either process still frees the slot via the kernel with no leak.
command -v python3 >/dev/null 2>&1 || {
  echo "[build-slot] WARNING: python3 not found — running UNGOVERNED: $*" >&2
  exec "$@"
}

exec python3 -c "$(cat <<'PY'
import fcntl, json, os, random, signal, subprocess, sys, time

slot_dir, repo, shared, timeout = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
cmd = sys.argv[5:]
cmd_s = " ".join(cmd)[:200]
candidates = ["reserved-%s.lock" % repo] + ["shared-%d.lock" % i for i in range(1, shared + 1)]
HIST = os.path.join(slot_dir, "history.jsonl")

def utc():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def log_event(**kw):
    # Append-only forensic log, UTC. O_APPEND + one small write = atomic enough.
    kw = dict(ts=utc(), pid=os.getpid(), repo=repo, **kw)
    try:
        if os.path.exists(HIST) and os.path.getsize(HIST) > 10 * 1024 * 1024:
            os.replace(HIST, HIST + ".1")
        with open(HIST, "a") as f:
            f.write(json.dumps(kw) + "\n")
    except OSError:
        pass  # forensics must never block the build

t_wait = time.time()
deadline = t_wait + timeout
last_log = 0.0
slot = fd = None

while slot is None:
    for name in candidates:
        f = os.open(os.path.join(slot_dir, name), os.O_CREAT | os.O_RDWR, 0o644)
        try:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            slot, fd = name, f
            break
        except OSError:
            os.close(f)
    if slot:
        break
    now = time.time()
    if now >= deadline:
        print("[build-slot] WARNING: no slot after %ds - running UNGOVERNED" % timeout, file=sys.stderr, flush=True)
        log_event(event="timeout-ungoverned", cmd=cmd_s, waitedSecs=int(now - t_wait))
        os.execvp(cmd[0], cmd)
    if now >= last_log + 30:
        holders = []
        for name in candidates:
            try:
                with open(os.path.join(slot_dir, name)) as hf:
                    holders.append("%s held by [%s]" % (name, hf.read().strip()))
            except OSError:
                pass
        print("[build-slot] waiting for a slot (repo=%s): %s" % (repo, "; ".join(holders) or "?"), file=sys.stderr, flush=True)
        last_log = now
    time.sleep(5 + random.random() * 5)

waited = int(time.time() - t_wait)
os.set_inheritable(fd, True)  # child co-holds the flock -> slot survives a wrapper SIGKILL

try:
    child = subprocess.Popen(cmd, close_fds=False)
except OSError as e:
    log_event(event="spawn-failed", slot=slot, cmd=cmd_s, error=str(e))
    print("[build-slot] cannot run %s: %s" % (cmd[0], e), file=sys.stderr)
    sys.exit(127)

os.ftruncate(fd, 0)
os.write(fd, ("pid=%d child=%d repo=%s at=%s cmd=%s\n" % (os.getpid(), child.pid, repo, utc(), cmd_s)).encode())
log_event(event="acquire", slot=slot, child=child.pid, cmd=cmd_s, waitedSecs=waited)
if waited:
    print("[build-slot] acquired %s after %ds wait" % (slot, waited), file=sys.stderr, flush=True)

def forward(sig, frame):
    try:
        child.send_signal(sig)
    except OSError:
        pass

for s in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
    signal.signal(s, forward)

def sample():
    # Resource snapshot for capacity analysis (best-effort; never blocks the build).
    try:
        out = subprocess.run(["ps", "-axo", "rss,command"], capture_output=True, text=True, timeout=10).stdout
        node_mb = sum(int(l.split(None, 1)[0]) for l in out.splitlines()[1:] if "node" in l) // 1024
        vm = subprocess.run(["vm_stat"], capture_output=True, text=True, timeout=10).stdout
        comp_mb = free_mb = None
        for l in vm.splitlines():
            if "occupied by compressor" in l:
                comp_mb = int(l.split(":")[1].strip().rstrip(".")) * 16384 // 1048576
            elif l.startswith("Pages free"):
                free_mb = int(l.split(":")[1].strip().rstrip(".")) * 16384 // 1048576
        mp = subprocess.run(["memory_pressure", "-Q"], capture_output=True, text=True, timeout=10).stdout
        free_pct = int(mp.rsplit(":", 1)[1].strip().rstrip("%")) if ":" in mp else None
        log_event(event="sample", slot=slot, child=child.pid, nodeRssMB=node_mb,
                  compressorMB=comp_mb, freeMB=free_mb, freePct=free_pct)
    except Exception:
        pass

t_run = time.time()
last_sample = 0.0
while child.poll() is None:
    if time.time() >= last_sample + 30:
        sample()
        last_sample = time.time()
    time.sleep(1)
rc = child.returncode
log_event(event="release", slot=slot, child=child.pid, cmd=cmd_s, exit=rc, heldSecs=int(time.time() - t_run))
sys.exit(rc if rc >= 0 else 128 - rc)
PY
)" "$SLOT_DIR" "$repo" "${BUILD_SLOTS_SHARED:-1}" "${BUILD_SLOT_TIMEOUT:-3600}" "$@"
