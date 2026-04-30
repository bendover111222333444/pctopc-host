#!/usr/bin/env bash

PROJECT_DIR="$HOME/Downloads/pctopc-server-main (2)/pctopc-server-main"

cd "$PROJECT_DIR" || exit

if [ ! -d "node_modules" ]; then
echo "Installing dependencies..."
npm install
fi

echo "Starting server..."
npm start
