#!/bin/bash
# =============================================================================
# AutoSys Job Inactivation - SPEED OPTIMIZED
# =============================================================================
# Location: /mnt/ingestion/autosys/inactive.sh
#
# JIL Command:
#   bash -c 'source /mnt/ingestion/autosys/esl.env; cd /mnt/ingestion/autosys/; ./inactive.sh'
#
# Prerequisites:
#   1. Run generate_inactive_jobs.py in Databricks to create commands file
#   2. Commands file at: /mnt/ingestion/autosys/inactive_commands.txt
# =============================================================================

# =============================================================================
# FIXED CONFIGURATION (No arguments needed)
# =============================================================================
SCRIPT_DIR="/mnt/ingestion/autosys"
COMMANDS_FILE="${SCRIPT_DIR}/inactive_commands.txt"
AUTOSYS_ENV="${SCRIPT_DIR}/esl.env"
LOG_DIR="${SCRIPT_DIR}/logs"

NUM_THREADS=100
MAX_RETRIES=3
RETRY_DELAY=1

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# =============================================================================
# SETUP
# =============================================================================
# Source AutoSys environment
[[ -f "$AUTOSYS_ENV" ]] && source "$AUTOSYS_ENV"

# Create directories
mkdir -p "$LOG_DIR" 2>/dev/null || LOG_DIR="/tmp"
TEMP_DIR=$(mktemp -d /tmp/inactive_XXXXXX)
trap "rm -rf $TEMP_DIR" EXIT

# Output files
FAILURES_CSV="${LOG_DIR}/inactive_failures_${TIMESTAMP}.csv"
SUMMARY_LOG="${LOG_DIR}/inactive_summary_${TIMESTAMP}.log"

# =============================================================================
# VALIDATION
# =============================================================================
if [[ ! -f "$COMMANDS_FILE" ]]; then
    echo "ERROR: Commands file not found: $COMMANDS_FILE"
    echo "Run generate_inactive_jobs.py in Databricks first!"
    exit 1
fi

if [[ ! -s "$COMMANDS_FILE" ]]; then
    echo "ERROR: Commands file is empty: $COMMANDS_FILE"
    exit 1
fi

# Count commands
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

# Initialize CSV
echo "timestamp,command,attempt,exit_code" > "$FAILURES_CSV"

# =============================================================================
# WORKER FUNCTION
# =============================================================================
process_batch() {
    local batch_file="$1"
    local thread_id="$2"
    local result_file="${TEMP_DIR}/result_${thread_id}.txt"

    local success=0
    local failed=0

    while IFS= read -r cmd || [[ -n "$cmd" ]]; do
        [[ -z "$cmd" ]] && continue

        local attempt=0
        local done_flag=false

        while [[ $attempt -lt $MAX_RETRIES ]] && [[ "$done_flag" == "false" ]]; do
            ((attempt++))

            # Execute command
            if eval "$cmd" >/dev/null 2>&1; then
                done_flag=true
                ((success++))
            else
                local exit_code=$?
                # Log failure immediately
                echo "$(date '+%Y-%m-%d %H:%M:%S'),\"$cmd\",$attempt,$exit_code" >> "${TEMP_DIR}/fail_${thread_id}.csv"

                if [[ $attempt -lt $MAX_RETRIES ]]; then
                    sleep $RETRY_DELAY
                else
                    ((failed++))
                fi
            fi
        done
    done < "$batch_file"

    echo "$success $failed" > "$result_file"
}

export -f process_batch
export TEMP_DIR MAX_RETRIES RETRY_DELAY

# =============================================================================
# SPLIT INTO BATCHES
# =============================================================================
batch_size=$(( (TOTAL_CMDS + NUM_THREADS - 1) / NUM_THREADS ))
[[ $batch_size -lt 1 ]] && batch_size=1

split -l $batch_size -d -a 3 "$COMMANDS_FILE" "${TEMP_DIR}/batch_" 2>/dev/null

BATCH_COUNT=$(ls -1 "${TEMP_DIR}"/batch_* 2>/dev/null | wc -l)
echo "Batches: $BATCH_COUNT"

# =============================================================================
# PARALLEL EXECUTION
# =============================================================================
START_TIME=$(date +%s)

pids=()
tid=0
for bf in "${TEMP_DIR}"/batch_*; do
    [[ -f "$bf" ]] || continue
    ((tid++))
    process_batch "$bf" "$tid" &
    pids+=($!)
done

echo "Launched $tid threads..."

for pid in "${pids[@]}"; do
    wait "$pid" 2>/dev/null
done

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
[[ $ELAPSED -eq 0 ]] && ELAPSED=1

# =============================================================================
# AGGREGATE RESULTS
# =============================================================================
total_success=0
total_failed=0

for rf in "${TEMP_DIR}"/result_*.txt; do
    [[ -f "$rf" ]] || continue
    read -r s f < "$rf"
    total_success=$((total_success + ${s:-0}))
    total_failed=$((total_failed + ${f:-0}))
done

# Merge failures
for ff in "${TEMP_DIR}"/fail_*.csv; do
    [[ -f "$ff" ]] && cat "$ff" >> "$FAILURES_CSV"
done

# =============================================================================
# SUMMARY
# =============================================================================
RATE=$(echo "scale=1; $TOTAL_CMDS / $ELAPSED" | bc 2>/dev/null || echo "N/A")

echo ""
echo "============================================================"
echo "  COMPLETED"
echo "============================================================"
echo "  Total:    $TOTAL_CMDS"
echo "  Success:  $total_success"
echo "  Failed:   $total_failed"
echo "  Time:     ${ELAPSED}s"
echo "  Rate:     $RATE cmds/sec"
echo "============================================================"

if [[ $total_failed -gt 0 ]]; then
    echo ""
    echo "FAILURES: $FAILURES_CSV"
    tail -n +2 "$FAILURES_CSV" | head -5
fi

echo ""
echo "Finished: $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"

# Summary log
cat > "$SUMMARY_LOG" << EOF
timestamp=$(date '+%Y-%m-%d %H:%M:%S')
file=$COMMANDS_FILE
total=$TOTAL_CMDS
success=$total_success
failed=$total_failed
threads=$NUM_THREADS
elapsed=${ELAPSED}s
failures_csv=$FAILURES_CSV
EOF

[[ $total_failed -gt 0 ]] && exit 1
exit 0
