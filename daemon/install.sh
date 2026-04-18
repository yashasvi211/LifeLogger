#!/usr/bin/env bash
# LifeLogger — install script
# Creates venv, installs deps, sets up systemd user services.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$HOME/.local/share/lifelogger"
CONFIG_DAEMON_DIR="$HOME/.config/lifelogger/daemon"
SYSTEMD_DIR="$HOME/.config/systemd/user"
VENV_DIR="$DATA_DIR/venv"

echo "==> LifeLogger installer"
echo "    Source:  $SCRIPT_DIR"
echo "    Data:    $DATA_DIR"

# ── 1. Ensure system deps ────────────────────────────────────────────────
echo ""
echo "==> Checking system dependencies..."
for cmd in xdotool xprintidle python3; do
    if ! command -v "$cmd" &>/dev/null; then
        echo "    ✗ $cmd not found. Install it:  sudo apt install $cmd"
        exit 1
    fi
    echo "    ✓ $cmd"
done

# ── 2. Create virtualenv & install Python deps ───────────────────────────
echo ""
echo "==> Setting up Python virtualenv at $VENV_DIR ..."
python3 -m venv --system-site-packages "$VENV_DIR"
"$VENV_DIR/bin/pip" install --quiet --upgrade pip
"$VENV_DIR/bin/pip" install --quiet -r "$SCRIPT_DIR/requirements.txt"
echo "    ✓ Dependencies installed"

# ── 3. Copy daemon source into config dir ─────────────────────────────────
echo ""
echo "==> Copying daemon files to $CONFIG_DAEMON_DIR ..."
mkdir -p "$CONFIG_DAEMON_DIR"
cp "$SCRIPT_DIR/server.py" "$CONFIG_DAEMON_DIR/"
cp "$SCRIPT_DIR/database.py" "$CONFIG_DAEMON_DIR/"
cp "$SCRIPT_DIR/window_watcher.py" "$CONFIG_DAEMON_DIR/"
echo "    ✓ Files copied"

# ── 4. Install systemd user services ─────────────────────────────────────
echo ""
echo "==> Installing systemd user services..."
mkdir -p "$SYSTEMD_DIR"
cp "$SCRIPT_DIR/lifelogger.service" "$SYSTEMD_DIR/"
cp "$SCRIPT_DIR/window-watcher.service" "$SYSTEMD_DIR/"

systemctl --user daemon-reload
systemctl --user enable lifelogger.service
systemctl --user enable window-watcher.service
echo "    ✓ Services enabled"

# ── 5. Start services ────────────────────────────────────────────────────
echo ""
echo "==> Starting services..."
systemctl --user start lifelogger.service
sleep 2
systemctl --user start window-watcher.service
echo "    ✓ Services started"

echo ""
echo "==> Done! LifeLogger is now running."
echo "    Daemon:   systemctl --user status lifelogger"
echo "    Watcher:  systemctl --user status window-watcher"
echo "    DB:       $DATA_DIR/lifelogger.db"
echo "    Logs:     journalctl --user -u lifelogger -f"
