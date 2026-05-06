#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="$SCRIPT_DIR/node_path.txt"
FOUND_NODE=""

echo "=== Node.js Finder ==="
echo ""

# ─── Load config first ────────────────────────────────────────

if [ -f "$CONFIG" ]; then
    while IFS='=' read -r key value; do
        case "$key" in
            NODE_EXE) FOUND_NODE="$value" ;;
            NODE_DIR) NODE_DIR="$value" ;;
        esac
    done < "$CONFIG"

    if [ -n "$FOUND_NODE" ] && [ -f "$FOUND_NODE" ]; then
        if [ -f "$(dirname "$FOUND_NODE")/npm" ] || command -v npm &>/dev/null; then
            echo "Using cached Node from config"
        else
            FOUND_NODE=""
        fi
    else
        FOUND_NODE=""
    fi
fi

# ─── Find node ───────────────────────────────────────────────

if [ -z "$FOUND_NODE" ]; then
    if command -v node &>/dev/null; then
        FOUND_NODE="$(command -v node)"
    fi
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
    for dir in /usr /opt /home "$HOME"; do
        while IFS= read -r match; do
            if [ -f "$match" ]; then
                FOUND_NODE="$match"
                break 2
            fi
        done < <(find "$dir" -name "node" -type f 2>/dev/null)
    done
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

# ─── FIXED: safe version check (NO CRASH RISK) ───────────────

NODE_VERSION=""

if "$FOUND_NODE" --version >/dev/null 2>&1; then
    NODE_VERSION="$("$FOUND_NODE" --version 2>/dev/null | sed 's/v//')"
fi

NODE_MAJOR="$(echo "$NODE_VERSION" | cut -d. -f1)"

# Only enforce rule if we actually got a valid number
if [[ "$NODE_MAJOR" =~ ^[0-9]+$ ]]; then
    if [ "$NODE_MAJOR" -lt 16 ]; then
        echo "Skipping Node (too old): v$NODE_VERSION"
        FOUND_NODE=""
        exit 1
    fi
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
