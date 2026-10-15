#!/bin/bash -eux

# Build one CI phase, leaving time to upload a checkpoint before the job limit.
_target_cpu="${1:-x86_64}"
_root_dir="$(dirname "$(greadlink -f "$0")")"
source "$_root_dir/devutils/shared.sh"
epoch_job_start="$(cat "$_root_dir/epoch_job_start.txt")"

# Leave one hour of the six-hour job limit for setup and artifact upload.
_remaining_time=$(( 360*60 - 60*60 - $(date +%s) + epoch_job_start ))

cd "$_src_dir"

echo "Build started at $(date +%s)" | tee -a "$_root_dir/build_times_${_target_cpu}.log"
echo "status=running" >> $GITHUB_OUTPUT

# A server that was started earlier (e.g. by "sccache --show-stats") keeps its old settings, so restart it here.
sccache --stop-server || true

if ! env | grep -q SCCACHE; then
    # The GitHub cache only works when the runner's cache variables are visible to this shell
    # (the workflow exports them). Without them sccache would fail every compile, so use its local disk cache instead.
    if [ -n "${ACTIONS_CACHE_URL:-}" ]; then
        export SCCACHE_GHA_ENABLED=on
        export SCCACHE_GHA_VERSION="${_target_cpu}"
    else
        echo "warn: GitHub cache variables not found, sccache uses a local cache only" >&2
    fi
fi

export SCCACHE_WEBDAV_KEY_PREFIX="${_target_cpu}"

# If GitHub's cache service is down, sccache can't start and every compile fails.
# Fall back to the local disk cache so the build can still finish.
if ! sccache --start-server; then
    echo "warn: GitHub cache unavailable, falling back to local sccache" >&2
    unset SCCACHE_GHA_ENABLED SCCACHE_GHA_VERSION
    sccache --stop-server || true
fi

_error_code=0
timeout -k 7m -s SIGTERM "${_remaining_time}s" \
    "$_root_dir/devutils/shared.sh" build chrome/installer/mac || _error_code=$?

[ "$_error_code" -eq 124 ] && exit 0
[ "$_error_code" -ne 0 ] && exit "$_error_code"

echo "Build finished at $(date +%s)" | tee -a "$_root_dir/build_finished_${_target_cpu}.log"
echo "status=finished" >> $GITHUB_OUTPUT
