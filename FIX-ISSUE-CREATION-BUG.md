# Fix: "No User Stories Found" Issue Creation Bug

## Problem

Clicking "Create Issues" shows error:
> "No User Stories Found — Could not find user stories in Section 11"

Even though user stories are visible in the generated epic.

## Root Cause

`parseUserStoriesFromEpic()` in `src/skills.ts` was hardcoded to only find stories under **"Section 11"**. The Refinement Process pipeline generates epics where user stories appear under different section numbers or with no number at all:

- `## 8. User Stories` (pipeline auto-numbered)
- `## 12. User Stories` (different position)
- `## User Stories` (fallback, no number)

The old regex **only matched `## 11.`** — any other number or no number was missed.

## File to Change

**`src/skills.ts`** — function `parseUserStoriesFromEpic()` (around line 3455)

## What to Change

### Find this code (OLD):

```typescript
  // Find the User Stories section (Section 11 or ### User Stories subsection)
  const section11Match = epicContent.match(/##\s*11\.\s*Key Features\s*&?\s*User Stories[\s\S]*?(?=##\s*\d+\.|$)/i);
  const userStoriesMatch = epicContent.match(/###?\s*User Stories[\s\S]*?(?=###?\s*[A-Z]|##\s*\d+\.|$)/i);

  if (!section11Match && !userStoriesMatch) {
    console.log('[parseUserStories] No user stories section found');
    return stories;
  }

  const sectionContent = userStoriesMatch ? userStoriesMatch[0] : (section11Match ? section11Match[0] : epicContent);
```

### Replace with (NEW):

```typescript
  // Find the User Stories section — supports multiple formats:
  //   1. "## 11. Key Features & User Stories" (wizard format)
  //   2. "## User Stories" or "### User Stories" (pipeline format, no number)
  //   3. "## N. User Stories" (pipeline format with auto-number)
  //   4. "## N. Key Features & User Stories" (any number, not just 11)
  const section11Match = epicContent.match(/##\s*\d+\.\s*(?:Key Features\s*&?\s*)?User Stories[\s\S]*?(?=\n##\s|$)/i);
  const userStoriesMatch = epicContent.match(/###?\s*(?:\d+\.\s*)?User Stories[\s\S]*?(?=\n###?\s*[A-Z]|\n##\s*\d+\.|\n##\s[A-Z]|$)/i);

  if (!section11Match && !userStoriesMatch) {
    // Fallback: search the entire document for story patterns (no section header needed)
    const hasStoryPatterns = /\*\*[A-Z]{2,3}-\d+:/.test(epicContent) || /As an?\s+[^,]+,?\s*I\s+want\s+/i.test(epicContent);
    if (!hasStoryPatterns) {
      console.log('[parseUserStories] No user stories section found');
      return stories;
    }
    console.log('[parseUserStories] No section header found, searching entire document');
  }

  const sectionContent = userStoriesMatch ? userStoriesMatch[0] : (section11Match ? section11Match[0] : epicContent);
```

## What Changed (3 things)

### 1. `section11Match` regex — any number, not just 11

```
OLD: /##\s*11\.\s*Key Features\s*&?\s*User Stories/
NEW: /##\s*\d+\.\s*(?:Key Features\s*&?\s*)?User Stories/
         ^^^                                  ^
    any number              "Key Features &" is now optional
```

Also fixed termination: `(?=\n##\s|$)` — stops at any next `##` heading.

### 2. `userStoriesMatch` regex — allow numbered headings

```
OLD: /###?\s*User Stories/
NEW: /###?\s*(?:\d+\.\s*)?User Stories/
              ^^^^^^^^^^^
         optional "N. " prefix
```

Also fixed termination to handle unnumbered next-sections: `(?=\n###?\s*[A-Z]|\n##\s*\d+\.|\n##\s[A-Z]|$)`

### 3. Fallback — search entire document if no header found

If neither regex matches a section header, but the document contains story patterns (`**US-001:` or `As a ... I want ...`), fall back to searching the **entire epic** instead of returning empty.

## Verification

Run these tests after applying the fix:

```bash
# Pipeline tests (37 should pass)
npx vitest run src/test/pipeline.test.ts

# Issue creation tests (44 should pass)
npx vitest run src/test/issueCreation.test.tsx
```

## Quick Test in Browser

1. Open the app, go to Epic Editor
2. Load or generate an epic with user stories
3. Click "Create Issues" button
4. Stories should now appear in the modal (no error toast)
