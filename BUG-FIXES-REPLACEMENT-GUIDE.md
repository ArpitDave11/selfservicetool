# Bug Fixes Replacement Guide

Apply these changes to 3 files on your remote desktop. Each section shows the **OLD** code to find and the **NEW** code to replace it with.

---

## FILE 1: `src/skills.ts`

### Change 1 of 4 -- Bug #2: Fix "Generated on" date duplication (~line 5151)

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

### Change 2 of 4 -- Bug #3: Fix legacy parser story IDs (~line 3524 and ~line 3546)

**There are TWO places** in `parseUserStoriesFromEpic()` where `story-${...}` IDs are generated. Replace both.

#### 2a. Pattern 2 (Legacy "As a..." format) -- around line 3524

**FIND THIS (OLD):**
```typescript
      id: `story-${stories.length + 1}-${Date.now()}`,
```

**REPLACE WITH (NEW):**
```typescript
      id: `US-${String(stories.length + 1).padStart(3, '0')}`,
```

#### 2b. Pattern 3 (Bullet points fallback) -- around line 3546

**FIND THIS (OLD):**
```typescript
          id: `story-${stories.length + 1}-${Date.now()}`,
```

**REPLACE WITH (NEW):**
```typescript
          id: `US-${String(stories.length + 1).padStart(3, '0')}`,
```

---

### Change 3 of 4 -- Bug #4: Add linkStyle validation to `validateMermaidDiagram()` (~line 2433)

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

### Change 4 of 4 -- Bug #4: Add linkStyle rules to `fixMermaidDiagram()` AI prompt (~line 2973)

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

## FILE 2: `src/categoryTemplates.json`

### Change 1 of 1 -- Bug #3: Standardize US-001 format (~line 301)

**FIND THIS (OLD):**
```json
"titleFormat": "US-{nn}: {Short descriptive title, 3-6 words}",
"template": "**US-{nn}: {title}**\nAs a [persona], I want [action] so that [outcome]\n**Acceptance Criteria:** [testable criterion]",
"count": { "min": 3, "max": 7 },
"hint": "Each user story MUST begin with a bold, scannable title in the format 'US-01: One-Click Reorder' followed by the As a\u2026 statement. Titles should be unique, concise (3-6 words), and action-oriented. Each story must map to at least one testable acceptance criterion listed directly below it."
```

**REPLACE WITH (NEW):**
```json
"titleFormat": "US-{nnn}: {Short descriptive title, 3-6 words}",
"template": "**US-{nnn}: {title}**\nAs a [persona], I want [action] so that [outcome]\n**Acceptance Criteria:** [testable criterion]",
"count": { "min": 3, "max": 7 },
"hint": "Each user story MUST begin with a bold, scannable title in the format 'US-001: One-Click Reorder' followed by the As a\u2026 statement. Titles should be unique, concise (3-6 words), and action-oriented. Each story must map to at least one testable acceptance criterion listed directly below it."
```

---

## FILE 3: `src/MarkdownPreview.tsx`

### Change 1 of 1 -- Bug #4: Show specific error messages (~line 55)

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

| # | File | Bug | What Changed |
|---|------|-----|-------------|
| 1 | `src/skills.ts` ~line 5151 | #2 | Strip old "Generated on" dates before adding new one |
| 2a | `src/skills.ts` ~line 3524 | #3 | Legacy parser: `story-N-timestamp` -> `US-00N` |
| 2b | `src/skills.ts` ~line 3546 | #3 | Bullet parser: `story-N-timestamp` -> `US-00N` |
| 3 | `src/skills.ts` ~line 2433 | #4 | Add linkStyle index validation to `validateMermaidDiagram()` |
| 4 | `src/skills.ts` ~line 2973 | #4 | Add rules 9-10 to `fixMermaidDiagram()` prompt |
| 5 | `src/categoryTemplates.json` ~line 301 | #3 | `US-{nn}`/`US-01` -> `US-{nnn}`/`US-001` |
| 6 | `src/MarkdownPreview.tsx` ~line 55 | #4 | Show specific Mermaid error instead of generic message |

**Total: 6 replacements across 3 files**
