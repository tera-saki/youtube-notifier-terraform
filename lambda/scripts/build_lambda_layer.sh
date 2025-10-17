#!/bin/bash

set -eu

CURRENT_DIR=$(realpath "$(dirname "$0")")
LAMBDA_BASE_DIR=$(dirname "$CURRENT_DIR")

LAMBDA_NAME=$1
LAMBDA_DIR="$LAMBDA_BASE_DIR/$LAMBDA_NAME"

TEMP_DIR=$(mktemp -d)
mkdir -p "$TEMP_DIR/nodejs"
cp "$LAMBDA_DIR"/{package.json,package-lock.json} "$TEMP_DIR/nodejs/"
cd "$TEMP_DIR/nodejs" && npm install --production
mkdir -p "$LAMBDA_DIR/dist"
cd "$TEMP_DIR"
rm "$LAMBDA_DIR/dist/layer.zip" || :
zip -r "$LAMBDA_DIR/dist/layer.zip" "nodejs/"
rm -rf "$TEMP_DIR"

