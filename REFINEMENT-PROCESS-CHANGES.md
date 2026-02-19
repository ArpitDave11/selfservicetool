# THE REFINEMENT PROCESS - Complete Code Changes Guide

**Date**: Feb 18-19, 2026
**Scope**: All changes from "THE REFINEMENT PROCESS" implementation (Steps 1-9 of the plan)
**Purpose**: Step-by-step guide for applying changes to existing project on remote desktop

---

## Table of Contents

1. [Overview](#overview)
2. [File Change Summary](#file-change-summary)
3. [NEW Files (copy entire file)](#new-files)
4. [src/types.ts Changes](#srctypests-changes)
5. [src/skills.ts Changes](#srcskillsts-changes)
6. [src/App.tsx Changes](#srcapptsx-changes)
7. [src/mockGitLabData.ts Changes](#srcmockgitlabdatats-changes)
8. [src/test/pipeline.test.ts Changes](#srctestpipelinetestts-changes)
9. [Verification Checklist](#verification-checklist)

---

## Overview

The Refinement Process adds:
- **Stage 6 (Validation Gate)** to the existing 5-stage Premium Pipeline
- **Requirement Extraction** (2nd AI call in Stage 1)
- **Content Integrity Rules** (prompt injection in Stage 4)
- **[Req #N] Traceability Tags** on user stories (Stage 5)
- **Iterative Loop** wrapping Stages 4-5-6 (max 5 iterations)
- **8 Deterministic Failure Patterns** detected without AI
- **Quality Gate**: auditScore >= 85 AND hardFailCount === 0

Architecture:
```
Stage 1: Comprehension + Requirement Extraction (2 AI calls)
Stage 2: Classification (unchanged)
Stage 3: Structural Assessment (unchanged)
  ┌─── LOOP (max 5 iterations) ───┐
  │ Stage 4: Content Refinement    │  (with 3A Content Integrity rules)
  │ Stage 5: Diagram + Stories     │  (with [Req #N] tags + 3B rules)
  │ Stage 6: Validation Gate       │  (AI audit + deterministic checks)
  │   if passed → break            │
  │   else → collect failures      │
  └────────────────────────────────┘
```

---

## File Change Summary

| File | Change Type | Size |
|------|-------------|------|
| `src/types.ts` | MODIFIED | ~60 lines added |
| `src/skills.ts` | MODIFIED | ~2000+ lines added/changed |
| `src/App.tsx` | MODIFIED | ~30 lines changed |
| `src/mockGitLabData.ts` | MODIFIED | ~60 lines added |
| `src/test/pipeline.test.ts` | MODIFIED | Major rewrite (~888 lines) |
| `src/test/run-category-validation.ts` | **NEW FILE** | 327 lines |
| `src/test/category-validation.test.ts` | **NEW FILE** | 275 lines |
| `src/test/fixtures/tech-design-auth-service.md` | **NEW FILE** | 39 lines |
| `src/test/fixtures/feature-spec-mobile-checkout.md` | **NEW FILE** | 45 lines |
| `src/test/fixtures/api-spec-payment-gateway.md` | **NEW FILE** | 59 lines |
| `src/test/fixtures/infra-design-k8s-migration.md` | **NEW FILE** | 61 lines |
| `src/test/fixtures/migration-plan-postgres-upgrade.md` | **NEW FILE** | 69 lines |
| `src/test/fixtures/business-req-digital-transformation.md` | **NEW FILE** | 62 lines |

---

## NEW Files

These files are entirely new. **Copy them as-is** from the zip:

1. `src/test/run-category-validation.ts` - Standalone CLI script for real AI validation
2. `src/test/category-validation.test.ts` - Vitest-based category tests (jsdom limitation: only works with mocks)
3. `src/test/fixtures/tech-design-auth-service.md`
4. `src/test/fixtures/feature-spec-mobile-checkout.md`
5. `src/test/fixtures/api-spec-payment-gateway.md`
6. `src/test/fixtures/infra-design-k8s-migration.md`
7. `src/test/fixtures/migration-plan-postgres-upgrade.md`
8. `src/test/fixtures/business-req-digital-transformation.md`

---

## src/types.ts Changes

### Change 1: Add fields to ComprehensionOutput interface (around line 185)

Find the `ComprehensionOutput` interface and add these fields before the closing brace:

```typescript
export interface ComprehensionOutput {
  projectEssence: string;
  keyEntities: EntityRelationship[];
  detectedGaps: string[];
  implicitRisks: string[];
  semanticSections: SemanticSection[];
  timestamp: number;
  // ADD THESE 4 FIELDS:
  // Refinement Process Step 1: Requirement Extraction
  extractedRequirements?: ExtractedRequirement[];
  requirementCount?: number;        // The "contract" count
  // Refinement Process Step 2: Gap Analysis
  gapAnalysis?: RequirementGap[];
  validOpenQuestions?: string[];     // Genuine unknowns source doesn't answer
}
```

### Change 2: Add ExtractedRequirement and RequirementGap interfaces (after ComprehensionOutput)

Insert after the `ComprehensionOutput` interface closing brace:

```typescript
export interface ExtractedRequirement {
  reqNum: number;           // Sequential: 1, 2, 3...
  description: string;      // What the requirement says
  sourceSection: string;    // Which section it came from
  sourceText: string;       // Original text for traceability (max 200 chars)
  category: 'functional' | 'non-functional' | 'infrastructure' | 'operational';
}

export interface RequirementGap {
  reqNum: number;
  hasEnoughDetail: boolean;
  openQuestions: string[];       // Legitimate unknowns source doesn't answer
  detailLevel: 'complete' | 'partial' | 'minimal';
}
```

### Change 3: Add reqTags to PipelineUserStory (around line 333)

Find the `PipelineUserStory` interface and add:

```typescript
export interface PipelineUserStory {
  id: string;
  title: string;
  persona: string;
  goal: string;
  benefit: string;
  acceptanceCriteria: string[];
  priority: 'high' | 'medium' | 'low';
  storyPoints?: number;
  sourceSection: string;
  reqTags?: number[];          // ADD THIS — [Req #N] requirement tags
}
```

### Change 4: Expand PipelineStage type (around line 361)

Change from:
```typescript
export type PipelineStage = 1 | 2 | 3 | 4 | 5;
```
To:
```typescript
export type PipelineStage = 1 | 2 | 3 | 4 | 5 | 6;
```

### Change 5: Add stage 6 to PipelineProgress (around line 370)

Find `stageProgress` inside `PipelineProgress` and add stage 6:

```typescript
export interface PipelineProgress {
  currentStage: PipelineStage;
  stageProgress: {
    1: StageProgress;
    2: StageProgress;
    3: StageProgress;
    4: StageProgress;
    5: StageProgress;
    6: StageProgress;     // ADD THIS
  };
  startTime: number;
  estimatedTimeRemaining: number;
}
```

### Change 6: Add validation and iterationsRun to PipelineResult (around line 384)

```typescript
export interface PipelineResult {
  comprehension: ComprehensionOutput;
  classification: ClassificationOutput;
  structural: StructuralOutput;
  refinement: RefinementOutput;
  mandatory: MandatoryOutput;
  totalDuration: number;
  stagesCompleted: PipelineStage[];
  // ADD THESE 2 FIELDS:
  validation?: ValidationOutput;
  iterationsRun?: number;
}
```

### Change 7: Add 4 new interfaces after PipelineResult (around line 401)

Insert these after `PipelineResult`:

```typescript
export interface TraceabilityRow {
  reqNum: number;
  description: string;
  documentSections: string[];    // Which output sections address this requirement
  userStoryIds: string[];        // Which US-XXX stories cover this requirement
  status: 'covered' | 'partial' | 'missing';
}

export interface AuditCheckItem {
  category: 'requirements' | 'scope' | 'diagrams' | 'structure' | 'stories' | 'formatting';
  rule: string;
  passed: boolean;
  detail: string;      // Why it passed or failed
}

export interface DetectedFailure {
  pattern: string;        // scope_smoothing, confident_exclusion, decision_override, etc.
  location: string;       // Section or story where detected
  evidence: string;       // What triggered the detection
  severity: 'hard_fail' | 'scored';
}

export interface ValidationOutput {
  // Step 4: Requirements Traceability
  traceabilityTable: TraceabilityRow[];
  traceabilityCoverage: number;      // percentage 0-100
  missingTraceability: number[];     // Req #s not fully traced
  // Step 5: Self-Audit
  auditChecklist: AuditCheckItem[];
  auditScore: number;                // 0-100, min 85 to pass
  auditPassed: boolean;
  // Failure Pattern Detection
  detectedFailures: DetectedFailure[];
  hardFailCount: number;
  // Overall gate
  passed: boolean;
  failureReasons: string[];
  iterationNumber: number;
}
```

---

## src/skills.ts Changes

This is the largest set of changes. The file went from ~4200 lines to ~6296 lines.

### Change 1: New imports (top of file, lines 3-45)

Add to existing import from `'./types'`:

```typescript
import {
  // ... existing imports ...
  type ExtractedRequirement,
  type RequirementGap,
  type AuditCheckItem,
  type DetectedFailure,
  type ValidationOutput,
} from './types';
```

### Change 2: RequestThrottler class + exports (lines 56-157)

Add near the top of the file (after imports):

```typescript
// Request throttler to avoid API rate limits during batch operations
class RequestThrottler {
  private concurrency: number;
  private delayMs: number;
  private _enabled: boolean = true;

  constructor(concurrency: number, delayMs: number) {
    this.concurrency = concurrency;
    this.delayMs = delayMs;
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  async throttle<T>(fn: () => Promise<T>): Promise<T> {
    if (!this._enabled) return fn();
    await new Promise(resolve => setTimeout(resolve, this.delayMs));
    return fn();
  }

  async mapThrottled<T, R>(
    items: T[],
    fn: (item: T) => Promise<R>
  ): Promise<R[]> {
    if (!this._enabled) {
      return Promise.all(items.map(fn));
    }
    const results: R[] = [];
    for (let i = 0; i < items.length; i += this.concurrency) {
      const batch = items.slice(i, i + this.concurrency);
      const batchResults = await Promise.all(batch.map(fn));
      results.push(...batchResults);
      if (i + this.concurrency < items.length) {
        await new Promise(resolve => setTimeout(resolve, this.delayMs));
      }
    }
    return results;
  }
}

export const apiThrottler = new RequestThrottler(2, 500);

export function disableThrottlingForTests(): void {
  apiThrottler.setEnabled(false);
}

export function enableThrottling(): void {
  apiThrottler.setEnabled(true);
}

// Runtime config setter for tests and CLI scripts
let runtimeConfig: AppConfig | null = null;

export function setConfig(config: AppConfig): void {
  runtimeConfig = config;
}
```

### Change 3: Stage 1 Enhancement - runRequirementExtraction() (after runStage1Comprehension, ~line 4224)

Add this new function:

```typescript
async function runRequirementExtraction(
  epicContent: string,
  comprehension: ComprehensionOutput
): Promise<{
  extractedRequirements: ExtractedRequirement[];
  requirementCount: number;
  gapAnalysis: RequirementGap[];
  validOpenQuestions: string[];
}>
```

**System prompt instructs AI to:**
- Extract every distinct requirement as numbered list (functional, infrastructure, operational)
- Perform gap analysis per requirement
- Return JSON with extractedRequirements[], gapAnalysis[], validOpenQuestions[]

**Key prompt rule (line ~4256):**
```
GRANULARITY GUIDE (CRITICAL): You MUST produce 5-15 requirements. If you have more than 15,
you are over-splitting — merge related items. Group related sub-items: "support OAuth 2.0
with Google and GitHub SSO" is ONE requirement, not three.
```

### Change 4: Integrate extraction into runStage1Comprehension() (line ~4206)

After the base comprehension call, add:

```typescript
// Refinement Process Steps 1 & 2: Requirement Extraction + Gap Analysis
try {
  const reqExtraction = await runRequirementExtraction(epicContent, baseComprehension);
  console.log(`[Stage 1] Extracted ${reqExtraction.requirementCount} requirements`);
  return {
    ...baseComprehension,
    extractedRequirements: reqExtraction.extractedRequirements,
    requirementCount: reqExtraction.requirementCount,
    gapAnalysis: reqExtraction.gapAnalysis,
    validOpenQuestions: reqExtraction.validOpenQuestions
  };
} catch (err) {
  console.error('[Stage 1] Requirement extraction failed, continuing without:', err);
  return baseComprehension;
}
```

### Change 5: Stage 4 - refineSingleSectionDynamic() new parameter (line ~4750)

Add `extractedRequirements` parameter to the function signature:

```typescript
async function refineSingleSectionDynamic(
  section: DiscoveredSection,
  score: SectionScore | undefined,
  transformation: TransformationAction | undefined,
  template: LoadedCategoryTemplate,
  projectName: string,
  projectEssence: string,
  extractedRequirements: ExtractedRequirement[] = []  // NEW PARAMETER
): Promise<PipelineRefinedSection>
```

Add **CONTENT INTEGRITY** rules to the system prompt (after existing ANTI-PATTERNS block):

```typescript
${extractedRequirements.length > 0 ? `
EXTRACTED REQUIREMENTS (THE CONTRACT - all relevant ones must be traceable):
${extractedRequirements.map(r => `[Req #${r.reqNum}] ${r.description}`).join('\n')}

STEP 3A - CONTENT INTEGRITY (mandatory):
- No requirement left behind: every Req # relevant to THIS section MUST appear
- No scope invention: do NOT add "non-goals" or "out of scope" unless source explicitly states it
- No decision invention: do NOT change the source's approach (e.g., Kafka->polling)
- No tech substitution: preserve exact algorithms, protocols, system names
- Say it once: do NOT repeat same info across sections
- 300-word ceiling per section
- Tag requirements inline with [Req #N]
- Replace [TBD] placeholders with reasonable estimates. NEVER output [TBD], [TODO], or [PLACEHOLDER]` : ''}
```

### Change 6: Stage 4 - generateMissingSectionDynamic() new parameter (line ~4891)

Same pattern - add `extractedRequirements` parameter:

```typescript
async function generateMissingSectionDynamic(
  sectionTitle: string,
  comprehension: ComprehensionOutput,
  template: LoadedCategoryTemplate,
  projectName: string,
  extractedRequirements: ExtractedRequirement[] = []  // NEW PARAMETER
): Promise<PipelineRefinedSection>
```

Add similar CONTENT INTEGRITY prompt injection (slightly different - scoped to section):

```typescript
${extractedRequirements.length > 0 ? `
EXTRACTED REQUIREMENTS (THE CONTRACT):
${extractedRequirements.map(r => `[Req #${r.reqNum}] ${r.description}`).join('\n')}

STEP 3A - CONTENT INTEGRITY:
- Only address requirements relevant to "${sectionTitle}"
- No scope invention, no decision invention, no tech substitution
- Tag requirements inline with [Req #N]
- NEVER output [TBD], [TODO], or [PLACEHOLDER]` : ''}
```

### Change 7: Stage 4 - runStage4Refinement() pass requirements through (lines ~5057, ~5098)

At the call sites for `refineSingleSectionDynamic` and `generateMissingSectionDynamic`, pass requirements:

```typescript
// When calling refineSingleSectionDynamic:
refineSingleSectionDynamic(
  section, score, transformation, template, projectName,
  comprehension.projectEssence,
  comprehension.extractedRequirements || []  // NEW ARG
)

// When calling generateMissingSectionDynamic:
generateMissingSectionDynamic(
  missingSectionTitle, comprehension, template, projectName,
  comprehension.extractedRequirements || []  // NEW ARG
)
```

### Change 8: Stage 5B - runStage5BUserStories() new parameter + reqTags (line ~5203)

Add `extractedRequirements` parameter:

```typescript
async function runStage5BUserStories(
  refinement: RefinementOutput,
  classification: ClassificationOutput,
  extractedRequirements: ExtractedRequirement[] = []  // NEW PARAMETER
): Promise<{ stories: PipelineUserStory[]; coverage: CoverageReport }>
```

Add requirements to the system prompt:

```typescript
${extractedRequirements.length > 0 ? `
REQUIREMENTS CONTRACT (from Step 1):
${extractedRequirements.map(r => `[Req #${r.reqNum}] ${r.description}`).join('\n')}

STEP 3C - USER STORY RULES (mandatory):
- FULL COVERAGE: Every Req # must map to at least 1 story. Tag with "reqTags" array.
- No orphan stories: every story must trace back to at least one Req #
- Match source framing exactly
- If requirement > 5 points, break into multiple stories sharing reqTags` : ''}
```

Update the JSON output format to expect `reqTags`:
```json
{ "persona": "...", "goal": "...", "benefit": "...", "reqTags": [1, 4] }
```

Parse `reqTags` from response into `PipelineUserStory.reqTags`.

### Change 9: Stage 5 - assembleEpicWithEmbedding() render [Req #N] tags (lines ~5640, ~5677)

In **both** story rendering paths (embedded and fallback), add:

```typescript
const reqTagStr = story.reqTags?.length
  ? ` [${story.reqTags.map(n => `Req #${n}`).join(', ')}]`
  : '';
content += `**${newId}: ${storyTitle}**${pointsLabel}${reqTagStr} ${emoji}\n`;
```

There are TWO places this appears - both the embedded (inside-section) path and the fallback (appended-at-end) path.

### Change 10: Stage 5 - runStage5Mandatory() pass requirements (line ~5727)

```typescript
const userStoriesResult = await runStage5BUserStories(
  refinement,
  classification,
  comprehension.extractedRequirements || []  // NEW ARG
);
```

### Change 11: NEW FUNCTION - detectFailurePatterns() (lines 5754-5892)

This is a pure TypeScript function (no AI calls). Add it before `runStage6Validation`:

```typescript
function detectFailurePatterns(
  epic: string,
  requirements: ExtractedRequirement[],
  stories: PipelineUserStory[],
  _diagram: string,
  sourceEpic?: string  // For [TBD] comparison
): DetectedFailure[]
```

**Detects 8 failure patterns:**

| # | Pattern | Detection Method | Severity |
|---|---------|-----------------|----------|
| 1 | `scope_smoothing` | For each requirement, check if key terms appear in output | scored |
| 2 | `confident_exclusion` | Detect "non-goal"/"out of scope" not in source | scored |
| 3 | `repetition_bloat` | Find repeated 10+ word phrases | scored |
| 4 | `template_contamination` | Count filler phrases ("This ensures...", "This approach...") | scored if <5, hard_fail if >=5 |
| 5 | `partial_story_coverage` | Count stories without reqTags. **Threshold: >50% uncovered = hard_fail** | scored or hard_fail |
| 6 | `template_artifacts` | Regex for [TODO], [TBD], lorem ipsum. **Compares against sourceEpic** - demotes to 'scored' if from source | scored or hard_fail |
| 7 | `template_stutter` | Detect repeated section intros | scored |

**Key: [TBD] source comparison logic:**
```typescript
const sourcePlaceholderCount = sourceEpic
  ? (sourceEpic.match(/\[TODO\]|\[TBD\]|\[Content needed\]|lorem ipsum/gi) || []).length
  : 0;
const isFromSource = sourcePlaceholderCount > 0 && placeholderMatches.length <= sourcePlaceholderCount;
// If from source, demote to 'scored' instead of 'hard_fail'
severity: isFromSource ? 'scored' : 'hard_fail'
```

### Change 12: NEW FUNCTION - runStage6Validation() (lines 5901-6095)

```typescript
export async function runStage6Validation(
  assembledEpic: string,
  extractedRequirements: ExtractedRequirement[],
  userStories: PipelineUserStory[],
  diagram: string,
  iterationNumber: number,
  previousFailures?: string[],
  sourceEpic?: string  // For [TBD] comparison
): Promise<ValidationOutput>
```

**Part A - AI call** (1 API call):
- System prompt instructs AI to build traceability table + run self-audit
- Returns JSON: `{ traceabilityTable[], auditChecklist[], auditScore, failureReasons[] }`
- If no extractedRequirements → skip AI, return default passing result

**Part B - Deterministic checks** (no API call):
- Calls `detectFailurePatterns()` with sourceEpic parameter
- Counts hard_fail patterns

**Pass criteria (IMPORTANT):**
```typescript
// Pass criteria: score >= 85 and no hard fails
// Note: traceabilityCoverage from AI is noisy (varies 40-100% for same content) - NOT a gate
const auditPassed = auditScore >= 85 && hardFailCount === 0;
```

### Change 13: REWRITE - runPremiumPipeline() with iterative loop (lines 6097-6296)

This is the **orchestrator rewrite**. The existing function is modified to:

```typescript
export async function runPremiumPipeline(
  epicContent: string,
  onProgress?: PipelineProgressCallback
): Promise<PipelineResult>
```

**Key constants:**
```typescript
const MAX_ITERATIONS = 5;
```

**Structure:**
```
Stages 1-3: Run ONCE (stable)
  Stage 1: Comprehension + Requirement Extraction
  Stage 2: Classification
  Stage 3: Structural Assessment

for (iteration = 1 to MAX_ITERATIONS):
  Stage 4: Content Refinement
    - Pass original epicContent (NOT modified with failure context)
    - Pass comprehension with extractedRequirements
  Stage 5: Diagram + Stories
    - Pass extractedRequirements to story generation
  Stage 6: Validation Gate
    - Pass sourceEpic = epicContent for [TBD] comparison
    - Pass previousFailures from last iteration
  if validation.passed:
    break  // Success!
  else:
    previousFailures = validation.failureReasons.slice(0, 10)
    // Loop back to Stage 4

Return PipelineResult with:
  - stagesCompleted: [1, 2, 3, 4, 5, 6]
  - iterationsRun: actual count
  - validation: final ValidationOutput
```

**CRITICAL: Do NOT inject failure context into epicContent:**
```typescript
// Pass original epicContent always - do NOT append failure context to epicContent
// (appending confuses Stage 4 section parsing and causes iteration degradation)
refinement = await withRetry(
  () => runStage4Refinement(
    epicContent,  // ALWAYS the original, never modified
    ...
  )
);
```

---

## src/App.tsx Changes

### Change 1: Add Stage 6 to pipelineStages state (line ~1053)

Find the `pipelineStages` state declaration and add stage 6:

```typescript
const [pipelineStages, setPipelineStages] = useState<Record<PipelineStage, StageProgress>>({
  1: { status: 'pending', message: 'Deep Comprehension' },
  2: { status: 'pending', message: 'Category Classification' },
  3: { status: 'pending', message: 'Structural Assessment' },
  4: { status: 'pending', message: 'Content Refinement' },
  5: { status: 'pending', message: 'Mandatory Sections' },
  6: { status: 'pending', message: 'Validation Gate' }    // ADD THIS
});
```

### Change 2: Add Stage 6 to ALL reset handlers

Search for every `setPipelineStages({` call and add stage 6. There are at least 3 locations:

**Location 1 (~line 1747)** - "New Epic" button:
```typescript
setPipelineStages({
  1: { status: 'pending', message: '' },
  2: { status: 'pending', message: '' },
  3: { status: 'pending', message: '' },
  4: { status: 'pending', message: '' },
  5: { status: 'pending', message: '' },
  6: { status: 'pending', message: '' }    // ADD THIS
});
```

**Location 2 (~line 3167)** - Pipeline start:
```typescript
setPipelineStages({
  1: { status: 'pending', message: 'Deep Comprehension' },
  2: { status: 'pending', message: 'Category Classification' },
  3: { status: 'pending', message: 'Structural Assessment' },
  4: { status: 'pending', message: 'Content Refinement' },
  5: { status: 'pending', message: 'Mandatory Sections' },
  6: { status: 'pending', message: 'Validation Gate' }    // ADD THIS
});
```

**Location 3 (~line 3510)** - Epic load:
```typescript
setPipelineStages({
  1: { status: 'pending', message: '' },
  2: { status: 'pending', message: '' },
  3: { status: 'pending', message: '' },
  4: { status: 'pending', message: '' },
  5: { status: 'pending', message: '' },
  6: { status: 'pending', message: '' }    // ADD THIS
});
```

### Change 3: Update stage iteration array (line ~5476)

Find `[1, 2, 3, 4, 5]` in the pipeline stages rendering and change to:
```typescript
[1, 2, 3, 4, 5, 6]
```

### Change 4: Add validation result display (line ~5588)

In the pipeline result display section, add audit score and iterations:

```typescript
{pipelineResult?.validation && (
  <div>
    <span>Audit Score: <strong>{pipelineResult.validation.auditScore}/100</strong></span>
    <span>Iterations: <strong>{pipelineResult.iterationsRun || 1}</strong></span>
  </div>
)}
```

---

## src/mockGitLabData.ts Changes

### Change 1: Add mock issue creation functions (after existing mock functions, ~line 2197)

```typescript
export async function mockCreateGitLabIssue(
  _config: GitLabConfig,
  params: CreateIssueParams,
  _groupId?: string
): Promise<GitLabIssueResult> {
  // Returns mock issue with incrementing IID
}

export async function mockLinkIssueToEpic(
  _config: GitLabConfig,
  epicIid: number,
  issueId: number,
  _groupId?: string
): Promise<{ success: boolean; error?: string }> {
  // Returns { success: true }
}

export async function mockFetchEpicIssues(
  _config: GitLabConfig,
  epicIid: number,
  _groupId?: string
): Promise<{ success: boolean; data?: Array<...>; error?: string }> {
  // Returns mock linked issues
}

export function shouldUseMockGitLab(): boolean {
  return MOCK_GITLAB_ENABLED;
}
```

---

## src/test/pipeline.test.ts Changes

This file was **substantially rewritten**. The easiest approach is to **replace the entire file** from the zip.

**Key additions:**
- Mock responses for requirement extraction (Stage 1) and validation (Stage 6)
- New test sections:
  - "Stage 1: Requirement Extraction" - tests extraction and gap analysis
  - "Stage 6: Validation Gate" - 5 test cases:
    - Build traceability table via AI
    - Detect failure patterns deterministically
    - Detect template artifacts
    - Skip AI when no requirements
    - Accept previous failures for context
  - "Pipeline Orchestrator" - 4 test cases:
    - Run all 6 stages in sequence
    - Report progress for all 6 stages
    - Return complete PipelineResult with validation
    - Handle stage failure gracefully
  - "Backward Compatibility" - 2 test cases

**Total: 37 tests** (all passing)

---

## Verification Checklist

After applying all changes, verify:

### Unit Tests
```bash
npm run test:run
# Expected: 37/37 pipeline tests pass
# Expected: 295/297 total tests pass (2 pre-existing e2e failures)
```

### Category Validation (requires OpenAI API key)
```bash
OPENAI_API_KEY=sk-... npx tsx src/test/run-category-validation.ts
```

**Expected results:**
| Category | Expected |
|----------|----------|
| integration_spec | PASS (score 85, iter 1) |
| technical_design | PASS (score 87, iter 1) |
| feature_specification | PASS (score 85, iter 1) |
| api_specification | PASS (score 85, iter 1) |
| infrastructure_design | PASS (score 85, iter 1) |
| migration_plan | PASS (needs testing) |
| business_requirement | PASS (needs testing) |

### Quick Smoke Test
1. Start dev server: `npm run dev`
2. Open Settings, configure OpenAI API key
3. Go to Epic Editor, paste any epic content
4. Click "Refine" (purple button)
5. Verify 6 pipeline stages appear (including "Validation Gate")
6. Verify stories have `[Req #N]` tags
7. Verify audit score and iteration count displayed

---

## Key Tuning Parameters

If quality checks fail, these are the tunable values:

| Parameter | Location | Current Value | Effect |
|-----------|----------|---------------|--------|
| `MAX_ITERATIONS` | skills.ts ~line 6103 | 5 | Max refinement loops |
| `auditScore threshold` | skills.ts ~line 6004 | >= 85 | Pass gate score |
| `partial_story_coverage threshold` | skills.ts ~line 5858 | > 0.5 | Hard-fail if >50% uncovered |
| `Q10 traceability threshold` | run-category-validation.ts ~line 154 | >= 60% | External quality check |
| Extraction granularity | skills.ts ~line 4256 | 5-15 requirements | Controls requirement count |
| `MAX_AUTO_GENERATED` sections | skills.ts (Stage 4) | 5 | Cap on generated sections |
