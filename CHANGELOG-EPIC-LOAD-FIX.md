# Epic Load Flow Fix - Detailed Changelog

**Date:** 2026-02-12
**Issue:** When two epics with the same `iid` exist in different groups, the app loads and updates the wrong epic.

---

## Summary

Fixed a critical bug where `handleLoadEpicIntoEditor()` used `Array.find()` to locate an epic by `iid`, which returned the **first match** instead of the **clicked epic**. This caused updates to go to the wrong epic when duplicate `iid`s existed across different groups.

---

## Root Cause

### The Problem

GitLab epic `iid` is only unique **within a group**, not globally. When using `include_descendant_groups=true`, the search API can return multiple epics with the same `iid` from different groups.

**Example scenario:**
| Property | Group 478446 (Subgroup) | Group 557797 (Parent) |
|----------|-------------------------|----------------------|
| **Epic ID** | 841693 | 520625 |
| **iid** | 229 | 229 |
| **Description** | `null` (empty) | Full content |

### The Bug

```typescript
// BUGGY CODE in handleLoadEpicIntoEditor():
const handleLoadEpicIntoEditor = async (epicIid: number) => {
  const epicFromList = loadEpicResults.find(e => e.iid === epicIid) ||
                       gitlabEpics.find(e => e.iid === epicIid);
  const epicGroupId = epicFromList?.group_id ? String(epicFromList.group_id) : config.gitlab.rootGroupId;
  // ...
}
```

**What happened:**
1. User clicked on epic 841693 (group 478446) in search results
2. `find(e => e.iid === 229)` returned epic 520625 (group 557797) - the **first** match
3. App loaded and updated epic 520625 instead of 841693
4. User checked epic 841693 → "Nothing changed!"

---

## Files Modified

### 1. `src/App.tsx`

#### Change 1: Function Signature

**Location:** Line ~3378

**Before:**
```typescript
const handleLoadEpicIntoEditor = async (epicIid: number) => {
```

**After:**
```typescript
const handleLoadEpicIntoEditor = async (epic: import('./config').GitLabEpic) => {
```

#### Change 2: Group ID Extraction

**Location:** Lines ~3379-3392

**Before:**
```typescript
const handleLoadEpicIntoEditor = async (epicIid: number) => {
  // Find epic in loaded results
  const epicFromList = loadEpicResults.find(e => e.iid === epicIid) ||
                       gitlabEpics.find(e => e.iid === epicIid);

  // Extract group_id from found epic (BUGGY - may find wrong epic!)
  const epicGroupId = epicFromList?.group_id
    ? String(epicFromList.group_id)
    : config.gitlab.rootGroupId;
```

**After:**
```typescript
const handleLoadEpicIntoEditor = async (epic: import('./config').GitLabEpic) => {
  // Use the clicked epic's group_id directly - DO NOT use find() by iid
  // This fixes the bug where duplicate iids in different groups caused wrong epic to load
  const epicGroupId = epic.group_id ? String(epic.group_id) : config.gitlab.rootGroupId;
  const epicIid = epic.iid;

  console.log('[Load Epic] Using clicked epic directly:');
  console.log('  - epic.id:', epic.id);
  console.log('  - epic.iid:', epicIid);
  console.log('  - epic.group_id:', epic.group_id);
  console.log('  - epicGroupId (for API):', epicGroupId);
```

#### Change 3: Function Call Site

**Location:** Line ~7278 (in the Load Epic modal's epic list)

**Before:**
```typescript
onClick={() => handleLoadEpicIntoEditor(epic.iid)}
```

**After:**
```typescript
onClick={() => handleLoadEpicIntoEditor(epic)}  // Pass full epic object
```

---

### 2. `src/config.ts` (Previously Modified)

#### Change: Added `groupId` Parameter to `updateGitLabEpic()`

**Location:** Function signature and URL construction

**Before:**
```typescript
export async function updateGitLabEpic(
  config: GitLabConfig,
  epicIid: number,
  params: GitLabUpdateEpicParams
): Promise<GitLabEpicResult> {
  // ...
  const url = `${apiUrl}/groups/${config.rootGroupId}/epics/${epicIid}`;
```

**After:**
```typescript
export async function updateGitLabEpic(
  config: GitLabConfig,
  epicIid: number,
  params: GitLabUpdateEpicParams,
  groupId?: string  // Optional: Use epic's actual group_id instead of rootGroupId
): Promise<GitLabEpicResult> {
  // ...
  const targetGroupId = groupId || config.rootGroupId;
  const url = `${apiUrl}/groups/${targetGroupId}/epics/${epicIid}`;
```

---

### 3. `src/mockGitLabData.ts` (Previously Modified)

#### Change: Added `groupId` Parameter to `mockUpdateGitLabEpic()`

**Before:**
```typescript
export async function mockUpdateGitLabEpic(
  config: GitLabConfig,
  epicIid: number,
  params: GitLabUpdateEpicParams
): Promise<GitLabEpicResult> {
```

**After:**
```typescript
export async function mockUpdateGitLabEpic(
  config: GitLabConfig,
  epicIid: number,
  params: GitLabUpdateEpicParams,
  groupId?: string
): Promise<GitLabEpicResult> {
  console.log('[Mock GitLab] ============ UPDATE EPIC CALLED ============');
  console.log('[Mock GitLab] Input Parameters:');
  console.log('  - epicIid:', epicIid);
  console.log('  - groupId (passed):', groupId);
  console.log('  - config.rootGroupId:', config.rootGroupId);
```

---

## Test Files Created

| File | Purpose |
|------|---------|
| `src/test/epicGroupIdMismatch.test.ts` | Reproduces the duplicate iid bug |
| `src/test/epicLoadFlowAnalysis.test.ts` | Verifies the bug is at LOAD time, not UPDATE time |
| `src/test/epicUpdate.test.ts` | Unit tests for mock update function |

**Run tests:**
```bash
npm run test:run -- epicLoadFlowAnalysis
npm run test:run -- epicGroupIdMismatch
```

---

## Investigation Files Created

| File | Purpose |
|------|---------|
| `INVESTIGATION-GROUP-ID-MISMATCH.md` | Full root cause analysis |
| `INVESTIGATION-EPIC-UPDATE.md` | Initial investigation report |
| `CHANGELOG-EPIC-UPDATE-FIX.md` | Documents the groupId parameter fix |

---

## Verification

After the fix:

1. **Load an epic from search results:**
   - Console should show:
     ```
     [Load Epic] Using clicked epic directly:
       - epic.id: 841693
       - epic.iid: 229
       - epic.group_id: 478446
       - epicGroupId (for API): 478446
     ```

2. **Update the epic:**
   - API call should go to correct group:
     ```
     PUT /api/v4/groups/478446/epics/229 ✅
     ```

3. **Verify in GitLab:**
   - Check the epic you clicked on - it should now be updated

---

## Summary of All Changes

| File | Change | Lines |
|------|--------|-------|
| `src/App.tsx` | Changed function signature from `(epicIid: number)` to `(epic: GitLabEpic)` | ~3378 |
| `src/App.tsx` | Use `epic.group_id` directly instead of `find()` | ~3379-3392 |
| `src/App.tsx` | Updated caller to pass full epic object | ~7278 |
| `src/config.ts` | Added `groupId` parameter to `updateGitLabEpic()` | ~2045 |
| `src/mockGitLabData.ts` | Added `groupId` parameter to `mockUpdateGitLabEpic()` | ~450 |

---

## Why This Fix Works

**Before (buggy):**
```
User clicks epic 841693 (group 478446)
→ handleLoadEpicIntoEditor(229)  // Only passes iid
→ find(e => e.iid === 229) returns epic 520625 (group 557797)  // WRONG!
→ Updates group 557797 instead of 478446
```

**After (fixed):**
```
User clicks epic 841693 (group 478446)
→ handleLoadEpicIntoEditor(epic)  // Passes full epic object
→ Uses epic.group_id (478446) directly  // CORRECT!
→ Updates group 478446 as intended
```

---

## Related Documentation

- [GitLab Epics API](https://docs.gitlab.com/ee/api/epics.html)
- [GitLab Group IDs](https://docs.gitlab.com/ee/api/#namespaced-paths)
