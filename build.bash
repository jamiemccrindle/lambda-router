#!/usr/bin/env bash

set -e

# build the builder docker image
docker build -t builder-lambda-router .

# run builder docker image to build the 'run' image
# share the docker socket, executable and build key
docker run \
    -v ~/.ssh/id_rsa:/root/.ssh/id_rsa \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v $(which docker):/bin/docker builder-lambda-router
