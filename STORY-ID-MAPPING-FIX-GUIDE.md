# User Story ID → GitLab Issue Mapping — Replacement Guide

Apply these changes to **2 files** (`src/App.tsx` and `src/skills.ts`) on your remote desktop.

**Total: 5 replacements across 2 files + 1 production bug fix**

---

## What These Fixes Do

### Fix A: Story IDs included in GitLab issue titles
**Before:** Issue created as `"Implement MFA Authentication"` — no traceability to original user story.
**After:** Issue created as `"[US-001] Implement MFA Authentication"` — clear mapping from story ID to issue.

### Fix B: Story IDs displayed in issue creation modal
**Before:** Modal shows only the title text, no story IDs visible.
**After:** Each story row shows a styled `US-001` badge before the title.

### Fix C: Post-creation matching uses story ID (not fragile title match)
**Before:** `createdIssues.some(i => i.title === s.title)` — title-based matching that breaks if AI rewrites titles.
**After:** Stores `storyId` on each created issue and matches by ID. Also shows mapping summary in toast.

### Fix D: Silent `linkIssueToEpic` failure now logged
**Before:** `linkIssueToEpic` errors silently swallowed — issues created but never linked.
**After:** Failed link attempts logged with `console.warn`.

### Fix E: `generateIssueDescription` crash fix + structured fields
**Before:** `response.trim()` crashes when AI returns undefined. Only sends `rawText` to AI.
**After:** `(response || story.description).trim()` — graceful fallback. Now passes story ID, persona, goal, benefit, and acceptance criteria to the AI prompt.

### Fix F: User story goal regex bug (production parser bug)
**Before:** `([^,]+?)` non-greedy regex captures only 1 character for goal field (e.g., `"t"` instead of `"to enable MFA for all users"`).
**After:** `([^,]+)` greedy regex correctly captures full goal up to the comma before "so that".

---

## FILE: `src/App.tsx` (3 changes)

---

### Change 1 of 3 — Include story ID in issue title + log link failures (~line 2428)

**FIND THIS (OLD):**
```typescript
        // Generate enhanced description using LLM
        const description = await generateIssueDescription(story, epicTitle, editableEpic);

        // Create the issue in the epic's group (uses group_id for correct subgroup)
        const epicGroupId = selectedGitLabEpic?.group_id ? String(selectedGitLabEpic.group_id) : undefined;
        const issueResult = await createGitLabIssue(config.gitlab, {
          title: story.title,
          description,
          labels: ['user-story', 'epic-generator']
        }, epicGroupId);

        if (issueResult.success && issueResult.data) {
          createdIssues.push(issueResult.data);

          // Link issue to epic if we have one (use epic's group_id for correct subgroup)
          if (selectedGitLabEpic) {
            const linkGroupId = selectedGitLabEpic.group_id ? String(selectedGitLabEpic.group_id) : undefined;
            await linkIssueToEpic(config.gitlab, selectedGitLabEpic.iid, issueResult.data.id, linkGroupId);
          }
        } else {
          errors.push(`Failed to create "${story.title}": ${issueResult.error}`);
        }
      } catch (e) {
        errors.push(`Error creating "${story.title}": ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
```

**REPLACE WITH (NEW):**
```typescript
        // Generate enhanced description using LLM
        const description = await generateIssueDescription(story, epicTitle, editableEpic);

        // Create the issue with story ID prefix in title for traceability
        // e.g., "[US-001] Implement MFA Authentication"
        const issueTitle = `[${story.id}] ${story.title}`;

        // Create the issue in the epic's group (uses group_id for correct subgroup)
        const epicGroupId = selectedGitLabEpic?.group_id ? String(selectedGitLabEpic.group_id) : undefined;
        const issueResult = await createGitLabIssue(config.gitlab, {
          title: issueTitle,
          description,
          labels: ['user-story', 'epic-generator']
        }, epicGroupId);

        if (issueResult.success && issueResult.data) {
          createdIssues.push({ ...issueResult.data, storyId: story.id });

          // Link issue to epic if we have one (use epic's group_id for correct subgroup)
          if (selectedGitLabEpic) {
            const linkGroupId = selectedGitLabEpic.group_id ? String(selectedGitLabEpic.group_id) : undefined;
            const linkResult = await linkIssueToEpic(config.gitlab, selectedGitLabEpic.iid, issueResult.data.id, linkGroupId);
            if (!linkResult.success) {
              console.warn(`[Issue Creation] Failed to link issue #${issueResult.data.iid} to epic: ${linkResult.error}`);
            }
          }
        } else {
          errors.push(`Failed to create [${story.id}] "${story.title}": ${issueResult.error}`);
        }
      } catch (e) {
        errors.push(`Error creating [${story.id}] "${story.title}": ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
```

---

### Change 2 of 3 — Story ID mapping in post-creation results (~line 2462)

**FIND THIS (OLD):**
```typescript
    // Show results
    if (createdIssues.length > 0) {
      showToast('success', `${createdIssues.length} Issues Created`, `Successfully created ${createdIssues.length} issues`);

      // Update existing issues list
      setExistingEpicIssues(prev => [...prev, ...createdIssues]);

      // Mark created stories as having issues
      setParsedUserStories(prev => prev.map(s =>
        createdIssues.some(i => i.title === s.title)
          ? { ...s, hasExistingIssue: true }
          : s
      ));
```

**REPLACE WITH (NEW):**
```typescript
    // Show results with story ID → issue ID mapping
    if (createdIssues.length > 0) {
      const mappingSummary = createdIssues.map(i => `${i.storyId} → #${i.iid}`).join(', ');
      console.log('[Issue Creation] Story → Issue mapping:', mappingSummary);
      showToast('success', `${createdIssues.length} Issues Created`, mappingSummary);

      // Update existing issues list
      setExistingEpicIssues(prev => [...prev, ...createdIssues.map(i => ({ id: i.id, iid: i.iid, title: i.title, state: 'opened', web_url: i.web_url }))]);

      // Mark created stories as having issues using story ID mapping (not fragile title matching)
      const createdStoryIds = new Set(createdIssues.map(i => i.storyId));
      setParsedUserStories(prev => prev.map(s =>
        createdStoryIds.has(s.id)
          ? { ...s, hasExistingIssue: true, matchedIssueIid: createdIssues.find(i => i.storyId === s.id)?.iid }
          : s
      ));
```

---

### Change 3 of 3 — Show story ID badge in modal (~line 8188)

**FIND THIS (OLD):**
```tsx
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '14px', fontWeight: 500, color: '#000000', marginBottom: '4px' }}>
                          {story.title}
                        </div>
```

**REPLACE WITH (NEW):**
```tsx
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '14px', fontWeight: 500, color: '#000000', marginBottom: '4px' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '1px 6px',
                            marginRight: '8px',
                            backgroundColor: '#F5F0E1',
                            border: '1px solid #CCCABC',
                            borderRadius: '3px',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: '#5A5D5C',
                            fontFamily: 'monospace'
                          }}>{story.id}</span>
                          {story.title}
                        </div>
```

---

## FILE: `src/skills.ts` (2 changes)

---

### Change 4 of 5 — Fix goal regex bug in `parseUserStoriesFromEpic()` (~line 3531)

**FIND THIS (OLD):**
```typescript
  const newFormatPattern = /\*\*([A-Z]{2,3}-\d+):\s*([^*]+)\*\*[^\n]*\n>\s*As an?\s+([^,]+),?\s*I\s+want\s+([^,]+?)(?:,?\s*so\s+that\s+([^.\n]+))?/gi;
```

**REPLACE WITH (NEW):**
```typescript
  const newFormatPattern = /\*\*([A-Z]{2,3}-\d+):\s*([^*]+)\*\*[^\n]*\n>\s*As an?\s+([^,]+),?\s*I\s+want\s+([^,]+)(?:,?\s*so\s+that\s+([^.\n]+))?/gi;
```

> **What changed:** `([^,]+?)` (non-greedy) → `([^,]+)` (greedy). The non-greedy quantifier combined with the optional `so that` clause caused the regex engine to capture only 1 character for the goal field. This is a **production bug** — every parsed user story had a broken goal field (e.g., `"t"` instead of `"to enable MFA for all users"`).

---

### Change 5 of 5 — Fix generateIssueDescription crash + pass structured fields (~line 3748)

**FIND THIS (OLD):**
```typescript
  const userPrompt = `EPIC: ${epicTitle}

USER STORY: ${story.rawText}

EPIC CONTEXT (for reference):
${epicContext.slice(0, 1500)}

Generate a well-formatted issue description:`;

  try {
    const response = await callAI(currentConfig, systemPrompt, userPrompt);
    return response.trim();
```

**REPLACE WITH (NEW):**
```typescript
  const structuredFields = [
    `STORY ID: ${story.id}`,
    `USER STORY: ${story.rawText}`,
    story.persona ? `PERSONA: ${story.persona}` : '',
    story.goal ? `GOAL: ${story.goal}` : '',
    story.benefit ? `BENEFIT: ${story.benefit}` : '',
    story.acceptanceCriteria?.length ? `ACCEPTANCE CRITERIA:\n${story.acceptanceCriteria.map(ac => `- ${ac}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');

  const userPrompt = `EPIC: ${epicTitle}

${structuredFields}

EPIC CONTEXT (for reference):
${epicContext.slice(0, 1500)}

Generate a well-formatted issue description:`;

  try {
    const response = await callAI(currentConfig, systemPrompt, userPrompt);
    return (response || story.description).trim();
```

> **What changed:** (1) `response.trim()` crashed with `TypeError: Cannot read properties of undefined (reading 'trim')` when AI returned undefined — now uses `(response || story.description).trim()` as graceful fallback. (2) Now passes story ID, persona, goal, benefit, and acceptance criteria to the AI prompt for richer issue descriptions.

---

## Summary

| # | File | What Changed |
|---|------|-------------|
| 1 | `App.tsx` ~line 2428 | Issue title now includes story ID: `[US-001] Title`. Link failures logged. |
| 2 | `App.tsx` ~line 2462 | Post-creation uses story ID mapping (not fragile title match). Toast shows `US-001 → #42`. |
| 3 | `App.tsx` ~line 8188 | Modal shows `US-001` monospace badge next to each story title. |
| 4 | `skills.ts` ~line 3531 | Goal regex fix: `([^,]+?)` → `([^,]+)`. Was capturing 1 char instead of full goal. |
| 5 | `skills.ts` ~line 3748 | `generateIssueDescription` crash fix + structured fields (persona/goal/benefit/AC). |

---

## Before/After

### Issue Title
```
Before: "Implement MFA Authentication"
After:  "[US-001] Implement MFA Authentication"
```

### Toast After Creation
```
Before: "Successfully created 3 issues"
After:  "US-001 → #42, US-002 → #43, US-003 → #44"
```

### Modal Display
```
Before: Implement MFA Authentication
After:  [US-001] Implement MFA Authentication
        ^^^^^^^^ styled monospace badge
```

### Goal Parsing (Production Bug Fix)
```
Before: story.goal = "t"          ← broken (only 1 char captured)
After:  story.goal = "to enable MFA for all users"  ← correct
```

### Issue Description AI Prompt
```
Before: Only sends rawText
After:  Sends STORY ID, USER STORY, PERSONA, GOAL, BENEFIT, ACCEPTANCE CRITERIA
```
