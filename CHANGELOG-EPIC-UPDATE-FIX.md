# Epic Update Fix - Changelog

**Date:** 2026-02-11
**Issue:** Clicking "Update Epic" button did nothing - epic updates were not being saved to GitLab

---

## Root Cause

The `updateGitLabEpic()` function was using `config.rootGroupId` instead of the epic's actual `group_id` when making the API call.

**Example of the Bug:**
```
User loads epic from subgroup:
  - Epic IID: 42
  - Epic's group_id: 12345 (a subgroup)
  - config.rootGroupId: 99999 (parent group)

Update API call was made to:
  PUT /groups/99999/epics/42  ❌ WRONG GROUP!

Should have been:
  PUT /groups/12345/epics/42  ✅ CORRECT GROUP!
```

GitLab API requires the correct group ID in the URL path. Epic #42 exists in group 12345, not in group 99999, so the API returned 404 or failed silently.

---

## Changes Made

### 1. Updated `updateGitLabEpic()` Function

**File:** `src/config.ts`, Lines 2031-2045

**BEFORE:**
```typescript
export async function updateGitLabEpic(
  config: GitLabConfig,
  epicIid: number,
  params: GitLabUpdateEpicParams
): Promise<GitLabEpicResult> {
  if (!config.accessToken || !config.rootGroupId) {
    return { success: false, error: 'Access token and group ID are required' };
  }

  const apiUrl = getGitLabApiUrl(config);
  const url = `${apiUrl}/groups/${config.rootGroupId}/epics/${epicIid}`;
```

**AFTER:**
```typescript
export async function updateGitLabEpic(
  config: GitLabConfig,
  epicIid: number,
  params: GitLabUpdateEpicParams,
  groupId?: string  // Optional: Use epic's actual group_id instead of rootGroupId
): Promise<GitLabEpicResult> {
  if (!config.accessToken || !config.rootGroupId) {
    return { success: false, error: 'Access token and group ID are required' };
  }

  // Use the provided groupId (epic's actual group) or fall back to rootGroupId
  const targetGroupId = groupId || config.rootGroupId;
  const apiUrl = getGitLabApiUrl(config);
  const url = `${apiUrl}/groups/${targetGroupId}/epics/${epicIid}`;

  console.log('[GitLab Epic API] Update target group:', targetGroupId, '(provided:', groupId, ', root:', config.rootGroupId, ')');
```

---

### 2. Updated `handleUpdateGitLabEpic()` Handler

**File:** `src/App.tsx`, Lines 2263-2270

**BEFORE:**
```typescript
setIsPublishing(true);
// Use mock or real API based on toggle
const result = shouldUseMockGitLab()
  ? await mockUpdateGitLabEpic(config.gitlab, selectedGitLabEpic.iid, params)
  : await updateGitLabEpic(config.gitlab, selectedGitLabEpic.iid, params);
setIsPublishing(false);
```

**AFTER:**
```typescript
setIsPublishing(true);
// Use mock or real API based on toggle
// IMPORTANT: Pass the epic's actual group_id to update in the correct group
const epicGroupId = selectedGitLabEpic.group_id ? String(selectedGitLabEpic.group_id) : undefined;
const result = shouldUseMockGitLab()
  ? await mockUpdateGitLabEpic(config.gitlab, selectedGitLabEpic.iid, params, epicGroupId)
  : await updateGitLabEpic(config.gitlab, selectedGitLabEpic.iid, params, epicGroupId);
setIsPublishing(false);
```

---

### 3. Updated `mockUpdateGitLabEpic()` Function

**File:** `src/mockGitLabData.ts`, Lines 1976-1987

**BEFORE:**
```typescript
export async function mockUpdateGitLabEpic(
  config: GitLabConfig,
  epicIid: number,
  params: GitLabUpdateEpicParams
): Promise<GitLabEpicResult> {
  await simulateDelay(300);

  const epicIndex = mockEpics.findIndex(e => e.iid === epicIid);
```

**AFTER:**
```typescript
export async function mockUpdateGitLabEpic(
  config: GitLabConfig,
  epicIid: number,
  params: GitLabUpdateEpicParams,
  groupId?: string  // Optional: For API consistency (mock ignores this, finds by iid)
): Promise<GitLabEpicResult> {
  await simulateDelay(300);

  // Log the group ID for debugging (mock doesn't use it, but real API does)
  console.log('[Mock GitLab] Update epic - iid:', epicIid, 'groupId:', groupId || 'not provided');

  const epicIndex = mockEpics.findIndex(e => e.iid === epicIid);
```

---

## Data Flow After Fix

```
User loads epic from GitLab
    ↓
selectedGitLabEpic = { iid: 42, group_id: 12345, title: "My Epic", ... }
    ↓
User refines epic in editor
    ↓
User clicks "Update Epic" button
    ↓
handleUpdateGitLabEpic()
    ├── epicGroupId = String(selectedGitLabEpic.group_id) = "12345"
    └── updateGitLabEpic(config, 42, params, "12345")
            ↓
        targetGroupId = "12345" (uses provided groupId)
            ↓
        PUT /groups/12345/epics/42  ✅ CORRECT!
            ↓
        Epic updated successfully
```

---

## Summary

| File | Change |
|------|--------|
| `src/config.ts` | Added `groupId` parameter to `updateGitLabEpic()` |
| `src/App.tsx` | Pass `selectedGitLabEpic.group_id` when calling update |
| `src/mockGitLabData.ts` | Added `groupId` parameter for API consistency |

---

## Why Mock Mode Worked But Real API Didn't

The mock function finds epics by `iid` in a local array:
```typescript
const epicIndex = mockEpics.findIndex(e => e.iid === epicIid);  // Ignores group
```

The real GitLab API requires the correct group in the URL path:
```
PUT /api/v4/groups/{group_id}/epics/{epic_iid}
```

If the wrong group is used, the API returns 404 because the epic doesn't exist in that group.

---

## Verification

1. Run `npm run dev`
2. Load an epic from GitLab (especially one from a subgroup)
3. Make changes in the editor
4. Click "Update Epic"
5. Verify the toast shows "Epic Updated!"
6. Check browser console for: `[GitLab Epic API] Update target group: {correct_group_id}`
7. Reload the epic from GitLab to confirm changes persisted
