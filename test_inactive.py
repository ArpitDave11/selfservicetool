# Databricks Notebook: Test inactive.sh via SSH
# =============================================================================
# This tests the inactive.sh script on the AutoSys server via SSH
# =============================================================================

import paramiko
from io import StringIO

# =============================================================================
# Configuration
# =============================================================================
ssh_host = "autosys01.eisldev.azpriv-cloud.ubs.net"
ssh_port = 22
ssh_username = "eisladmin"

# Paths on remote server
REMOTE_SCRIPT = "/mnt/ingestion/autosys/inactive.sh"
REMOTE_COMMANDS_FILE = "/mnt/ingestion/autosys/inactive_commands.txt"
AUTOSYS_ENV = "/mnt/ingestion/autosys/esl.env"

# =============================================================================
# SSH Key Setup
# =============================================================================
def normalize_pem(pem_str: str) -> str:
    header = "-----BEGIN RSA PRIVATE KEY-----"
    footer = "-----END RSA PRIVATE KEY-----"
    s = pem_str.strip()
    if header in s and footer in s and "\n" not in s:
        inner = s[len(header):-len(footer)]
        inner = inner.strip().replace("\r", "").replace("\n", "")
        return f"{header}\n{inner}\n{footer}\n"
    else:
        return s

print("=" * 60)
print("TEST: inactive.sh via SSH")
print("=" * 60)
print(f"Host: {ssh_host}")
print(f"User: {ssh_username}")
print("=" * 60)

# Get SSH key
try:
    pem_raw = dbutils.secrets.get("dhub-akv-scope", "dhubvm-private-key")
    pkey = paramiko.RSAKey.from_private_key(StringIO(normalize_pem(pem_raw)))
    print("✓ SSH key loaded")
except Exception as e:
    print(f"✗ SSH key failed: {e}")
    raise

# =============================================================================
# Connect via SSH
# =============================================================================
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    ssh.connect(
        hostname=ssh_host,
        port=ssh_port,
        username=ssh_username,
        pkey=pkey,
        timeout=30
    )
    print("✓ SSH connected")
except Exception as e:
    print(f"✗ SSH connection failed: {e}")
    raise

# =============================================================================
# Test 1: Check if script exists
# =============================================================================
print("\n" + "-" * 60)
print("TEST 1: Check if inactive.sh exists")
print("-" * 60)

stdin, stdout, stderr = ssh.exec_command(f"ls -la {REMOTE_SCRIPT}")
out = stdout.read().decode().strip()
err = stderr.read().decode().strip()
exit_code = stdout.channel.recv_exit_status()

if exit_code == 0:
    print(f"✓ Script exists:\n{out}")
else:
    print(f"✗ Script NOT found: {err}")
    print(f"\nYou need to copy inactive.sh to: {REMOTE_SCRIPT}")

# =============================================================================
# Test 2: Check if script is executable
# =============================================================================
print("\n" + "-" * 60)
print("TEST 2: Check if script is executable")
print("-" * 60)

stdin, stdout, stderr = ssh.exec_command(f"test -x {REMOTE_SCRIPT} && echo 'EXECUTABLE' || echo 'NOT_EXECUTABLE'")
out = stdout.read().decode().strip()

if out == "EXECUTABLE":
    print("✓ Script is executable")
else:
    print("✗ Script is NOT executable")
    print(f"  Run: chmod +x {REMOTE_SCRIPT}")

# =============================================================================
# Test 3: Check if commands file exists
# =============================================================================
print("\n" + "-" * 60)
print("TEST 3: Check if commands file exists")
print("-" * 60)

stdin, stdout, stderr = ssh.exec_command(f"ls -la {REMOTE_COMMANDS_FILE} 2>/dev/null && wc -l < {REMOTE_COMMANDS_FILE}")
out = stdout.read().decode().strip()
err = stderr.read().decode().strip()
exit_code = stdout.channel.recv_exit_status()

if exit_code == 0:
    print(f"✓ Commands file exists:\n{out}")
else:
    print(f"✗ Commands file NOT found")
    print(f"  Run generate_inactive_jobs.py first to create it")

# =============================================================================
# Test 4: Check AutoSys environment
# =============================================================================
print("\n" + "-" * 60)
print("TEST 4: Check AutoSys environment")
print("-" * 60)

stdin, stdout, stderr = ssh.exec_command(f"source {AUTOSYS_ENV} 2>/dev/null && which sendevent")
out = stdout.read().decode().strip()
err = stderr.read().decode().strip()
exit_code = stdout.channel.recv_exit_status()

if exit_code == 0 and out:
    print(f"✓ sendevent found: {out}")
else:
    print(f"✗ sendevent NOT found after sourcing {AUTOSYS_ENV}")
    print(f"  Error: {err}")

# =============================================================================
# Test 5: Run script with --help
# =============================================================================
print("\n" + "-" * 60)
print("TEST 5: Run inactive.sh --help")
print("-" * 60)

cmd = f"bash {REMOTE_SCRIPT} --help"
stdin, stdout, stderr = ssh.exec_command(cmd)
out = stdout.read().decode().strip()
err = stderr.read().decode().strip()
exit_code = stdout.channel.recv_exit_status()

print(f"Command: {cmd}")
print(f"Exit code: {exit_code}")
if out:
    print(f"Output:\n{out}")
if err:
    print(f"Stderr:\n{err}")

# =============================================================================
# Test 6: Create a test commands file and run DRY-RUN
# =============================================================================
print("\n" + "-" * 60)
print("TEST 6: Run DRY-RUN with test commands")
print("-" * 60)

# Create test file with 10 fake commands
test_file = "/tmp/test_inactive_commands.txt"
test_cmds = "\n".join([
    f"echo 'TEST_CMD_{i}'"
    for i in range(1, 11)
])

create_cmd = f"echo '{test_cmds}' > {test_file}"
stdin, stdout, stderr = ssh.exec_command(create_cmd)
stdout.channel.recv_exit_status()
print(f"✓ Created test file: {test_file}")

# Run dry-run
run_cmd = f"bash {REMOTE_SCRIPT} --file {test_file} --threads 5 --retries 2 --dry-run"
print(f"\nRunning: {run_cmd}\n")

stdin, stdout, stderr = ssh.exec_command(run_cmd, timeout=60)
out = stdout.read().decode().strip()
err = stderr.read().decode().strip()
exit_code = stdout.channel.recv_exit_status()

print("--- OUTPUT ---")
print(out)
if err:
    print("\n--- STDERR ---")
    print(err)
print("--- END ---")
print(f"\nExit code: {exit_code}")

# Cleanup
ssh.exec_command(f"rm -f {test_file}")

# =============================================================================
# Summary
# =============================================================================
print("\n" + "=" * 60)
print("SUMMARY")
print("=" * 60)

if exit_code == 0:
    print("✓ All tests passed! Script is working.")
else:
    print("✗ Some tests failed. Check output above.")

# Close connection
ssh.close()
print("\n✓ SSH connection closed")
