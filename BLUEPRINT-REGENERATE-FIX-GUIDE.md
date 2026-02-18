# Blueprint Regeneration Bug Fix — Replacement Guide

**Critical bug**: Clicking "Regenerate blueprint" destroys the user's entire refined epic content, replacing it with a blank 17-section template.

Apply this change to **1 file** (`src/App.tsx`) on your remote desktop.

**Total: 1 replacement in 1 file**

---

## Root Cause

In `regenerateBlueprint()` (App.tsx ~line 1991):

1. It calls `generateIntelligentBlueprint(state.data, ...)` using `state.data` — which may be **empty or stale** (never synced with editor content when epic is loaded from GitLab or manually edited)
2. After generating the diagram, it calls `runSkill('generate', { data: state.data })` which **rebuilds the entire 17-section epic from scratch**
3. The rebuilt epic (mostly "_To be defined_") **overwrites `editableEpic`**, destroying all user content

### Data flow (broken):
```
User's refined epic in editor (rich content)
    ↓ click "Regenerate"
generateIntelligentBlueprint(state.data)  ← state.data is empty/stale!
    ↓
runSkill('generate', { data: state.data }) ← rebuilds entire epic from scratch!
    ↓
setEditableEpic(result.epic)              ← OVERWRITES user's refined content!
    ↓
Result: All sections show "_To be defined_"
```

### Data flow (fixed):
```
User's refined epic in editor (rich content)
    ↓ click "Regenerate"
parseEpicToStageData(editableEpic)        ← parse CURRENT editor content
    ↓
generateIntelligentBlueprint(parsedData)  ← uses actual epic data
    ↓
replaceSectionInEpic(editableEpic, 6, newDiagram) ← updates ONLY section 6
    ↓
setEditableEpic(updatedEpic)              ← all other sections preserved!
```

---

## FILE: `src/App.tsx` (1 change)

### Change 1 of 1 — Fix `regenerateBlueprint()` to not destroy epic content (~line 1991)

**FIND THIS (OLD):**
```typescript
  // Regenerate blueprint with intelligent selection
  const regenerateBlueprint = async () => {
    const projectName = state.data['projectName']?.original || 'Untitled Project';
    setIsGeneratingBlueprint(true);
    setBlueprintReasoning('Analyzing epic content...');
    try {
      const blueprintResult = await generateIntelligentBlueprint(state.data, projectName);
      setBlueprintCode(blueprintResult.diagram);
      setBlueprintType(blueprintResult.type);
      setBlueprintReasoning(blueprintResult.reasoning);

      // Update the Epic with the new blueprint diagram
      if (editableEpic) {
        const result = await runSkill('generate', {
          data: state.data,
          projectName,
          blueprintCode: blueprintResult.diagram,
        }) as GenerateResult;
        setState(prev => ({ ...prev, generatedEpic: result.epic }));
        setEditableEpic(result.epic);
      }
    } catch (error) {
      console.error('Blueprint regeneration failed:', error);
      setBlueprintReasoning('Failed to regenerate. Using previous diagram.');
    } finally {
      setIsGeneratingBlueprint(false);
    }
  };
```

**REPLACE WITH (NEW):**
```typescript
  // Regenerate blueprint with intelligent selection
  const regenerateBlueprint = async () => {
    // Parse current epic content for data (not potentially stale/empty state.data)
    let dataForBlueprint = state.data;
    let projectName = state.data['projectName']?.original || 'Untitled Project';

    if (editableEpic) {
      const parsed = parseEpicToStageData(editableEpic);
      dataForBlueprint = parsed.data;
      projectName = parsed.projectName || projectName;
    }

    setIsGeneratingBlueprint(true);
    setBlueprintReasoning('Analyzing epic content...');
    try {
      const blueprintResult = await generateIntelligentBlueprint(dataForBlueprint, projectName);
      setBlueprintCode(blueprintResult.diagram);
      setBlueprintType(blueprintResult.type);
      setBlueprintReasoning(blueprintResult.reasoning);

      // Surgically update ONLY section 6 (Architecture Diagrams) in the epic
      // DO NOT call runSkill('generate') — that rebuilds the entire epic and destroys user content
      if (editableEpic) {
        const newDiagramSection = `## 6. Architecture Diagrams\n\n\`\`\`mermaid\n${blueprintResult.diagram}\n\`\`\`\n\n> *Diagram auto-generated from epic content. Regenerate in Blueprint tab to update.*\n`;
        const updatedEpic = replaceSectionInEpic(editableEpic, 6, newDiagramSection);
        setState(prev => ({ ...prev, generatedEpic: updatedEpic }));
        setEditableEpic(updatedEpic);
      }
    } catch (error) {
      console.error('Blueprint regeneration failed:', error);
      setBlueprintReasoning('Failed to regenerate. Using previous diagram.');
    } finally {
      setIsGeneratingBlueprint(false);
    }
  };
```

---

## What Changed (3 fixes in 1 replacement)

| # | Problem | Fix |
|---|---------|-----|
| 1 | `state.data` is empty/stale when epic was loaded from GitLab or manually edited | Now calls `parseEpicToStageData(editableEpic)` to extract data from the **current** editor content |
| 2 | `runSkill('generate', ...)` rebuilds the entire 17-section epic from scratch | **Removed entirely.** Now uses `replaceSectionInEpic(editableEpic, 6, ...)` to surgically update ONLY section 6 |
| 3 | `setEditableEpic(result.epic)` overwrites the user's refined content | Now `setEditableEpic(updatedEpic)` where `updatedEpic` preserves all sections except the updated diagram |

---

## Dependencies

This fix relies on two functions already in the codebase:

1. **`parseEpicToStageData()`** — exported from `skills.ts`, already imported in `App.tsx` (line 39). Parses markdown epic content back into structured `RefinedData`.

2. **`replaceSectionInEpic()`** — defined in `App.tsx` (line ~2623). Takes an epic string, section number, and new content; uses regex to replace only that section.

No new imports or functions needed.

---

## Test Results

15 tests in `src/test/blueprintRegenerate.test.ts` — all passing:

**Bug reproduction tests (prove the root cause):**
- Empty `state.data` produces blank "_To be defined_" template
- `runSkill('generate')` ignores editor content entirely
- `parseEpicToStageData` correctly extracts data from editor content

**Fix validation tests (prove the fix works):**
- `replaceSectionInEpic` updates ONLY section 6 content
- All other 16 sections preserved after diagram update
- Section count unchanged after replacement
- User stories, NFRs, team roles, Epic Status all survive
- New mermaid code block correctly embedded
- Edge cases: missing section 6, empty epic, large epic
