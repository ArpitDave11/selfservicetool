# Databricks Notebook: Generate Inactive Jobs List
# =============================================================================
# This notebook reads the JSON registry and generates a .txt file containing
# all job names to be set to INACTIVE status.
#
# The .txt file is then used by inactive.sh on the AutoSys server.
# =============================================================================

# =============================================================================
# Widgets
# =============================================================================

dbutils.widgets.text("env", "", "Environment (DEV/QA/PRD)")
dbutils.widgets.text("registry_path", "/dbfs/mnt/dataops/config/dataset_registry_v1.json", "Registry JSON Path")
dbutils.widgets.text("output_path", "/dbfs/mnt/dataops/config/inactive_jobs.txt", "Output TXT Path")

# =============================================================================
# Imports
# =============================================================================

import json
import os
from datetime import datetime

# =============================================================================
# Read Configuration
# =============================================================================

ENV = dbutils.widgets.get("env").strip().upper()
REGISTRY_PATH = dbutils.widgets.get("registry_path").strip()
OUTPUT_PATH = dbutils.widgets.get("output_path").strip()

# Validate environment
if not ENV:
    raise ValueError("Environment (env) widget is required. Please provide DEV, QA, or PRD.")

if ENV not in ["DEV", "QA", "PRD"]:
    raise ValueError(f"Invalid environment: {ENV}. Must be DEV, QA, or PRD.")

print("=" * 70)
print("GENERATE INACTIVE JOBS LIST")
print("=" * 70)
print(f"Environment:    {ENV}")
print(f"Registry Path:  {REGISTRY_PATH}")
print(f"Output Path:    {OUTPUT_PATH}")
print(f"Timestamp:      {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("=" * 70)

# =============================================================================
# Load JSON Registry
# =============================================================================

print("\nLoading registry...")

if not os.path.exists(REGISTRY_PATH):
    raise FileNotFoundError(f"Registry file not found: {REGISTRY_PATH}")

try:
    with open(REGISTRY_PATH, 'r') as f:
        registry_data = json.load(f)
    print(f"  [OK] Registry loaded successfully")
except json.JSONDecodeError as e:
    raise ValueError(f"Failed to parse registry JSON: {e}")

# =============================================================================
# Extract Filenames from Registry
# =============================================================================

print("\nExtracting filenames from registry...")

filenames = []

# Extract from wf_datasets
if "wf_datasets" in registry_data and "dataset" in registry_data["wf_datasets"]:
    wf_count = 0
    for dataset in registry_data["wf_datasets"]["dataset"]:
        filename = dataset.get("ingest_data_fil_nm")
        if filename:
            filenames.append(filename.strip())
            wf_count += 1
    print(f"  [OK] Found {wf_count} datasets in wf_datasets")

# Extract from non_wf_datasets
if "non_wf_datasets" in registry_data and "dataset" in registry_data["non_wf_datasets"]:
    non_wf_count = 0
    for dataset in registry_data["non_wf_datasets"]["dataset"]:
        filename = dataset.get("ingest_data_fil_nm")
        if filename:
            filenames.append(filename.strip())
            non_wf_count += 1
    print(f"  [OK] Found {non_wf_count} datasets in non_wf_datasets")

if not filenames:
    raise ValueError("No filenames found in registry!")

print(f"\n  Total filenames extracted: {len(filenames)}")

# =============================================================================
# Build Job Names
# =============================================================================

print("\nBuilding job names...")

job_names = []
for filename in filenames:
    # Replace spaces with underscores
    safe_filename = filename.replace(" ", "_")
    # Build job name
    job_name = f"WMA_ESL_5481_{ENV}_DMSH_PRCSSNG_{safe_filename}"
    job_names.append(job_name)

print(f"  [OK] Built {len(job_names)} job names")

# Remove duplicates while preserving order
seen = set()
unique_job_names = []
for job in job_names:
    if job not in seen:
        seen.add(job)
        unique_job_names.append(job)

if len(unique_job_names) < len(job_names):
    print(f"  [INFO] Removed {len(job_names) - len(unique_job_names)} duplicate job names")

job_names = unique_job_names

# =============================================================================
# Write to Output File
# =============================================================================

print(f"\nWriting job names to: {OUTPUT_PATH}")

# Ensure output directory exists
output_dir = os.path.dirname(OUTPUT_PATH)
if output_dir and not os.path.exists(output_dir):
    os.makedirs(output_dir)
    print(f"  [OK] Created output directory: {output_dir}")

# Write job names (one per line, overwrite mode)
with open(OUTPUT_PATH, 'w') as f:
    for job_name in job_names:
        f.write(job_name + "\n")

print(f"  [OK] Written {len(job_names)} job names to file")

# Verify file was written
if os.path.exists(OUTPUT_PATH):
    file_size = os.path.getsize(OUTPUT_PATH)
    print(f"  [OK] File size: {file_size} bytes")
else:
    raise RuntimeError(f"Failed to create output file: {OUTPUT_PATH}")

# =============================================================================
# Summary
# =============================================================================

print("\n" + "=" * 70)
print("SUMMARY")
print("=" * 70)
print(f"Environment:        {ENV}")
print(f"Total Jobs:         {len(job_names)}")
print(f"Output File:        {OUTPUT_PATH}")
print(f"File Size:          {file_size} bytes")
print("=" * 70)

print("\nSample job names (first 10):")
for job in job_names[:10]:
    print(f"  - {job}")
if len(job_names) > 10:
    print(f"  ... and {len(job_names) - 10} more")

print("\n" + "=" * 70)
print("SUCCESS: Job names file generated!")
print("=" * 70)
print(f"\nNext step: Run inactive.sh on AutoSys server with:")
print(f"  ./inactive.sh --file {OUTPUT_PATH} --threads 20 --retries 3")
print()
