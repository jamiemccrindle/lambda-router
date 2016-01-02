#!/usr/bin/env bash

set -e

npm install
babel src --out-dir lib
npm prune --production
docker build -t lambda-router .
