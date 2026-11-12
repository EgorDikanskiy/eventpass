#!/usr/bin/env bash
set -euo pipefail

[[ ${SSH_ORIGINAL_COMMAND:-} == deploy ]]
cd /opt/eventpass
exec 9>.release.lock
flock 9

release_dir=$(mktemp -d .release.XXXXXX)
trap 'rm -rf "$release_dir"' EXIT

tar -xf - -C "$release_dir" -- compose.yaml images.tar.gz
next_compose=(docker compose --project-directory "$PWD" -f "$release_dir/compose.yaml")
current_compose=(docker compose -f compose.yaml)
"${next_compose[@]}" config --quiet

previous_frontend=$(docker image inspect --format '{{.Id}}' eventpass-frontend:latest)
previous_backend=$(docker image inspect --format '{{.Id}}' eventpass-backend:latest)

check_frontend() {
  local frontend_address
  frontend_address=$("${next_compose[@]}" port frontend 80) || return 1
  curl --fail --fail-early --silent --show-error --retry 5 --retry-connrefused --max-time 5 \
    --output /dev/null "http://$frontend_address/" \
    --output /dev/null "http://$frontend_address/api/health"
}

if docker image load -i "$release_dir/images.tar.gz" \
  && rm "$release_dir/images.tar.gz" \
  && "${next_compose[@]}" up -d --no-build --pull missing --wait --wait-timeout 120 \
  && check_frontend \
  && mv "$release_dir/compose.yaml" compose.yaml; then
  dangling_images=$(docker image ls --quiet --no-trunc --filter dangling=true)
  for image_id in "$previous_frontend" "$previous_backend"; do
    if grep -Fxq "$image_id" <<< "$dangling_images"; then
      docker image rm "$image_id" || true
    fi
  done
else
  echo 'Deployment failed. Restoring the previous EventPass images.' >&2
  docker image tag "$previous_frontend" eventpass-frontend:latest
  docker image tag "$previous_backend" eventpass-backend:latest
  "${current_compose[@]}" up -d --no-build --pull never --wait --wait-timeout 120
  exit 1
fi
