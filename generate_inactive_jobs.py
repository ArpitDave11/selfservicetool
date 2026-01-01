# Databricks Notebook: Generate Inactive Commands
# =============================================================================
# Reads JSON registry and generates full sendevent commands for inactivation.
# Output: inactive_commands.txt (one command per line for backtracing)
# =============================================================================

import json
import os
from datetime import datetime

# =============================================================================
# Widgets
# =============================================================================
dbutils.widgets.text("env", "", "Environment (DEV/QA/PRD)")
dbutils.widgets.text("registry_path", "/dbfs/mnt/dataops/config/dataset_registry_v1.json", "Registry Path")
dbutils.widgets.text("output_path", "/dbfs/mnt/dataops/config/inactive_commands.txt", "Output Path")

# =============================================================================
# Configuration
# =============================================================================
ENV = dbutils.widgets.get("env").strip().upper()
REGISTRY_PATH = dbutils.widgets.get("registry_path").strip()
OUTPUT_PATH = dbutils.widgets.get("output_path").strip()

if not ENV or ENV not in ["DEV", "QA", "PRD"]:
    raise ValueError(f"Invalid environment: {ENV}. Must be DEV, QA, or PRD.")

print("=" * 60)
print("GENERATE INACTIVE COMMANDS")
print("=" * 60)
print(f"Environment:  {ENV}")
print(f"Registry:     {REGISTRY_PATH}")
print(f"Output:       {OUTPUT_PATH}")
print(f"Timestamp:    {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("=" * 60)

# =============================================================================
# Load Registry
# =============================================================================
if not os.path.exists(REGISTRY_PATH):
    raise FileNotFoundError(f"Registry not found: {REGISTRY_PATH}")

with open(REGISTRY_PATH, 'r') as f:
    registry = json.load(f)

print(f"Registry loaded")

# =============================================================================
# Extract Filenames & Build Commands
# =============================================================================
commands = []

for section in ["wf_datasets", "non_wf_datasets"]:
    if section in registry and "dataset" in registry[section]:
        for dataset in registry[section]["dataset"]:
            filename = dataset.get("ingest_data_fil_nm")
            if filename:
                safe_name = filename.strip().replace(" ", "_")
                job_name = f"WMA_ESL_5481_{ENV}_DMSH_PRCSSNG_{safe_name}"
                cmd = f"sendevent -E CHANGE_STATUS -s INACTIVE -J {job_name}"
                commands.append(cmd)

# Remove duplicates
commands = list(dict.fromkeys(commands))

print(f"Total commands: {len(commands)}")

if not commands:
    raise ValueError("No commands generated!")

# =============================================================================
# Write to Output File
# =============================================================================
output_dir = os.path.dirname(OUTPUT_PATH)
if output_dir and not os.path.exists(output_dir):
    os.makedirs(output_dir)

with open(OUTPUT_PATH, 'w') as f:
    f.write("\n".join(commands) + "\n")

print(f"Written to: {OUTPUT_PATH}")
print(f"File size: {os.path.getsize(OUTPUT_PATH)} bytes")

# =============================================================================
# Summary
# =============================================================================
print("\n" + "=" * 60)
print("DONE")
print("=" * 60)
print(f"Commands: {len(commands)}")
print(f"Output:   {OUTPUT_PATH}")
print("\nSample (first 5):")
for cmd in commands[:5]:
    print(f"  {cmd}")
if len(commands) > 5:
    print(f"  ... and {len(commands) - 5} more")
print("=" * 60)
