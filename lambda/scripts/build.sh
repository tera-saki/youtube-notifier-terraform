#!/bin/bash

set -eu

CURRENT_DIR=$(realpath "$(dirname "$0")")
LAMBDA_BASE_DIR=$(dirname "$CURRENT_DIR")

LAMBDA_NAME=$1
LAMBDA_DIR="$LAMBDA_BASE_DIR/$LAMBDA_NAME"

rm "$LAMBDA_DIR/dist/function.zip" || :
cd "$LAMBDA_DIR"
DIRS_TO_INCLUDE=("src")
if [ -d "$LAMBDA_DIR/config" ]; then
  DIRS_TO_INCLUDE+=("config")
fi
if [ -d "$LAMBDA_DIR/credentials" ]; then
  DIRS_TO_INCLUDE+=("credentials")
fi
zip -r "$LAMBDA_DIR/dist/function.zip" ${DIRS_TO_INCLUDE[@]}