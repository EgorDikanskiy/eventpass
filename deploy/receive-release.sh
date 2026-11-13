#!/usr/bin/env bash
set -euo pipefail

[[ ${SSH_ORIGINAL_COMMAND:-} == deploy ]]
case "${1:-production}" in
  production) project=eventpass ;;
  staging) project=eventpass-staging ;;
  *) exit 1 ;;
esac

cd "/opt/$project"
frontend_image="$project-frontend:latest"
backend_image="$project-backend:latest"
exec 9>.release.lock
flock 9

release_dir=$(mktemp -d .release.XXXXXX)
trap 'rm -rf "$release_dir"' EXIT

tar -xf - -C "$release_dir" -- compose.yaml images.tar.gz
next_compose=(docker compose -p "$project" --project-directory "$PWD" -f "$release_dir/compose.yaml")
current_compose=(docker compose -p "$project" -f compose.yaml)
"${next_compose[@]}" config --quiet

previous_frontend=$(docker image inspect --format '{{.Id}}' "$frontend_image")
previous_backend=$(docker image inspect --format '{{.Id}}' "$backend_image")

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
  docker image tag "$previous_frontend" "$frontend_image"
  docker image tag "$previous_backend" "$backend_image"
  "${current_compose[@]}" up -d --no-build --pull never --wait --wait-timeout 120
  exit 1
fi
