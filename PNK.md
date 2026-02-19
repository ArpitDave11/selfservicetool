# Broadridge Cash Management → Data Mesh Ingestion (Axway + Kafka)

[[_TOC_]]

*Generated on 2/18/2026*

---

## Executive Summary

We are integrating **Broadridge Cash Management** files into the **Data Mesh** while keeping the **existing Mainframe (MF) downstream flow unchanged**. Today, Data Mesh ingestion is **control-file driven**: a Control File arrives in `Controlfile/`, triggers the pipeline, and the pipeline reads both the control file and the data file from `datafiles/`, performs validation, and writes **Parquet outputs**.

Broadridge's Cash Management flow currently lands files onto **Axway** and publishes **Kafka notifications** (including **MD5** checksum). We will introduce a **Kafka-triggered Axway→Mesh pull pipeline** that copies the file into Data Mesh ingestion storage and generates a Control File from the Kafka message. We will also enhance the existing Data Mesh pipeline to support **MD5 alongside SHA256**, parse files where **records/fields are enclosed in `*`**, and enforce a **Broadridge-provided schema** when creating Parquet.

---

## Current Scenario (As-Is)

### Existing Data Mesh ingestion
- Azure Ingestion Container layout:
  - `datafiles/` — data files arrive here
  - `Controlfile/` — control files arrive here (single-record metadata: Count, Business Date, Checksum, etc.)
- Pipeline is triggered by **Control File arrival**:
  - reads control + data file
  - validates that no data loss occurred (checksum / counts)
  - writes Parquet output for downstream consumers
- Supported file types: **CSV / TXT / PARQUET**
- Current checksum validation: **SHA256**

### Existing Broadridge → Axway → MF flow (must remain)
1. Broadridge sends Cash Management data file to **SFG (SFTP)**
2. Broadridge sends a **Kafka notification** (includes **MD5 checksum** and metadata)
3. **ESL Service** pulls the file from SFG and places it onto **Axway**
4. ESL Service posts a second **Kafka notification** (file available on Axway)
5. This second Kafka message triggers the **MF Job**
6. MF Job reads the file from Axway and transforms it (removes `*` used to enclose fields/records)

**Important:** The MF flow must remain unchanged to avoid impacting existing downstream consumers.

---

## Objective

Onboard Broadridge Cash Management files into Data Mesh by:

1. **Pulling the file from Axway** into the Azure Ingestion Container `datafiles/`
2. **Generating a Control File from the Kafka message** into `Controlfile/` to trigger existing ingestion behavior
3. Enhancing pipeline + registry to support:
   - **MD5 validation** in addition to SHA256 (config-driven)
   - Parsing **`*` enclosed fields/records**
   - **Schema enforcement** using Broadridge schema file during Parquet creation
4. Ensuring the file remains available in Axway long enough for both MF and Data Mesh to access it:
   - **Disable deletion** after MF pull or implement an agreed retention policy

---

## Goals / Non-Goals

### Goals
- New **Kafka-triggered Axway→Mesh pull pipeline**:
  - triggered by ESL Kafka notification (post-Axway placement)
  - copies file from Axway to `datafiles/`
  - creates a Control File in `Controlfile/` using Kafka message metadata
- Enhance existing ingestion pipeline:
  - support checksum validation **MD5 or SHA256** based on registry configuration
  - parse `*`-enclosed records/fields (in addition to existing delimiter parsing)
  - enforce Broadridge schema during Parquet output generation
- Setup required connectivity and permissions:
  - **Data Mesh ↔ Axway connection**
  - Kafka topic access/ACLs
  - Axway retention/deletion change

### Non-Goals
- No changes to Mainframe job processing logic or existing MF downstream consumers
- No change to the ingestion container directory model (`datafiles/`, `Controlfile/`)
- No upstream changes to Broadridge file generation behavior
- No replacement of Kafka with another trigger mechanism

---

## Proposed End-to-End Design (To-Be)

### High-Level Flow
1. ESL Service places file on Axway and posts **Kafka notification**
2. Kafka triggers **Axway→Mesh Pull Pipeline**
3. Pull pipeline:
   - pulls file from Axway
   - copies it into `datafiles/`
   - generates Control File into `Controlfile/` based on Kafka metadata
4. Existing ingestion pipeline triggers from Control File:
   - reads file + control
   - validates checksum (MD5 or SHA256 per registry)
   - parses file (including `*` enclosure)
   - applies Broadridge schema
   - writes Parquet outputs to Mesh for new consumers (e.g., DHARMA)

### Correct System Architecture Diagram
```mermaid
flowchart LR
  BR[Broadridge] -->|CashMgmt file| SFG[SFG (SFTP)]
  BR -->|Kafka msg: MD5, biz date, filename, metadata| K1[(Kafka)]

  SFG -->|pull| ESL[ESL Service]
  ESL -->|place file| AX[Axway]
  ESL -->|Kafka msg: file available on Axway| K2[(Kafka)]

  K2 -->|triggers| PULL[Axway→Mesh Pull Pipeline]
  PULL -->|copy file| DF[datafiles/]
  PULL -->|create control file from Kafka msg| CF[Controlfile/]

  DF --> ING[Existing Mesh Ingestion Pipeline]
  CF -->|triggers| ING

  ING --> VAL[Checksum validation (MD5/SHA256 via registry)]
  ING --> PARSE[Parsing (delimiter + '*' enclosure)]
  ING --> SCHEMA[Schema enforcement (Broadridge schema)]
  ING --> PQ[Parquet output (Data Mesh)]

  K2 -->|triggers| MF[Mainframe Job]
  MF -->|reads from| AX
  MF -->|transforms: remove '*'| MFOUT[Mainframe Downstream Outputs]

  PQ --> CONS[Consumers (DHARMA, others)]
```

---

## Required Enhancements (Mapped to Requirements)

### 1) Support MD5 alongside SHA256

* Add registry column: `checksum_type` ∈ { `MD5`, `SHA256` }
* Pipeline selects checksum algorithm based on registry
* Broadridge CashMgmt feed uses `checksum_type = MD5` (per Kafka-provided checksum)

### 2) Parse `*`-enclosed fields/records

* Add registry parsing configuration:

  * `field_enclosure_char = '*'`
  * `record_enclosure_char = '*'` (if applicable)
  * retain delimiter-based parsing where required
* Pipeline parsing supports:

  * stripping enclosures safely
  * handling malformed rows, empty fields, and unexpected enclosure patterns
  * producing normalized dataset prior to Parquet write

### 3) Axway deletion must be disabled / retention ensured

* Today: file is deleted after MF pulls from Axway
* Required: file must remain available so Data Mesh can also pull it
* Options:

  * **Preferred:** MF stops deleting OR Axway retention policy is adjusted
  * **Fallback:** duplicate/copy strategy implemented so Mesh can pull reliably

### 4) New Axway→Mesh Pull Pipeline

Responsibilities:

* Triggered by ESL Kafka notification
* Pull from Axway, write to `datafiles/`
* Generate Control File from Kafka metadata into `Controlfile/` (only after data file commit)
* Handle retries and idempotency to avoid duplicate ingestion

### 5) Kafka-trigger setup

* Subscribe to ESL Kafka topic (post-Axway placement event)
* Ensure:

  * idempotency (duplicate messages)
  * safe retry
  * traceability using Kafka message IDs / correlation IDs

### 6) Schema enforcement

* Apply Broadridge schema file during Parquet creation:

  * validate types and required fields
  * reject/quarantine schema mismatches
  * keep outputs consistent for new consumers

### 7) Connectivity between Data Mesh and Axway

* Network access + authentication method
* Secrets managed securely (e.g., Key Vault)
* Operational visibility (logs include Axway transfer IDs and Kafka correlation IDs)

---

## Registry Changes

Add/extend these columns for feed configuration:

* `checksum_type` (MD5/SHA256)
* `delimiter` (existing)
* `field_enclosure_char` (new, `*` for CashMgmt)
* `record_enclosure_char` (new if needed)
* `schema_file_path` (Broadridge schema location)
* `source_system` = Broadridge
* `trigger_source` = Kafka → Control File

---

## Idempotency & Error Handling

### Idempotency

* Idempotency key (recommended): `(filename + business_date + checksum)` or Kafka message ID
* If duplicate Kafka message arrives:

  * do not create duplicate Control File
  * log as "duplicate ignored"

### Control File rules

* Control File is written **only after**:

  * file is successfully copied to `datafiles/`
  * data file is in final committed location
* Control File contains at minimum:

  * filename / file ID
  * business date
  * checksum value (from Kafka)
  * checksum type (MD5/SHA256)
  * record count (if provided, otherwise derived if required)

### Failures

Write structured failure records to `ingestion_errors/` for:

* Axway pull failures
* Kafka message parsing failures
* checksum mismatches
* schema enforcement failures
* parsing failures (enclosure/delimiter issues)

---

## Epic-Level Acceptance Criteria

* [ ] CashMgmt file ingests end-to-end into Data Mesh via Axway + Kafka trigger
* [ ] Pipeline validates **MD5** for CashMgmt and retains **SHA256** for existing feeds
* [ ] Parsing correctly handles `*`-enclosed data and produces correct Parquet output
* [ ] Broadridge schema is enforced; schema failures quarantine and are reported
* [ ] Axway retention/deletion behavior is modified so MF and Mesh can both access the file
* [ ] Mainframe job remains unchanged and continues to run successfully
* [ ] Duplicate Kafka notifications do not cause duplicate ingestion

---

## User Stories (Fibonacci, max 5 points each)

### Trigger + Pull Pipeline

**US-001: Subscribe to ESL Kafka notification topic** [3pt]
Acceptance Criteria:

* [ ] Consumer reads ESL topic in DEV/QA
* [ ] Required fields extracted: filename, business date, checksum (MD5), correlation ID
* [ ] Invalid messages routed to `ingestion_errors/`

**US-002: Establish Data Mesh ↔ Axway connectivity and authentication** [5pt]
Acceptance Criteria:

* [ ] Axway connection works in DEV and QA
* [ ] Secrets stored securely (Key Vault or approved mechanism)
* [ ] Connectivity failures logged with correlation ID

**US-003: Implement Axway→Mesh file pull and write to `datafiles/`** [5pt]
Acceptance Criteria:

* [ ] File lands in `datafiles/` with correct final name
* [ ] Partial/incomplete file is never visible as final (staging → commit)
* [ ] Retries are safe (no duplicates)

**US-004: Generate Control File from Kafka metadata and publish to `Controlfile/`** [3pt]
Acceptance Criteria:

* [ ] Control file includes filename/fileId, business date, checksum value, checksum type, count (if available/required)
* [ ] Control file is created only after data file commit
* [ ] Duplicate Kafka notification does not create duplicate control file

### Pipeline + Registry Enhancements

**US-005: Add `checksum_type` to registry and configure CashMgmt as MD5** [2pt]
Acceptance Criteria:

* [ ] Registry supports MD5/SHA256 values
* [ ] CashMgmt feed configured as MD5
* [ ] Existing feeds default/continue as SHA256

**US-006: Implement MD5 checksum validation path in ingestion pipeline** [5pt]
Acceptance Criteria:

* [ ] When registry says MD5, pipeline computes MD5 and matches against control/Kafka value
* [ ] When registry says SHA256, behavior remains unchanged
* [ ] Mismatch triggers quarantine + `ingestion_errors/` record

**US-007: Add parsing support for `*`-enclosed fields/records** [5pt]
Acceptance Criteria:

* [ ] Strips enclosure correctly and outputs expected normalized values
* [ ] Handles empty/malformed rows with clear error reporting
* [ ] Golden-file test validates parsing output

**US-008: Add registry config for enclosure characters** [2pt]
Acceptance Criteria:

* [ ] Registry supports `field_enclosure_char` and `record_enclosure_char`
* [ ] Pipeline routes parsing based on registry config

**US-009: Enforce Broadridge schema file during Parquet write** [3pt]
Acceptance Criteria:

* [ ] Loads schema file from `schema_file_path`
* [ ] Type/required-field enforcement applied
* [ ] Schema violations quarantine and are logged

### Retention / Operational

**US-010: Modify Axway deletion/retention so Mesh can pull after MF** [5pt]
Acceptance Criteria:

* [ ] File remains accessible to Mesh after MF consumes
* [ ] Retention window documented and agreed
* [ ] No impact to MF processing

**US-011: Add correlation IDs across Kafka→Pull→Ingestion logs** [3pt]
Acceptance Criteria:

* [ ] Kafka correlation ID appears in pull pipeline logs and ingestion pipeline logs
* [ ] `ingestion_errors/` includes correlation ID + Axway identifiers

**US-012: Automated end-to-end test for CashMgmt ingestion** [5pt]
Acceptance Criteria:

* [ ] Covers Kafka trigger → Axway pull → control file → ingestion → parquet output
* [ ] Verifies MD5 validation + schema enforcement + parsing correctness
* [ ] Test blocks merge/deploy if failing

---

## Dependencies

1. Kafka topic access/ACLs for ESL notifications
2. Axway connectivity approval + credentials provisioning
3. Axway deletion disabled or retention policy implemented
4. Broadridge schema file provided + stable location
5. Registry deployment process aligned with pipeline rollout

---

## Risks & Mitigations

| Risk                                 | Impact | Mitigation                                                          |
| ------------------------------------ | ------ | ------------------------------------------------------------------- |
| Axway file deleted before Mesh pull  | High   | Disable deletion / retention window / fallback duplication strategy |
| Kafka duplicates/out-of-order events | Medium | Idempotency key + control file dedupe                               |
| Incorrect parsing of `*` enclosures  | High   | Golden test vectors + strict validation + quarantine                |
| Schema mismatches break consumers    | Medium | Schema enforcement + quarantine + reporting                         |
| MD5 vs SHA256 confusion across feeds | Medium | Registry-driven logic + clear defaults + automated tests            |
