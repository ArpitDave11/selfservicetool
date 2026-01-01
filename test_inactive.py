# Test Script for inactive.sh
# =============================================================================
# Run this in Databricks or locally to test if inactive.sh works correctly.
# Uses --dry-run mode so no actual sendevent commands are executed.
# =============================================================================

import subprocess
import os
import tempfile

# =============================================================================
# Configuration
# =============================================================================
SCRIPT_PATH = "/Users/arpit/Desktop/Dataops/inactive.sh"  # Change for Databricks
TEST_COMMANDS_FILE = "/tmp/test_inactive_commands.txt"

# =============================================================================
# Step 1: Create test commands file
# =============================================================================
print("=" * 60)
print("STEP 1: Creating test commands file")
print("=" * 60)

# Create 100 fake sendevent commands for testing
test_commands = []
for i in range(1, 101):
    cmd = f"sendevent -E CHANGE_STATUS -s INACTIVE -J WMA_ESL_5481_PRD_DMSH_PRCSSNG_TESTFILE_{i:03d}"
    test_commands.append(cmd)

with open(TEST_COMMANDS_FILE, 'w') as f:
    f.write("\n".join(test_commands) + "\n")

print(f"Created: {TEST_COMMANDS_FILE}")
print(f"Commands: {len(test_commands)}")
print(f"Sample:")
for cmd in test_commands[:3]:
    print(f"  {cmd}")
print(f"  ...")

# =============================================================================
# Step 2: Make script executable
# =============================================================================
print("\n" + "=" * 60)
print("STEP 2: Making script executable")
print("=" * 60)

try:
    os.chmod(SCRIPT_PATH, 0o755)
    print(f"chmod 755 {SCRIPT_PATH} - OK")
except Exception as e:
    print(f"chmod failed: {e}")

# =============================================================================
# Step 3: Run inactive.sh in DRY-RUN mode
# =============================================================================
print("\n" + "=" * 60)
print("STEP 3: Running inactive.sh --dry-run")
print("=" * 60)

cmd = [
    "bash",
    SCRIPT_PATH,
    "--file", TEST_COMMANDS_FILE,
    "--threads", "10",
    "--retries", "3",
    "--dry-run"
]

print(f"Command: {' '.join(cmd)}")
print("\n--- OUTPUT START ---\n")

try:
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=60
    )

    print(result.stdout)

    if result.stderr:
        print("\n--- STDERR ---")
        print(result.stderr)

    print("\n--- OUTPUT END ---")
    print(f"\nExit code: {result.returncode}")

    if result.returncode == 0:
        print("\n✓ SUCCESS: Script ran correctly!")
    else:
        print("\n✗ FAILED: Script returned non-zero exit code")

except subprocess.TimeoutExpired:
    print("\n✗ TIMEOUT: Script took too long")
except Exception as e:
    print(f"\n✗ ERROR: {e}")

# =============================================================================
# Step 4: Check output files
# =============================================================================
print("\n" + "=" * 60)
print("STEP 4: Checking output files")
print("=" * 60)

log_dir = "/mnt/ingestion/autosys/logs"
if not os.path.exists(log_dir):
    log_dir = "/tmp"  # Fallback for local testing

print(f"Log directory: {log_dir}")

for f in os.listdir(log_dir):
    if f.startswith("inactive_"):
        filepath = os.path.join(log_dir, f)
        size = os.path.getsize(filepath)
        print(f"  {f} ({size} bytes)")

# =============================================================================
# Cleanup
# =============================================================================
print("\n" + "=" * 60)
print("CLEANUP")
print("=" * 60)
os.remove(TEST_COMMANDS_FILE)
print(f"Removed: {TEST_COMMANDS_FILE}")

print("\n" + "=" * 60)
print("TEST COMPLETE")
print("=" * 60)
