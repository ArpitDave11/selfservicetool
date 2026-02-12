# Issue ID Mismatch Fix - Changelog

**Date:** 2026-02-11
**Issue:** Issues being created under wrong IDs; duplicate checking against wrong IDs

---

## Root Cause

When loading an epic from a **subgroup**, the system correctly stores `selectedGitLabEpic.group_id` (e.g., `557797`). However, when creating issues, linking them to epics, or checking for duplicates, the code was **ignoring** this stored `group_id` and always using `config.rootGroupId` instead.

This caused:
1. Issues created in wrong group's project
2. Issues linked to wrong epic (IID exists in different group)
3. Duplicate checking returned 0 results (querying wrong group)

---

## Solution Pattern

Applied the same pattern already used in `fetchEpicDetails()`:
```typescript
function someFunction(config, epicIid, groupId?: string) {
  const groupToUse = groupId || config.rootGroupId;  // Fallback to root if not provided
  const url = `.../${groupToUse}/...`;
}
```

---

## Files Changed

### 1. src/config.ts

#### fetchGroupProjects() - Line 2160

**BEFORE:**
```typescript
export async function fetchGroupProjects(
  config: GitLabConfig
): Promise<{ success: boolean; data?: Array<{ id: number; name: string; path: string }>; error?: string }> {
  // ...
  const url = `${apiUrl}/groups/${config.rootGroupId}/projects?per_page=10&include_subgroups=true`;
  console.log('[GitLab API] Fetching projects for group:', config.rootGroupId);
```

**AFTER:**
```typescript
export async function fetchGroupProjects(
  config: GitLabConfig,
  groupId?: string  // Optional: Use specific group instead of rootGroupId
): Promise<{ success: boolean; data?: Array<{ id: number; name: string; path: string }>; error?: string }> {
  // ...
  const groupToUse = groupId || config.rootGroupId;
  const url = `${apiUrl}/groups/${groupToUse}/projects?per_page=10&include_subgroups=true`;
  console.log('[GitLab API] Fetching projects for group:', groupToUse);
```

---

#### createGitLabIssue() - Line 2202

**BEFORE:**
```typescript
export async function createGitLabIssue(
  config: GitLabConfig,
  params: CreateIssueParams
): Promise<GitLabIssueResult> {
  // ...
  const projectsResult = await fetchGroupProjects(config);
```

**AFTER:**
```typescript
export async function createGitLabIssue(
  config: GitLabConfig,
  params: CreateIssueParams,
  groupId?: string  // Optional: Use specific group instead of rootGroupId
): Promise<GitLabIssueResult> {
  // ...
  const groupToUse = groupId || config.rootGroupId;
  console.log('[GitLab Issue API] Using group:', groupToUse, groupId ? '(from epic)' : '(default rootGroupId)');
  const projectsResult = await fetchGroupProjects(config, groupToUse);
```

---

#### linkIssueToEpic() - Line 2277

**BEFORE:**
```typescript
export async function linkIssueToEpic(
  config: GitLabConfig,
  epicIid: number,
  issueId: number
): Promise<{ success: boolean; error?: string }> {
  // ...
  const url = `${apiUrl}/groups/${config.rootGroupId}/epics/${epicIid}/issues/${issueId}`;
  console.log('[GitLab Issue API] Linking issue', issueId, 'to epic', epicIid);
```

**AFTER:**
```typescript
export async function linkIssueToEpic(
  config: GitLabConfig,
  epicIid: number,
  issueId: number,
  groupId?: string  // Optional: Use specific group instead of rootGroupId
): Promise<{ success: boolean; error?: string }> {
  // ...
  const groupToUse = groupId || config.rootGroupId;
  const url = `${apiUrl}/groups/${groupToUse}/epics/${epicIid}/issues/${issueId}`;
  console.log('[GitLab Issue API] Linking issue', issueId, 'to epic', epicIid, 'in group', groupToUse);
```

---

#### fetchEpicIssues() - Line 2312

**BEFORE:**
```typescript
export async function fetchEpicIssues(
  config: GitLabConfig,
  epicIid: number
): Promise<{ success: boolean; data?: GitLabIssueData[]; error?: string }> {
  // ...
  const url = `${apiUrl}/groups/${config.rootGroupId}/epics/${epicIid}/issues?per_page=100`;
  console.log('[GitLab Issue API] Fetching issues for epic:', epicIid);
```

**AFTER:**
```typescript
export async function fetchEpicIssues(
  config: GitLabConfig,
  epicIid: number,
  groupId?: string  // Optional: Use specific group instead of rootGroupId
): Promise<{ success: boolean; data?: GitLabIssueData[]; error?: string }> {
  // ...
  const groupToUse = groupId || config.rootGroupId;
  const url = `${apiUrl}/groups/${groupToUse}/epics/${epicIid}/issues?per_page=100`;
  console.log('[GitLab Issue API] Fetching issues for epic:', epicIid, 'in group:', groupToUse);
```

---

### 2. src/App.tsx

#### fetchEpicIssues() call - Line 2320

**BEFORE:**
```typescript
// Fetch existing issues linked to this epic
const issuesResult = await fetchEpicIssues(config.gitlab, selectedGitLabEpic.iid);
```

**AFTER:**
```typescript
// Fetch existing issues linked to this epic (use epic's group_id for correct subgroup)
const epicGroupId = selectedGitLabEpic.group_id ? String(selectedGitLabEpic.group_id) : undefined;
const issuesResult = await fetchEpicIssues(config.gitlab, selectedGitLabEpic.iid, epicGroupId);
```

---

#### createGitLabIssue() call - Line 2398

**BEFORE:**
```typescript
// Create the issue (automatically finds project from rootGroupId)
const issueResult = await createGitLabIssue(config.gitlab, {
  title: story.title,
  description,
  labels: ['user-story', 'epic-generator']
});
```

**AFTER:**
```typescript
// Create the issue in the epic's group (uses group_id for correct subgroup)
const epicGroupId = selectedGitLabEpic?.group_id ? String(selectedGitLabEpic.group_id) : undefined;
const issueResult = await createGitLabIssue(config.gitlab, {
  title: story.title,
  description,
  labels: ['user-story', 'epic-generator']
}, epicGroupId);
```

---

#### linkIssueToEpic() call - Line 2409

**BEFORE:**
```typescript
// Link issue to epic if we have one
if (selectedGitLabEpic) {
  await linkIssueToEpic(config.gitlab, selectedGitLabEpic.iid, issueResult.data.id);
}
```

**AFTER:**
```typescript
// Link issue to epic if we have one (use epic's group_id for correct subgroup)
if (selectedGitLabEpic) {
  const linkGroupId = selectedGitLabEpic.group_id ? String(selectedGitLabEpic.group_id) : undefined;
  await linkIssueToEpic(config.gitlab, selectedGitLabEpic.iid, issueResult.data.id, linkGroupId);
}
```

---

## Summary of Changes

| Function | Change |
|----------|--------|
| `fetchGroupProjects()` | Added `groupId?: string` parameter |
| `createGitLabIssue()` | Added `groupId?: string` parameter, passes to `fetchGroupProjects()` |
| `linkIssueToEpic()` | Added `groupId?: string` parameter |
| `fetchEpicIssues()` | Added `groupId?: string` parameter |
| App.tsx calls | All 3 calls now pass `selectedGitLabEpic.group_id` |

---

## Behavior After Fix

| Operation | ID Used | Result |
|-----------|---------|--------|
| Load Epic | `selectedGitLabEpic.group_id` | Correct |
| Create Issue | `selectedGitLabEpic.group_id` | **Now Correct** |
| Link Issue to Epic | `selectedGitLabEpic.group_id` | **Now Correct** |
| Duplicate Check | `selectedGitLabEpic.group_id` | **Now Correct** |

---

## Backward Compatibility

All changes are **backward compatible**:
- The `groupId` parameter is optional with `?`
- If not provided, falls back to `config.rootGroupId`
- Existing code that doesn't pass `groupId` continues to work
