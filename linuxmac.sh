#!/usr/bin/env bash

cd "$(dirname "$0")" || exit

NODE_BIN="$(command -v node)"

if [ -z "$NODE_BIN" ]; then
echo "Node.js not found in PATH."
echo "Install Node.js from https://nodejs.org"
exit 1
fi

if [ ! -d "node_modules" ]; then
echo "Installing dependencies..."
"$NODE_BIN" node_modules/npm/bin/npm-cli.js install
fi

echo "Starting server..."
"$NODE_BIN" node_modules/npm/bin/npm-cli.js start
