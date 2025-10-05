#!/bin/bash

set -eu -o pipefail

CURRENT_DIR=$(realpath "$(dirname "$0")")
LAMBDA_BASE_DIR=$(dirname "$CURRENT_DIR")

LAMBDA_NAME=$1
LAMBDA_DIR="$LAMBDA_BASE_DIR/$LAMBDA_NAME"

rm "$LAMBDA_DIR/dist/function.zip" || :
cd "$LAMBDA_DIR"
zip -r "$LAMBDA_DIR/dist/function.zip" ./{config,credentials,src}