#!/usr/bin/env bash
# Runs contract unit tests and NEAR Sandbox integration tests (Linux, macOS, or WSL2).
# The first run downloads the sandbox node binary and compiles both contracts.
set -euo pipefail
cd "$(dirname "$0")/.."

cargo test -p trash-token -p trash-casino
# Each sandbox test starts its own local chain; limit parallelism to keep RAM sane.
cargo test -p integration-tests -- --test-threads="${SANDBOX_TEST_THREADS:-3}"
