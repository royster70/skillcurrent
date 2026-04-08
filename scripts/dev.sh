#!/usr/bin/env bash
# Start backend (FastAPI) + frontend (Vite) in the background.
# Usage:
#   ./scripts/dev.sh start   # launch both, detached; logs -> .dev/
#   ./scripts/dev.sh stop    # kill both via PID files
#   ./scripts/dev.sh status  # show whether each is running
#   ./scripts/dev.sh logs    # tail both log files
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN_DIR="$ROOT/.dev"
mkdir -p "$RUN_DIR"

BACKEND_PID="$RUN_DIR/backend.pid"
FRONTEND_PID="$RUN_DIR/frontend.pid"
BACKEND_LOG="$RUN_DIR/backend.log"
FRONTEND_LOG="$RUN_DIR/frontend.log"

is_running() {
  local pidfile="$1"
  [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null
}

start_one() {
  local name="$1" pidfile="$2" logfile="$3" dir="$4" cmd="$5"
  if is_running "$pidfile"; then
    echo "[dev] $name already running (pid $(cat "$pidfile"))"
    return
  fi
  echo "[dev] starting $name -> $logfile"
  ( cd "$dir" && nohup $cmd >"$logfile" 2>&1 & echo $! >"$pidfile" )
}

stop_one() {
  local name="$1" pidfile="$2"
  if ! is_running "$pidfile"; then
    echo "[dev] $name not running"
    rm -f "$pidfile"
    return
  fi
  local pid; pid="$(cat "$pidfile")"
  echo "[dev] stopping $name (pid $pid)"
  kill "$pid" 2>/dev/null || true
  sleep 1
  kill -9 "$pid" 2>/dev/null || true
  rm -f "$pidfile"
}

status_one() {
  local name="$1" pidfile="$2"
  if is_running "$pidfile"; then
    echo "  $name: running (pid $(cat "$pidfile"))"
  else
    echo "  $name: stopped"
  fi
}

cmd="${1:-start}"
case "$cmd" in
  start)
    start_one backend  "$BACKEND_PID"  "$BACKEND_LOG"  "$ROOT/src/backend"  "uvicorn app.main:app --reload --port 8000"
    start_one frontend "$FRONTEND_PID" "$FRONTEND_LOG" "$ROOT/src/frontend" "npm run dev"
    echo "[dev] backend  :8000"
    echo "[dev] frontend :5173"
    echo "[dev] run './scripts/dev.sh logs' to tail, './scripts/dev.sh stop' to stop"
    ;;
  stop)
    stop_one frontend "$FRONTEND_PID"
    stop_one backend  "$BACKEND_PID"
    ;;
  restart)
    "$0" stop
    "$0" start
    ;;
  status)
    echo "[dev] status:"
    status_one backend  "$BACKEND_PID"
    status_one frontend "$FRONTEND_PID"
    ;;
  logs)
    tail -f "$BACKEND_LOG" "$FRONTEND_LOG"
    ;;
  *)
    echo "usage: $0 {start|stop|restart|status|logs}" >&2
    exit 2
    ;;
esac
