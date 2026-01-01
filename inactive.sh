#!/bin/bash
# =============================================================================
# AutoSys Job Inactivation - SPEED OPTIMIZED
# =============================================================================
# Executes sendevent commands from .txt file with maximum parallelism.
# Optimized for SPEED: minimal logging, immediate failure CSV, fast retries.
#
# Usage: ./inactive.sh --file /path/to/commands.txt --threads 100 --retries 3
# =============================================================================

set -o pipefail

# =============================================================================
# CONFIGURATION (SPEED OPTIMIZED)
# =============================================================================
COMMANDS_FILE=""
NUM_THREADS=100          # HIGH thread count for speed
MAX_RETRIES=3
RETRY_DELAY=1            # FAST retry (1 second instead of 5)
DRY_RUN=false

# Paths
AUTOSYS_ENV="/mnt/ingestion/autosys/esl.env"
LOG_DIR="/mnt/ingestion/autosys/logs"
TEMP_DIR="/tmp/inactive_$$"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FAILURES_CSV="${LOG_DIR}/inactive_failures_${TIMESTAMP}.csv"
SUMMARY_LOG="${LOG_DIR}/inactive_summary_${TIMESTAMP}.log"

# =============================================================================
# PARSE ARGUMENTS
# =============================================================================
while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--file) COMMANDS_FILE="$2"; shift 2 ;;
        -t|--threads) NUM_THREADS="$2"; shift 2 ;;
        -r|--retries) MAX_RETRIES="$2"; shift 2 ;;
        -d|--dry-run) DRY_RUN=true; shift ;;
        -h|--help)
            echo "Usage: $(basename "$0") --file FILE [--threads N] [--retries N] [--dry-run]"
            echo "  -f, --file      Commands file (required)"
            echo "  -t, --threads   Parallel threads (default: 100)"
            echo "  -r, --retries   Max retries (default: 3)"
            echo "  -d, --dry-run   Print without executing"
            exit 0 ;;
        *) echo "Unknown: $1"; exit 1 ;;
    esac
done

[[ -z "$COMMANDS_FILE" ]] && { echo "ERROR: --file required"; exit 1; }
[[ ! -f "$COMMANDS_FILE" ]] && { echo "ERROR: File not found: $COMMANDS_FILE"; exit 1; }

# =============================================================================
# SETUP
# =============================================================================
mkdir -p "$LOG_DIR" "$TEMP_DIR"

# Source AutoSys environment
[[ -f "$AUTOSYS_ENV" ]] && source "$AUTOSYS_ENV"

# Initialize failures CSV with header
echo "timestamp,command,attempt,exit_code" > "$FAILURES_CSV"

# Count total commands
TOTAL_CMDS=$(wc -l < "$COMMANDS_FILE" | tr -d ' ')

echo "============================================================"
echo "  INACTIVE - SPEED OPTIMIZED"
echo "============================================================"
echo "  File:     $COMMANDS_FILE"
echo "  Commands: $TOTAL_CMDS"
echo "  Threads:  $NUM_THREADS"
echo "  Retries:  $MAX_RETRIES"
echo "  Started:  $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"

# =============================================================================
# WORKER FUNCTION (SPEED OPTIMIZED - MINIMAL LOGGING)
# =============================================================================
process_batch() {
    local batch_file=$1
    local thread_id=$2
    local result_file="${TEMP_DIR}/result_${thread_id}.txt"

    local success=0
    local failed=0

    while IFS= read -r cmd || [[ -n "$cmd" ]]; do
        [[ -z "$cmd" ]] && continue

        local attempt=0
        local done=false

        while [[ $attempt -lt $MAX_RETRIES ]] && [[ "$done" == "false" ]]; do
            ((attempt++))

            if [[ "$DRY_RUN" == "true" ]]; then
                done=true
                ((success++))
            else
                # Execute command
                eval "$cmd" >/dev/null 2>&1
                local exit_code=$?

                if [[ $exit_code -eq 0 ]]; then
                    done=true
                    ((success++))
                else
                    # IMMEDIATE failure logging to CSV (thread-safe with flock)
                    (
                        flock -x 200
                        echo "$(date '+%Y-%m-%d %H:%M:%S'),\"$cmd\",$attempt,$exit_code" >> "$FAILURES_CSV"
                    ) 200>"${TEMP_DIR}/.csv_lock"

                    if [[ $attempt -lt $MAX_RETRIES ]]; then
                        sleep $RETRY_DELAY
                    else
                        ((failed++))
                    fi
                fi
            fi
        done
    done < "$batch_file"

    # Write thread results
    echo "$success $failed" > "$result_file"
}

# =============================================================================
# DIVIDE INTO BATCHES
# =============================================================================
split -n l/$NUM_THREADS -d "$COMMANDS_FILE" "${TEMP_DIR}/batch_" 2>/dev/null || {
    # Fallback if split doesn't support -n
    local batch_size=$(( (TOTAL_CMDS + NUM_THREADS - 1) / NUM_THREADS ))
    split -l $batch_size -d "$COMMANDS_FILE" "${TEMP_DIR}/batch_"
}

# Count actual batches
BATCH_COUNT=$(ls -1 "${TEMP_DIR}"/batch_* 2>/dev/null | wc -l)
echo "Batches: $BATCH_COUNT"

# =============================================================================
# PARALLEL EXECUTION
# =============================================================================
START_TIME=$(date +%s)

# Launch all threads
pids=()
thread_id=0
for batch_file in "${TEMP_DIR}"/batch_*; do
    [[ -f "$batch_file" ]] || continue
    ((thread_id++))
    process_batch "$batch_file" "$thread_id" &
    pids+=($!)
done

echo "Launched $thread_id threads... waiting"

# Wait for all
for pid in "${pids[@]}"; do
    wait "$pid" 2>/dev/null
done

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

# =============================================================================
# AGGREGATE RESULTS
# =============================================================================
total_success=0
total_failed=0

for result_file in "${TEMP_DIR}"/result_*.txt; do
    [[ -f "$result_file" ]] || continue
    read -r s f < "$result_file"
    total_success=$((total_success + s))
    total_failed=$((total_failed + f))
done

# Count failures in CSV (excluding header)
csv_failures=$(($(wc -l < "$FAILURES_CSV") - 1))

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "============================================================"
echo "  COMPLETED"
echo "============================================================"
echo "  Total:    $TOTAL_CMDS"
echo "  Success:  $total_success"
echo "  Failed:   $total_failed"
echo "  Time:     ${ELAPSED}s"
echo "  Rate:     $(echo "scale=1; $TOTAL_CMDS / $ELAPSED" | bc 2>/dev/null || echo "N/A") cmds/sec"
echo "============================================================"

if [[ $total_failed -gt 0 ]]; then
    echo "  FAILURES: $FAILURES_CSV"
    echo ""
    echo "  First 5 failures:"
    tail -n +2 "$FAILURES_CSV" | head -5
fi

echo "============================================================"
echo "  Finished: $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"

# Write summary log
{
    echo "timestamp=$(date '+%Y-%m-%d %H:%M:%S')"
    echo "file=$COMMANDS_FILE"
    echo "total=$TOTAL_CMDS"
    echo "success=$total_success"
    echo "failed=$total_failed"
    echo "threads=$NUM_THREADS"
    echo "elapsed=${ELAPSED}s"
    echo "failures_csv=$FAILURES_CSV"
} > "$SUMMARY_LOG"

# Cleanup
rm -rf "$TEMP_DIR"

# Exit code
[[ $total_failed -gt 0 ]] && exit 1
exit 0
