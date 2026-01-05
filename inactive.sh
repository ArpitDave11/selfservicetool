#!/bin/bash
# =============================================================================
# AutoSys Job Inactivation - Parallel Execution
# =============================================================================
# Location: /mnt/ingestion/autosys/inactive.sh
# Trigger:  sendevent -E FORCE_STARTJOB -J <job_name>
# =============================================================================

set +u
set +e
export AUTOSYS_CSUTILS="${AUTOSYS_CSUTILS:-}"
export AUTOUSER="${AUTOUSER:-}"
export AUTOSYS="${AUTOSYS:-}"
export AUTOSERV="${AUTOSERV:-}"

# =============================================================================
# FIXED CONFIGURATION
# =============================================================================
SCRIPT_DIR="/mnt/ingestion/autosys"
COMMANDS_FILE="${SCRIPT_DIR}/inactive_commands.txt"
LOG_DIR="${SCRIPT_DIR}/logs"
NUM_THREADS=100
MAX_RETRIES=3
RETRY_DELAY=1

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
mkdir -p "$LOG_DIR" 2>/dev/null || LOG_DIR="/tmp"
TEMP_DIR=$(mktemp -d /tmp/inactive_XXXXXX)
FAILURES_CSV="${LOG_DIR}/inactive_failures_${TIMESTAMP}.csv"

cleanup() { rm -rf "$TEMP_DIR" 2>/dev/null; }
trap cleanup EXIT

# =============================================================================
# VALIDATION
# =============================================================================
if [ ! -f "$COMMANDS_FILE" ]; then
    echo "ERROR: $COMMANDS_FILE not found"
    exit 1
fi

if [ ! -s "$COMMANDS_FILE" ]; then
    echo "ERROR: $COMMANDS_FILE is empty"
    exit 1
fi

TOTAL_CMDS=$(wc -l < "$COMMANDS_FILE" | tr -d ' ')
echo "Starting: $TOTAL_CMDS commands"
echo "timestamp,command,attempt,exit_code" > "$FAILURES_CSV"

# =============================================================================
# WORKER FUNCTION
# =============================================================================
process_batch() {
    set +u; set +e
    batch_file="$1"
    thread_id="$2"
    result_file="${TEMP_DIR}/result_${thread_id}.txt"
    success=0; failed=0

    while IFS= read -r cmd || [ -n "$cmd" ]; do
        [ -z "$cmd" ] && continue
        attempt=0; done_flag=false

        while [ $attempt -lt $MAX_RETRIES ] && [ "$done_flag" = "false" ]; do
            attempt=$((attempt + 1))
            if eval "$cmd" >/dev/null 2>&1; then
                done_flag=true
                success=$((success + 1))
            else
                exit_code=$?
                echo "$(date '+%Y-%m-%d %H:%M:%S'),\"$cmd\",$attempt,$exit_code" >> "${TEMP_DIR}/fail_${thread_id}.csv"
                [ $attempt -lt $MAX_RETRIES ] && sleep $RETRY_DELAY || failed=$((failed + 1))
            fi
        done
    done < "$batch_file"
    echo "$success $failed" > "$result_file"
}

export -f process_batch
export TEMP_DIR MAX_RETRIES RETRY_DELAY

# =============================================================================
# PARALLEL EXECUTION
# =============================================================================
batch_size=$(( (TOTAL_CMDS + NUM_THREADS - 1) / NUM_THREADS ))
[ $batch_size -lt 1 ] && batch_size=1
split -l $batch_size -d -a 3 "$COMMANDS_FILE" "${TEMP_DIR}/batch_" 2>/dev/null

pids=""; tid=0
for bf in "${TEMP_DIR}"/batch_*; do
    [ -f "$bf" ] || continue
    tid=$((tid + 1))
    process_batch "$bf" "$tid" &
    pids="$pids $!"
done

for pid in $pids; do wait $pid 2>/dev/null; done

# =============================================================================
# RESULTS
# =============================================================================
total_success=0; total_failed=0
for rf in "${TEMP_DIR}"/result_*.txt; do
    [ -f "$rf" ] || continue
    read s f < "$rf" 2>/dev/null
    total_success=$((total_success + ${s:-0}))
    total_failed=$((total_failed + ${f:-0}))
done

for ff in "${TEMP_DIR}"/fail_*.csv; do
    [ -f "$ff" ] && cat "$ff" >> "$FAILURES_CSV"
done

echo "Complete: Success=$total_success Failed=$total_failed"
[ $total_failed -gt 0 ] && echo "Failures: $FAILURES_CSV"
[ $total_failed -gt 0 ] && exit 1
exit 0
