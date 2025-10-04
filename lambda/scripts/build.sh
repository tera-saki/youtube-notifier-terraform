#!/bin/bash
PARENT_DIR=$(realpath $(dirname "$0"))
LAMBDA_BASE_DIR=$(dirname "$PARENT_DIR")

LAMBDA_NAME=$1
LAMBDA_DIR="$LAMBDA_BASE_DIR/$LAMBDA_NAME"

cd "$LAMBDA_DIR"
yarn --production
rm -rf "$LAMBDA_DIR/dist"
mkdir -p "$LAMBDA_DIR/dist"
zip -r "$LAMBDA_DIR/dist/function.zip" ./