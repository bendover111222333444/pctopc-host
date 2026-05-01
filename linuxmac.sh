#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="$SCRIPT_DIR/node_path.txt"
FOUND_NODE=""

echo "=== Node.js Finder ==="
echo ""

# ─── Find node ───────────────────────────────────────────────

if command -v node &>/dev/null; then
    FOUND_NODE="$(command -v node)"
fi

if [ -z "$FOUND_NODE" ]; then
    echo "node not in PATH, checking common locations..."
    for p in \
        "/usr/local/bin/node" \
        "/usr/bin/node" \
        "$HOME/.nvm/versions/node/*/bin/node" \
        "$HOME/.volta/bin/node" \
        "/opt/homebrew/bin/node"; do
        for match in $p; do
            if [ -f "$match" ]; then
                FOUND_NODE="$match"
                break 2
            fi
        done
    done
fi

if [ -z "$FOUND_NODE" ]; then
    echo "Not found in common locations, running full scan..."
    FOUND_NODE="$(find / -name "node" -type f 2>/dev/null | head -1)"
fi

if [ -z "$FOUND_NODE" ]; then
    echo "ERROR: node not found on this system."
    read -p "Press enter to exit..."
    exit 1
fi

# ─── Validate npm ────────────────────────────────────────────

NODE_DIR="$(dirname "$FOUND_NODE")"

echo "Found node: $FOUND_NODE"

if [ -f "$NODE_DIR/npm" ]; then
    NPM="$NODE_DIR/npm"
elif command -v npm &>/dev/null; then
    NPM="$(command -v npm)"
else
    echo "ERROR: npm not found."
    read -p "Press enter to exit..."
    exit 1
fi

# ─── Check node version 16+ ──────────────────────────────────

NODE_VERSION="$("$FOUND_NODE" --version | sed 's/v//')"
NODE_MAJOR="$(echo "$NODE_VERSION" | cut -d. -f1)"

if [ "$NODE_MAJOR" -lt 16 ]; then
    echo "ERROR: Node v$NODE_VERSION is too old. Version 16+ is required."
    read -p "Press enter to exit..."
    exit 1
fi

echo "Node v$NODE_VERSION OK"
echo "npm: $NPM"
echo ""

# ─── Save config ─────────────────────────────────────────────

{
    echo "NODE_DIR=$NODE_DIR"
    echo "NODE_EXE=$FOUND_NODE"
    echo "NPM=$NPM"
    echo "NODE_VERSION=$NODE_VERSION"
} > "$CONFIG"

echo "Saved config to: $CONFIG"

# ─── Set PATH for this session ───────────────────────────────

export PATH="$NODE_DIR:$PATH"

# ─── cd into project and run ─────────────────────────────────

cd "$SCRIPT_DIR" || exit 1

if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo "node_modules not found, running npm install..."
    "$NPM" install
    if [ $? -ne 0 ]; then
        echo "ERROR: npm install failed."
        read -p "Press enter to exit..."
        exit 1
    fi
else
    echo "node_modules already exists, skipping install."
fi

echo ""
echo "Starting project..."
unset ELECTRON_RUN_AS_NODE
npm start