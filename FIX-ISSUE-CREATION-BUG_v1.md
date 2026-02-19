# Fix v1: "No User Stories Found" Issue Creation Bug

## Problem

Clicking **"Create Issues"** in the Epic Editor shows error:
> "No User Stories Found — Could not find user stories in Section 11"

Even though user stories are clearly visible in the generated/refined epic.

## Root Causes (4 bugs discovered via E2E testing with real AI)

### Bug 1: Hardcoded "Section 11" regex
**Where:** `src/skills.ts` line ~3460 (old code)
**Issue:** `parseUserStoriesFromEpic()` used `/##\s*11\.\s*Key Features/` — only matched `## 11.`. Pipeline generates sections with any number (`## 8.`, `## 12.`) or no number (`## User Stories`).

### Bug 2: Section match terminated at `###` sub-headers (THE MAIN BUG)
**Where:** `src/skills.ts` line ~3461
**Issue:** The `userStoriesMatch` regex included `\n###?\s*[A-Z]` in its termination lookahead. When the User Stories section had sub-headers like `### Infrastructure & Operational (Blockers — do first)`, the regex captured **only the empty header** (16 chars!) and terminated immediately — missing ALL story content below.

**Example assembled epic that triggered this:**
```markdown
## User Stories

### Infrastructure & Operational (Blockers — do first)    ← regex STOPPED here!

**US-001: Disable Axway file deletion** 🟡
> As a user, I want to...                                   ← all stories missed
```

### Bug 3: Title pattern `[^*]+` broke on backtick-code containing `*`
**Where:** `src/skills.ts` line ~3482
**Issue:** Story titles like `` Support `*`-enclosed parsing `` contain `*` inside backticks. The `([^*]+)` capture group stopped at this `*`, causing the entire story to be skipped. Also, assembly artifacts (`**`, `[Req #N]`) leaked into parsed goal text.

### Bug 4: No support for title+bullets format (0 AI stories scenario)
**Where:** `src/skills.ts` lines ~3523-3578
**Issue:** When Stage 5B stochastically generates 0 user stories, the assembled epic has stories in a simpler format from Stage 4's auto-generated section:
```markdown
**US-01: Title** [Req #N]
- Bullet point 1
- Bullet point 2
```
Pattern 1 expects `> As a... I want...` blockquotes and fails. Pattern 3 (bullet fallback) catches individual bullets as 23 separate garbage "stories" instead of grouping them under 10 proper parent titles.

---

## Files Changed

| File | Line(s) | What Changed |
|------|---------|-------------|
| `src/skills.ts` | 3460-3628 | `parseUserStoriesFromEpic()` — 4 fixes (see below) |
| `src/App.tsx` | 2344 | Error message: removed "Section 11" reference |
| `src/config.ts` | 199, 209 | `maxTokens: 4096` → `maxTokens: 10000` |

---

## Exact Code Changes

### Change 1: `src/skills.ts` — Section matching regex (line 3461-3463)

**FIND (OLD):**
```typescript
  const userStoriesMatch = epicContent.match(/###?\s*(?:\d+\.\s*)?User Stories[\s\S]*?(?=\n###?\s*[A-Z]|\n##\s*\d+\.|\n##\s[A-Z]|$)/i);
```

**REPLACE WITH (NEW):**
```typescript
  // NOTE: Termination must NOT include ### sub-headers — those are INSIDE the User Stories section
  // (e.g., "### Infrastructure & Operational"). Only stop at ## section-level headers.
  const userStoriesMatch = epicContent.match(/###?\s*(?:\d+\.\s*)?User Stories[\s\S]*?(?=\n##\s*\d+\.|\n##\s[A-Z]|$)/i);
```

**What changed:** Removed `\n###?\s*[A-Z]|` from the termination lookahead. `###` sub-headers are INSIDE the User Stories section (e.g., `### Infrastructure & Operational`), not section boundaries. Only `##` headers (like `## Open Questions`) should terminate the match.

---

### Change 2: `src/skills.ts` — Title capture pattern (line 3482)

**FIND (OLD):**
```typescript
  const newFormatPattern = /\*\*([A-Z]{2,3}-\d+):\s*([^*]+)\*\*[^\n]*\n>\s*As an?\s+([^,]+),?\s*I\s+want\s+(.+?)(?:,?\s*so\s+that\s+([^.\n]+))?[.\n]/gi;
```

**REPLACE WITH (NEW):**
```typescript
  const newFormatPattern = /\*\*([A-Z]{2,3}-\d+):\s*(.*?)\*\*[^\n]*\n>\s*As an?\s+([^,]+),?\s*I\s+want\s+(.+?)(?:,?\s*so\s+that\s+([^.\n]+))?[.\n]/gi;
```

**What changed:** Title capture group changed from `([^*]+)` to `(.*?)`. The old `[^*]+` stopped at any `*` character, breaking titles containing backtick-code like `` `*`-enclosed ``. The new `.*?` (non-greedy) matches any character until the closing `**`.

---

### Change 3: `src/skills.ts` — Add `cleanArtifacts()` helper + skip garbage (lines 3484-3501)

**ADD after the `newFormatPattern` line:**
```typescript
  // Helper: strip assembly artifacts from parsed text (e.g., trailing **, [Req #N] tags)
  function cleanArtifacts(text: string): string {
    return text
      .replace(/\*{1,2}\s*/g, '')         // strip stray * or **
      .replace(/\s*\[Req\s*#\d+(?:,\s*Req\s*#\d+)*\]/gi, '') // strip [Req #N] tags
      .trim();
  }
```

**MODIFY the match processing (inside the while loop):**
```typescript
    const storyId = match[1]?.trim();
    const title = cleanArtifacts(match[2]?.trim() || '');      // ← was: match[2]?.trim()
    const persona = match[3]?.trim();
    const goal = cleanArtifacts(match[4]?.trim() || '');       // ← was: match[4]?.trim()
    const benefit = match[5]?.trim();

    // Skip garbage stories (empty or very short titles)
    if (!title || title.length < 5) continue;                   // ← NEW LINE
```

**What changed:** Assembly produces goals like `disable Axway file deletion after MF pull** [Req #6]` — the `**` and `[Req #N]` are artifacts from the story merging process. `cleanArtifacts()` strips them. Also skips garbage stories with titles shorter than 5 chars (e.g., "And US-02)").

---

### Change 4: `src/skills.ts` — New Pattern 1.5 for title+bullets format (lines 3523-3578)

**ADD between Pattern 1's `return` block and Pattern 2:**
```typescript
  // Pattern 1.5 (TITLE + BULLETS FORMAT): **US-XX: Title** [optional metadata]\n- bullet\n- bullet
  // Common when Stage 4 auto-generates User Stories section or Stage 5B returns 0 stories.
  // Groups bullets under their parent title instead of treating each bullet as a separate story.
  const titleHeaderPattern = /\*\*([A-Z]{2,3}-\d+):\s*([^*]+)\*\*/g;
  const titlePositions: Array<{ id: string; title: string; startIdx: number }> = [];
  while ((match = titleHeaderPattern.exec(sectionContent)) !== null) {
    titlePositions.push({
      id: match[1].trim(),
      title: match[2].trim(),
      startIdx: match.index + match[0].length
    });
  }

  if (titlePositions.length >= 2) {
    console.log(`[parseUserStories] Found ${titlePositions.length} title headers, using title+bullets pattern`);
    for (let i = 0; i < titlePositions.length; i++) {
      const { id: storyId, title: storyTitle, startIdx } = titlePositions[i];
      const endIdx = i + 1 < titlePositions.length
        ? sectionContent.lastIndexOf('**', titlePositions[i + 1].startIdx - titlePositions[i + 1].title.length - 10)
        : sectionContent.length;
      const contentBlock = sectionContent.substring(startIdx, endIdx).trim();

      // Try to extract "As a... I want..." from the content block if present
      const asAMatch = contentBlock.match(/As an?\s+([^,]+),?\s*I\s+want\s+(.+?)(?:,?\s*so\s+that\s+([^.\n]+))?[.\n]/i);
      const persona = asAMatch ? asAMatch[1]?.trim() : undefined;
      const goal = asAMatch ? asAMatch[2]?.trim() : undefined;
      const benefit = asAMatch ? asAMatch[3]?.trim() : undefined;

      // Collect bullet points as description
      const bullets = contentBlock.match(/[-*]\s+[^\n]+/g) || [];
      const bulletText = bullets.map(b => b.trim()).join('\n');

      const rawText = asAMatch
        ? `As a ${persona}, I want ${goal}${benefit ? `, so that ${benefit}` : ''}.`
        : bulletText || storyTitle;

      const description = asAMatch
        ? `**User Story**\n\n${rawText}\n\n**Acceptance Criteria:**\n${bulletText}`
        : `**${storyTitle}**\n\n${bulletText || contentBlock}`;

      stories.push({
        id: storyId || `US-${String(stories.length + 1).padStart(3, '0')}`,
        rawText,
        title: storyTitle.length > 100 ? storyTitle.slice(0, 97) + '...' : storyTitle,
        description,
        persona,
        goal,
        benefit,
        hasExistingIssue: false
      });
    }

    if (stories.length > 0) {
      console.log(`[parseUserStories] Found ${stories.length} stories (title + bullets format)`);
      return stories;
    }
  }
```

**What changed:** When Stage 5B generates 0 AI stories (stochastic), the User Stories section has a simpler format: `**US-XX: Title**` followed by bullet points. This pattern groups bullets under their parent title instead of treating each bullet as a separate story. Also looks for optional "As a... I want..." inside each block.

---

### Change 5: `src/App.tsx` — Error message (line 2344)

**FIND (OLD):**
```typescript
      showToast('warning', 'No User Stories Found', 'Could not find user stories in Section 11');
```

**REPLACE WITH (NEW):**
```typescript
      showToast('warning', 'No User Stories Found', 'Could not find user stories in the epic. Make sure the epic contains a User Stories section.');
```

---

### Change 6: `src/config.ts` — max_tokens (lines 199, 209)

**FIND (OLD):**
```typescript
    maxTokens: 4096,    // (line 199, OpenAI config)
    maxTokens: 4096,    // (line 209, Azure OpenAI config)
```

**REPLACE WITH (NEW):**
```typescript
    maxTokens: 10000,   // (line 199, OpenAI config)
    maxTokens: 10000,   // (line 209, Azure OpenAI config)
```

---

## Verification Results

### Unit Tests
```
npx vitest run src/test/pipeline.test.ts
# Result: 37/37 passed ✅
```

### E2E Test with Real AI (Broadridge fixture)
```
OPENAI_API_KEY=sk-... npx tsx src/test/e2e-issue-creation-test.ts
# Result: PASS ✅ — 13 stories parsed
```

| Metric | Before Fix | After Fix |
|--------|-----------|-----------|
| `userStoriesMatch` capture | 16 chars (empty header only) | 7369 chars (full section) |
| Pattern 1 matches | 0 | 12 |
| Total stories parsed | 0 | 13 |
| Goals clean? | N/A (no matches) | Yes (no `**` or `[Req #N]` artifacts) |
| US-004 (backtick `*`) | Skipped | Included |

### Quick Parse Test (offline, no API needed)
```
npx tsx src/test/quick-parse-test.ts
# Result: PASS ✅ — 11 stories parsed from saved assembled epic
```

---

## How to Apply on Remote Desktop

1. Open `src/skills.ts`, go to `parseUserStoriesFromEpic()` (around line 3452)
2. Apply Changes 1-4 to the function (section regex, title pattern, cleanArtifacts helper, Pattern 1.5)
3. Open `src/App.tsx` line 2344, apply Change 5 (error message)
4. Open `src/config.ts` lines 199 and 209, apply Change 6 (maxTokens)
5. Run `npx vitest run src/test/pipeline.test.ts` — should see 37/37 pass
6. Test in browser: Epic Editor → Refine → Create Issues → stories should appear
