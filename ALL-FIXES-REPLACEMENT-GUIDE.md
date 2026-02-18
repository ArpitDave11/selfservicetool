# Complete Replacement Guide — All Bug Fixes + Title/Header Fixes

Apply these changes to **3 files** on your remote desktop. Each section shows the **OLD** code to find and the **NEW** code to replace it with.

**Total: 10 replacements across 3 files**

---

## FILE 1: `src/skills.ts` (8 changes)

---

### Change 1 of 8 — Add `sanitizeProjectName()` utility function (~line 652)

**FIND THIS (OLD):**
```typescript
// Small delay for UI feedback
const mockDelay = () => new Promise(resolve => setTimeout(resolve, 300));
```

**REPLACE WITH (NEW):**
```typescript
// Small delay for UI feedback
const mockDelay = () => new Promise(resolve => setTimeout(resolve, 300));

/**
 * Sanitize projectName for use as document title.
 * Ensures the H1 heading is a proper short title, not a long sentence or truncated text.
 * - If <=60 chars and <=8 words, keep as-is
 * - Otherwise truncate to 8 words / 60 chars, removing trailing incomplete words
 */
export function sanitizeProjectName(name: string): string {
  const trimmed = name.trim();
  const words = trimmed.split(/\s+/);

  // Already a reasonable title
  if (trimmed.length <= 60 && words.length <= 8) {
    // Still check for single-char trailing word (truncation artifact)
    if (words.length > 1 && words[words.length - 1].length <= 1) {
      return words.slice(0, -1).join(' ');
    }
    return trimmed;
  }

  // Truncate to first 8 words
  let sanitized = words.slice(0, 8).join(' ');
  if (sanitized.length > 60) {
    sanitized = sanitized.substring(0, 60);
    // Remove trailing partial word
    const lastSpace = sanitized.lastIndexOf(' ');
    if (lastSpace > 10) {
      sanitized = sanitized.substring(0, lastSpace);
    }
  }

  // Remove trailing single-char word (truncation artifact like "e" or "a")
  sanitized = sanitized.replace(/\s+\S{1,2}$/, '').trim();

  return sanitized || 'Untitled Project';
}
```

---

### Change 2 of 8 — Update `generateEpic()` to use sanitized title + document identity (~line 850)

**FIND THIS (OLD):**
```typescript
// Generate Epic Skill - Creates full 17-section epic
async function generateEpic(data: RefinedData, projectName: string, blueprintCode?: string): Promise<GenerateResult> {
  await mockDelay();

  // Build the epic document - use project name as title
  let epic = `# ${projectName}\n\n`;
  epic += `*Generated on ${new Date().toLocaleDateString()}*\n\n---\n\n`;
```

**REPLACE WITH (NEW):**
```typescript
// Generate Epic Skill - Creates full 17-section epic
async function generateEpic(data: RefinedData, projectName: string, blueprintCode?: string): Promise<GenerateResult> {
  await mockDelay();

  // Sanitize project name for H1 title — prevent sentence-as-title and truncation
  const title = sanitizeProjectName(projectName);

  // Build the epic document with proper document identity
  let epic = `# ${title}\n\n`;

  // Document identity block
  epic += `| | |\n|---|---|\n`;
  epic += `| **Status** | Draft |\n`;
  epic += `| **Owner** | _TBD_ |\n`;
  epic += `| **Last Updated** | ${new Date().toLocaleDateString()} |\n\n`;

  epic += `*Generated on ${new Date().toLocaleDateString()}*\n\n---\n\n`;
```

---

### Change 3 of 8 — Fix linkStyle validation in `validateMermaidDiagram()` (~line 2472)

**FIND THIS (OLD):**
```typescript
  // Remove any trailing content after diagram
  const endMarkers = ['TYPE:', 'REASONING:', '---'];
  for (const marker of endMarkers) {
    const idx = mermaid.indexOf(marker);
    if (idx > 0) {
      mermaid = mermaid.substring(0, idx).trim();
    }
  }

  return mermaid;
}
```

**REPLACE WITH (NEW):**
```typescript
  // Remove any trailing content after diagram
  const endMarkers = ['TYPE:', 'REASONING:', '---'];
  for (const marker of endMarkers) {
    const idx = mermaid.indexOf(marker);
    if (idx > 0) {
      mermaid = mermaid.substring(0, idx).trim();
    }
  }

  // Bug #4 fix: Validate and fix linkStyle index mismatches
  // Count all connections (arrows) in the diagram
  const arrowPatterns = /(-->|-.->|==>|--x|--o|~~~|--\|[^|]*\|-->|==\|[^|]*\|==>)/g;
  const connectionCount = (mermaid.match(arrowPatterns) || []).length;

  // Find all linkStyle declarations and check indices
  const linkStyleLines = mermaid.match(/^\s*linkStyle\s+.+$/gm) || [];
  if (linkStyleLines.length > 0 && connectionCount > 0) {
    // Extract all referenced indices (including comma-separated like "linkStyle 0,1")
    let maxIndex = -1;
    for (const line of linkStyleLines) {
      const indexMatch = line.match(/linkStyle\s+([\d,\s]+)/);
      if (indexMatch) {
        const indices = indexMatch[1].split(',').map(s => parseInt(s.trim()));
        for (const idx of indices) {
          if (idx > maxIndex) maxIndex = idx;
        }
      }
    }

    // If any linkStyle index >= connection count, strip ALL linkStyle to prevent render failure
    if (maxIndex >= connectionCount) {
      console.warn(`[validateMermaid] linkStyle index ${maxIndex} exceeds connection count ${connectionCount}. Stripping all linkStyle declarations.`);
      mermaid = mermaid.replace(/^\s*linkStyle\s+.+$/gm, '').replace(/\n{3,}/g, '\n\n');
    }
  } else if (linkStyleLines.length > 0 && connectionCount === 0) {
    // linkStyle present but no connections found — strip to be safe
    mermaid = mermaid.replace(/^\s*linkStyle\s+.+$/gm, '').replace(/\n{3,}/g, '\n\n');
  }

  return mermaid;
}
```

---

### Change 4 of 8 — Add linkStyle rules to `fixMermaidDiagram()` AI prompt (~line 3019)

**FIND THIS (OLD):**
```typescript
RULES:
1. Return ONLY the fixed Mermaid code - no explanations, no markdown
2. Keep the same diagram type (flowchart/sequence/etc)
3. DO NOT simplify or remove any nodes/connections - only fix syntax errors
4. Ensure all node IDs are valid (alphanumeric, underscores allowed, no spaces or special chars)
5. Ensure all labels are properly quoted with double quotes if they contain special characters
6. Fix any invalid arrow syntax or subgraph definitions
7. Ensure subgraphs have proper opening and closing
8. Do NOT include markdown code fences like \`\`\`mermaid or \`\`\``;
```

**REPLACE WITH (NEW):**
```typescript
RULES:
1. Return ONLY the fixed Mermaid code - no explanations, no markdown
2. Keep the same diagram type (flowchart/sequence/etc)
3. DO NOT simplify or remove any nodes/connections - only fix syntax errors
4. Ensure all node IDs are valid (alphanumeric, underscores allowed, no spaces or special chars)
5. Ensure all labels are properly quoted with double quotes if they contain special characters
6. Fix any invalid arrow syntax or subgraph definitions
7. Ensure subgraphs have proper opening and closing
8. Do NOT include markdown code fences like \`\`\`mermaid or \`\`\`
9. If the error involves linkStyle index mismatch: DELETE ALL linkStyle declarations entirely. Do NOT attempt to reindex them.
10. DO NOT use linkStyle declarations unless the diagram is very simple (3 or fewer connections). Unstyled is the correct default.`;
```

---

### Change 5 of 8 — Fix legacy parser story IDs (Pattern 1 - new format, ~line 3541)

**FIND THIS (OLD):**
```typescript
      id: storyId || `story-${stories.length + 1}-${Date.now()}`,
```

**REPLACE WITH (NEW):**
```typescript
      id: storyId || `US-${String(stories.length + 1).padStart(3, '0')}`,
```

> **Location**: Inside the Pattern 1 (NEW FORMAT) `while` loop in `parseUserStoriesFromEpic()`, approximately line 3541.

---

### Change 6 of 8 — Fix legacy parser story IDs (Pattern 2 - legacy format, ~line 3571)

The Pattern 2 block **already uses** `story-${stories.length + 1}-${Date.now()}`. Find it inside the second `while` loop.

**FIND THIS (OLD):**
```typescript
      id: `story-${stories.length + 1}-${Date.now()}`,
```

**REPLACE WITH (NEW):**
```typescript
      id: `US-${String(stories.length + 1).padStart(3, '0')}`,
```

> **Location**: Inside the Pattern 2 (LEGACY FORMAT) `while` loop in `parseUserStoriesFromEpic()`.
> **Note**: Pattern 3 (bullet points) **also** needs the same format — but it may already be correct in your remote. Check both Pattern 2 (~line 3571) and Pattern 3 (~line 3592). Both should use `US-${String(stories.length + 1).padStart(3, '0')}`.

---

### Change 7 of 8 — Stop AI prompts from repeating long project name (1st occurrence, ~line 4753)

**FIND THIS (OLD):**
```typescript
Use the exact project name "${projectName}" when referencing the project:
```

**REPLACE WITH (NEW):**
```typescript
When referencing the project, use a short name (do NOT repeat long sentences as the project name):
```

> **Location**: In `refineExistingSection()`, end of the `userPrompt` string.

---

### Change 8 of 8 — Stop AI prompts from repeating long project name (2nd occurrence, ~line 4840)

**FIND THIS (OLD):**
```typescript
Use the exact project name "${projectName}" when referencing the project:
```

**REPLACE WITH (NEW):**
```typescript
When referencing the project, use a short name (do NOT repeat long sentences as the project name):
```

> **Location**: In `generateMissingSection()`, end of the `userPrompt` string.

---

### Change 9 of 8 — Fix "Generated on" date duplication in `assembleEpicWithEmbedding()` (~line 5185)

**FIND THIS (OLD):**
```typescript
  // Start with title and GitLab TOC
  let epic = `# ${projectName}\n\n`;
  epic += `[[_TOC_]]\n\n`; // GitLab Table of Contents
```

**REPLACE WITH (NEW):**
```typescript
  // Sanitize project name for H1 title — prevent sentence-as-title and truncation
  const title = sanitizeProjectName(projectName);

  // Start with title and GitLab TOC
  let epic = `# ${title}\n\n`;
  epic += `[[_TOC_]]\n\n`; // GitLab Table of Contents
```

---

### Change 10 of 8 — Fix "Generated on" date duplication (continued, ~line 5200)

**FIND THIS (OLD):**
```typescript
  // Add priority sections first
  for (const section of prioritySections) {
    let content = section.refinedContent.trim();
    if (!content.startsWith('##')) {
      content = `## ${section.sectionTitle}\n\n${content}`;
    }
    epic += content + '\n\n';
  }

  // Add separator after priority sections if any were added
  if (prioritySections.length > 0) {
    epic += `*Generated on ${new Date().toLocaleDateString()}*\n\n---\n\n`;
  } else {
    epic += `*Generated on ${new Date().toLocaleDateString()}*\n\n---\n\n`;
  }
```

**REPLACE WITH (NEW):**
```typescript
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
```

---

## FILE 2: `src/categoryTemplates.json` (1 change)

---

### Change 1 of 1 — Standardize US-001 three-digit format (~line 301)

**FIND THIS (OLD):**
```json
"titleFormat": "US-{nn}: {Short descriptive title, 3-6 words}",
"template": "**US-{nn}: {title}**\nAs a [persona], I want [action] so that [outcome]\n**Acceptance Criteria:** [testable criterion]",
"count": { "min": 3, "max": 7 },
"hint": "Each user story MUST begin with a bold, scannable title in the format 'US-01: One-Click Reorder' followed by the As a… statement. Titles should be unique, concise (3-6 words), and action-oriented. Each story must map to at least one testable acceptance criterion listed directly below it."
```

**REPLACE WITH (NEW):**
```json
"titleFormat": "US-{nnn}: {Short descriptive title, 3-6 words}",
"template": "**US-{nnn}: {title}**\nAs a [persona], I want [action] so that [outcome]\n**Acceptance Criteria:** [testable criterion]",
"count": { "min": 3, "max": 7 },
"hint": "Each user story MUST begin with a bold, scannable title in the format 'US-001: One-Click Reorder' followed by the As a… statement. Titles should be unique, concise (3-6 words), and action-oriented. Each story must map to at least one testable acceptance criterion listed directly below it."
```

---

## FILE 3: `src/MarkdownPreview.tsx` (1 change)

---

### Change 1 of 1 — Show specific Mermaid error messages (~line 55)

**FIND THIS (OLD):**
```typescript
      } catch (err) {
        setError('Diagram rendering error');
        console.error('Mermaid error:', err);
      }
    };

    renderDiagram();
  }, [chart]);

  if (error) {
    return (
      <div style={{
        padding: '12px',
        backgroundColor: UBS_COLORS.neutral50,
        borderRadius: '6px',
        border: `1px dashed ${UBS_COLORS.neutral200}`,
        color: UBS_COLORS.grayV,
        fontSize: '13px',
        textAlign: 'center',
        fontWeight: 300,
      }}>
        <span style={{ opacity: 0.6 }}>Diagram preview unavailable</span>
      </div>
    );
  }
```

**REPLACE WITH (NEW):**
```typescript
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // Provide specific error context for common issues
        if (errMsg.includes('linkStyle') || errMsg.includes('index')) {
          setError(`Diagram syntax error: linkStyle index mismatch. Try regenerating the diagram.`);
        } else {
          setError(`Diagram rendering error: ${errMsg.substring(0, 120)}`);
        }
        console.error('Mermaid error:', err);
      }
    };

    renderDiagram();
  }, [chart]);

  if (error) {
    return (
      <div style={{
        padding: '12px',
        backgroundColor: UBS_COLORS.neutral50,
        borderRadius: '6px',
        border: `1px dashed ${UBS_COLORS.neutral200}`,
        color: UBS_COLORS.grayV,
        fontSize: '13px',
        textAlign: 'center',
        fontWeight: 300,
      }}>
        <span style={{ opacity: 0.6 }}>{error}</span>
      </div>
    );
  }
```

---

## Summary Checklist

| # | File | What Changed |
|---|------|-------------|
| 1 | `src/skills.ts` ~line 652 | Added `sanitizeProjectName()` exported function |
| 2 | `src/skills.ts` ~line 850 | `generateEpic()` uses sanitized title + document identity block |
| 3 | `src/skills.ts` ~line 2472 | `validateMermaidDiagram()` linkStyle index validation |
| 4 | `src/skills.ts` ~line 3019 | `fixMermaidDiagram()` AI prompt rules 9-10 for linkStyle |
| 5 | `src/skills.ts` ~line 3541 | Pattern 1 parser: `story-N-timestamp` → `US-00N` |
| 6 | `src/skills.ts` ~line 3571 | Pattern 2 parser: `story-N-timestamp` → `US-00N` |
| 7 | `src/skills.ts` ~line 4753 | AI prompt: stop verbatim project name injection (1st) |
| 8 | `src/skills.ts` ~line 4840 | AI prompt: stop verbatim project name injection (2nd) |
| 9 | `src/skills.ts` ~line 5185 | `assembleEpicWithEmbedding()` uses sanitized title |
| 10 | `src/skills.ts` ~line 5200 | Strip old "Generated on" dates, add single new one |
| 11 | `src/categoryTemplates.json` ~line 301 | `US-{nn}`/`US-01` → `US-{nnn}`/`US-001` |
| 12 | `src/MarkdownPreview.tsx` ~line 55 | Specific Mermaid error messages + display actual error |

---

## What All These Fixes Do

### Bug #2: "Generated on" date duplication
**Before:** Each regeneration adds another "Generated on" line without removing old ones
**After:** Old dates are stripped from refined content; a single new date is added

### Bug #3: User story numbering inconsistency
**Before:** Mix of `US-01`, `US-001`, and `story-1-1771405148180` formats
**After:** Everything standardized to `US-001` three-digit format

### Bug #4: Mermaid diagram linkStyle crashes
**Before:** AI generates `linkStyle 5` but diagram only has 3 connections → render failure, generic "Diagram preview unavailable" error
**After:** Arrow count validated against linkStyle indices; mismatches auto-stripped; specific error messages shown; AI prompt rules prevent future linkStyle issues

### Title Issue: H1 is a sentence, not a title
**Before:** `# Help GitLab teams turn scattered project context into consistent, high-quality e`
**After:** `# Help GitLab teams turn scattered project` (max 8 words / 60 chars, trailing truncated words removed)

### Title Issue: Project name repeated everywhere
**Before:** AI prompts said "Use the exact project name" → full sentence injected in every section
**After:** Prompts say "use a short name (do NOT repeat long sentences as the project name)"

### Title Issue: No document identity
**Before:** Only `*Generated on 2/18/2026*` after title
**After:** Document identity table added:
```markdown
| | |
|---|---|
| **Status** | Draft |
| **Owner** | _TBD_ |
| **Last Updated** | 2/18/2026 |
```
