# Project Name Fix in 5-Stage Pipeline - Changelog

**Date:** 2026-02-11
**Issue:** Project name in pipeline output was derived from AI comprehension instead of original epic title

---

## Root Cause

When running the 5-stage premium pipeline, Stage 5A (`runStage5AArchitecture`) was **ignoring** the correct project title passed from the parent function and instead **re-deriving** it from the AI-generated `comprehension.projectEssence` field.

This caused:
1. Diagram generation to use a semantic description instead of actual project name
2. Updated epics to appear as "new" content instead of updates to existing epic
3. Inconsistent naming throughout the refined output

---

## The Bug

**File:** `src/skills.ts`

### Stage 5A Function (Line 4924-4932) - BEFORE

```typescript
async function runStage5AArchitecture(
  refinement: RefinementOutput,
  comprehension: ComprehensionOutput  // ← NO projectName parameter
): Promise<{ diagram: string; type: string }> {
  const refinedData = convertRefinementToRefinedData(refinement);

  // WRONG: Derives project name from AI-generated comprehension summary
  const projectName = comprehension.projectEssence.split(/[.!?]/)[0].substring(0, 50).trim() || 'System';
```

### The Call in Stage 5 (Line 5175) - BEFORE

```typescript
const architecture = await runStage5AArchitecture(refinement, comprehension);
// ← projectName NOT passed!
```

---

## Example of the Bug

| Original Epic Title | AI Comprehension Output | Stage 5A Used |
|---------------------|------------------------|---------------|
| `# Mobile Payment System` | `"A distributed payment platform that enables..."` | `"A distributed payment platform"` ❌ |
| `# Customer Portal Redesign` | `"A modern web application for self-service..."` | `"A modern web application for self-service"` ❌ |

The derived name was a **sentence fragment**, not the actual project title.

---

## The Fix

### Change 1: Add `projectName` Parameter to Stage 5A

**File:** `src/skills.ts`, Line 4924-4932

**BEFORE:**
```typescript
async function runStage5AArchitecture(
  refinement: RefinementOutput,
  comprehension: ComprehensionOutput
): Promise<{ diagram: string; type: string }> {
  const refinedData = convertRefinementToRefinedData(refinement);

  // Extract project name from comprehension
  const projectName = comprehension.projectEssence.split(/[.!?]/)[0].substring(0, 50).trim() || 'System';
```

**AFTER:**
```typescript
async function runStage5AArchitecture(
  refinement: RefinementOutput,
  comprehension: ComprehensionOutput,
  projectName: string  // Use the original project title, not derived from comprehension
): Promise<{ diagram: string; type: string }> {
  const refinedData = convertRefinementToRefinedData(refinement);

  // Use the passed projectName (original epic title) - DO NOT derive from comprehension
  console.log('[Stage 5A] Using project name:', projectName);
```

---

### Change 2: Pass `projectName` When Calling Stage 5A

**File:** `src/skills.ts`, Line 5173-5175

**BEFORE:**
```typescript
  // Run 5A and 5B sequentially to avoid rate limiting
  // Blueprint generation is heavy on tokens, so we run it first
  const architecture = await runStage5AArchitecture(refinement, comprehension);
```

**AFTER:**
```typescript
  // Run 5A and 5B sequentially to avoid rate limiting
  // Blueprint generation is heavy on tokens, so we run it first
  // Pass projectName to ensure diagram uses correct title (not derived from comprehension)
  const architecture = await runStage5AArchitecture(refinement, comprehension, projectName);
```

---

## Project Name Flow - AFTER FIX

```
Epic Loaded: "# Mobile Payment System"
                    ↓
extractProjectTitle() → "Mobile Payment System" ✅
                    ↓
runPremiumPipeline(originalProjectTitle) ✅
                    ↓
runStage5Mandatory(originalProjectTitle) → projectName = "Mobile Payment System" ✅
                    ↓
    ├── runStage5AArchitecture(projectName) → Uses "Mobile Payment System" ✅
    │
    └── assembleEpicWithEmbedding(projectName) → "# Mobile Payment System" ✅
```

Now all stages use the **same correct project name** from the original epic.

---

## Summary

| Item | Details |
|------|---------|
| **Files Changed** | `src/skills.ts` |
| **Lines Changed** | 4924-4932, 5173-5175 |
| **Change Type** | Bug fix - parameter propagation |
| **Impact** | Epic updates now preserve original project name |

---

## Verification

After this fix:
1. Load an existing epic (e.g., "Customer Portal Redesign")
2. Run the Premium Pipeline (⊕ Refine button)
3. The refined epic will have the **same title** as the original
4. Diagram will reference the correct project name
5. Updating the epic will correctly update the existing epic, not create a new one
