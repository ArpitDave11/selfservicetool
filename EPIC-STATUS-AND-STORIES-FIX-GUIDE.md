# Epic Status Ordering & Duplicate User Stories — Replacement Guide

Apply these changes to **1 file** (`src/skills.ts`) on your remote desktop.

**Total: 3 replacements in 1 file**

---

## What These Fixes Do

### Fix A: Epic Status comes too early
**Before:** Epic Status / document identity table appears immediately after the H1 title, before Objective, Scope, or Architecture — readers see "Status: Draft" with zero project context.
**After:** Epic Status is placed after section 4 (Assumptions), so readers first understand the project (Objective, Background, Scope, Assumptions) before seeing status metadata.

### Fix B: Duplicated "User Stories" section
**Before:** Section 11 has bullet-style user stories from Stage 4 refinement, THEN `### User Stories` subsection with US-001 formatted stories from Stage 5B — two separate story lists in one section.
**After:** Stage 4's inline stories are stripped before Stage 5B's professionally formatted stories are appended. One clean `### User Stories` subsection.

---

## FILE: `src/skills.ts` (3 changes)

---

### Change 1 of 3 — Move document identity from top to after section 4 in `generateEpic()` (~line 856)

**FIND THIS (OLD):**
```typescript
  // Build the epic document with proper document identity
  let epic = `# ${title}\n\n`;

  // Document identity block
  epic += `| | |\n|---|---|\n`;
  epic += `| **Status** | Draft |\n`;
  epic += `| **Owner** | _TBD_ |\n`;
  epic += `| **Last Updated** | ${new Date().toLocaleDateString()} |\n\n`;

  epic += `*Generated on ${new Date().toLocaleDateString()}*\n\n---\n\n`;
```

**REPLACE WITH (NEW):**
```typescript
  // Build the epic document — document identity comes after context sections (not at top)
  let epic = `# ${title}\n\n`;
  epic += `*Generated on ${new Date().toLocaleDateString()}*\n\n---\n\n`;
```

**AND ALSO** find the end of the section generation loop (~line 907). Find the closing of the last `else` block before the loop ends:

**FIND THIS (OLD):**
```typescript
      epic += `${content}\n\n`;
    }
  }

  // Generate the multilayer summary diagram
```

**REPLACE WITH (NEW):**
```typescript
      epic += `${content}\n\n`;
    }

    // Insert Epic Status after context sections (Objective, Background, Scope, Assumptions)
    // Readers need project context before seeing status metadata
    if (section.num === 4) {
      epic += `## Epic Status\n\n`;
      epic += `| Field | Value |\n|---|---|\n`;
      epic += `| **Status** | Draft |\n`;
      epic += `| **Owner** | _TBD_ |\n`;
      epic += `| **Last Updated** | ${new Date().toLocaleDateString()} |\n\n`;
    }
  }

  // Generate the multilayer summary diagram
```

> **Result:** Epic order becomes: Title → Objective → Background → Scope → Assumptions → **Epic Status** → Architecture → ... → Approvals

---

### Change 2 of 3 — Remove priority section treatment in `assembleEpicWithEmbedding()` (~line 5185)

**FIND THIS (OLD):**
```typescript
  // Separate priority sections (Epic Status) from regular sections
  // Note: TL;DR is now merged into Objective per template v2.1.0
  const prioritySections: typeof refinement.refinedSections = [];
  const regularSections: typeof refinement.refinedSections = [];

  for (const section of refinement.refinedSections) {
    const titleLower = section.sectionTitle.toLowerCase();
    // Epic Status (formerly Metadata Header) goes first
    if (titleLower === 'epic status' || titleLower === 'metadata header') {
      prioritySections.push(section);
    } else {
      regularSections.push(section);
    }
  }

  // Add priority sections first (strip any existing "Generated on" dates to prevent duplication)
  for (const section of prioritySections) {
    let content = section.refinedContent.trim();
    // Bug #2 fix: Remove any existing "Generated on" date lines from refined content
    content = content.replace(/\*Generated on .+?\*\s*\n?/g, '').trim();
    if (!content.startsWith('##')) {
      content = `## ${section.sectionTitle}\n\n${content}`;
    }
    epic += content + '\n\n';
  }

  // Add single "Generated on" date (replaces any old dates stripped above)
  epic += `*Generated on ${new Date().toLocaleDateString()}*\n\n---\n\n`;

  // Track if we've already embedded diagram/stories (only embed once)
  let diagramEmbedded = false;
  let storiesEmbedded = false;

  // Add all regular sections in their original order
  for (const section of regularSections) {
    let content = section.refinedContent.trim();
```

**REPLACE WITH (NEW):**
```typescript
  // Add "Generated on" date after TOC (single instance, before all sections)
  epic += `*Generated on ${new Date().toLocaleDateString()}*\n\n---\n\n`;

  // Track if we've already embedded diagram/stories (only embed once)
  let diagramEmbedded = false;
  let storiesEmbedded = false;

  // Add all sections in their original order
  // Epic Status appears in natural position (not forced to top), so readers get context first
  for (const section of refinement.refinedSections) {
    let content = section.refinedContent.trim();
    // Bug #2 fix: Remove any existing "Generated on" date lines from refined content
    content = content.replace(/\*Generated on .+?\*\s*\n?/g, '').trim();
```

> **What changed:** Removed the `prioritySections` / `regularSections` split. ALL sections now appear in their natural order. Epic Status is no longer forced to the top. The "Generated on" date is placed once after the TOC. The Bug #2 date-stripping fix is preserved (now applied to all sections).

---

### Change 3 of 3 — Strip duplicate user stories before embedding Stage 5B stories (~line 5237)

**FIND THIS (OLD):**
```typescript
    // Check if this is features/user stories section - embed stories (only once)
    const isStorySection = section.sectionTitle.toLowerCase().includes('feature') ||
                           section.sectionTitle.toLowerCase().includes('user stor');
    if (isStorySection && stories.length > 0 && !storiesEmbedded) {
      const priorityEmoji = defaults.priorityLevels;
      content += '\n\n### User Stories\n\n';
```

**REPLACE WITH (NEW):**
```typescript
    // Check if this is features/user stories section - embed stories (only once)
    const isStorySection = section.sectionTitle.toLowerCase().includes('feature') ||
                           section.sectionTitle.toLowerCase().includes('user stor');
    if (isStorySection && stories.length > 0 && !storiesEmbedded) {
      // Strip any existing user stories from Stage 4 content to prevent duplication
      // Remove any "### User Stories" subsection that Stage 4 refinement may have generated
      const existingStoriesIdx = content.search(/\n*###?\s*User Stories/i);
      if (existingStoriesIdx > 0) {
        content = content.substring(0, existingStoriesIdx).trim();
      }
      // Remove inline bullet-style US-XXX stories (without a header)
      content = content.replace(/\n[-*]\s*\*\*US-\d+[:\s].*$/gm, '').trim();

      const priorityEmoji = defaults.priorityLevels;
      content += '\n\n### User Stories\n\n';
```

> **What changed:** Before appending Stage 5B stories, the code now strips any existing `### User Stories` subsection and any inline `**US-XXX:` bullet stories from the Stage 4 refined content. This prevents the duplication where two sets of user stories appeared in the same section.

---

## Summary Checklist

| # | Location | What Changed |
|---|----------|-------------|
| 1a | `generateEpic()` ~line 856 | Removed document identity block from right after H1 title |
| 1b | `generateEpic()` ~line 907 | Added `## Epic Status` section after section 4 (Assumptions) in the loop |
| 2 | `assembleEpicWithEmbedding()` ~line 5185 | Removed `prioritySections` forcing Epic Status to top; all sections in natural order |
| 3 | `assembleEpicWithEmbedding()` ~line 5237 | Strip Stage 4 user stories before embedding Stage 5B formatted stories |

---

## Before/After Section Order

### Before (broken):
```
# Title
| Status | Draft |          ← status with no context
| Owner | _TBD_ |
*Generated on ...*
---
## Epic Status              ← forced to top (pipeline)
## 1. Objective
## 2. Background
## 3. Scope
...
## 11. Key Features & User Stories
  - Bullet stories (Stage 4)     ← DUPLICATE
  ### User Stories
    US-001... (Stage 5B)         ← DUPLICATE
```

### After (fixed):
```
# Title
*Generated on ...*
---
## 1. Objective             ← context first
## 2. Background & Context
## 3. Scope
## 4. Assumptions
## Epic Status              ← NOW after readers have context
| Status | Draft |
| Owner | _TBD_ |
## 5. Architecture
...
## 11. Key Features & User Stories
  ### Key Features (kept)
  ### User Stories           ← single clean list (Stage 5B only)
    US-001...
    US-002...
```
