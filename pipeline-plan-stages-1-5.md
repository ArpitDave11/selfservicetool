# Premium 7-Stage Pipeline — Stages 1–5 Implementation Plan

---

## Stage 1: DEEP COMPREHENSION

**Goal:** Build a complete mental model of the epic before touching anything.

**Steps:**
1. Parse the full epic content with complete context window — every section, every line.
2. Extract the semantic meaning of each section (what is it trying to say vs what it actually says).
3. Build an internal model: what is this project, who is it for, what problem does it solve, what are the moving parts.
4. Identify implicit knowledge the author assumed but didn't write down.
5. Surface hidden assumptions and unstated dependencies.
6. Produce a **Comprehension Summary** containing: project essence (2-3 sentences), key entities and their relationships, detected gaps (things referenced but never defined), implicit risks the author didn't call out.

**Output → passed to Stage 2:**
- `projectEssence`: string
- `detectedGaps`: string[]
- `implicitRisks`: string[]
- `entityMap`: Record<string, string>
- `rawSections`: ParsedSection[]

---

## Stage 2: CATEGORY CLASSIFICATION

**Goal:** Determine what kind of document this is so every downstream stage treats it correctly.

**Steps:**
1. Analyze the comprehension output against the category definitions:
   - Business Requirement
   - Technical Design
   - Feature Specification
   - API Specification
   - Infrastructure Design
   - Migration Plan
   - Integration Spec
2. Assign a **primary category** with confidence score (0–1).
3. Assign a **secondary category** if confidence < 0.85 (hybrid documents are common).
4. Run an **intent vs reality check**: does the author think they wrote a Technical Design but it's actually a Feature Spec? Flag the mismatch.
5. Based on the category, select the optimal section structure, tone, architecture focus, and user story style from the category matrix.

**Output → passed to Stage 3:**
- `primaryCategory`: CategoryType
- `primaryConfidence`: number
- `secondaryCategory`: CategoryType | null
- `intentMismatch`: { detected: boolean, explanation: string }
- `categoryConfig`: { requiredSections, tone, architectureFocus, storyStyle }

---

## Stage 3: STRUCTURAL ASSESSMENT

**Goal:** Score every existing section and decide exactly what to do with it.

**Steps:**
1. For each section in the epic, score three dimensions (1–10 each):
   - **Completeness** — does it cover what it should for this category?
   - **Relevance** — does it belong here or is it noise?
   - **Placement** — is it in the right position in the document flow?
2. Compare the epic's current sections against the `categoryConfig.requiredSections` list. Identify missing required sections.
3. For each section, make a **transformation decision**:
   - **Keep** — score ≥ 8 on all dimensions, no changes needed.
   - **Restructure** — content is good but poorly organized or placed.
   - **Merge** — two or more sections overlap significantly (>60% content overlap).
   - **Split** — one section covers multiple distinct concerns.
   - **Add** — required section is completely missing.
4. Generate a **Transformation Plan**: ordered list of operations with rationale for each.

**Output → passed to Stage 4:**
- `sectionScores`: Array<{ section, completeness, relevance, placement }>
- `transformationPlan`: Array<{ action: keep|restructure|merge|split|add, targets, rationale }>
- `missingSections`: string[]
- `proposedOutline`: string[] (the new section order)

---

## Stage 4: CONTENT REFINEMENT (Parallel Processing)

**Goal:** Rewrite every section to publication-ready quality using full project context.

**Steps:**
1. Execute the transformation plan from Stage 3 — merge, split, reorder sections first.
2. For each section (processable in parallel):
   a. Feed the AI the **full comprehension summary** (Stage 1) + **category config** (Stage 2) + **the specific section** + **its transformation instructions** (Stage 3).
   b. Apply **category-specific quality standards**:
      - Business Requirement → executive-friendly language, ROI framing, success metrics with numbers.
      - Technical Design → precise terminology, no ambiguity, data model accuracy.
      - Feature Spec → user flow clarity, acceptance criteria that are testable.
      - API Spec → exact endpoint definitions, request/response examples, error codes.
      - Infrastructure → scaling considerations, monitoring hooks, failure modes.
      - Migration → rollback steps, risk mitigations, timeline with milestones.
      - Integration → sequence of calls, error handling at each boundary, retry logic.
   c. Apply **smart features** during refinement:
      - **Terminology consistency**: if "user" and "customer" refer to the same thing, pick one.
      - **Gap filling**: where Stage 1 found gaps, add the missing information or flag it with a `[TODO]`.
      - **Cross-reference validation**: any reference to another section must point to something that exists.
3. For newly **added** sections (missing ones from Stage 3), generate them from scratch using the comprehension model.

**Output → passed to Stage 5:**
- `refinedSections`: Array<{ title, content, changesSummary }>
- `terminologyMap`: Record<string, string> (canonical term → definition)
- `unresolvedGaps`: string[] (gaps that couldn't be filled without author input)

---

## Stage 5: MANDATORY SECTIONS

**Goal:** Generate the two sections every epic must have — architecture diagram and user stories — using the full refined content.

### 5A: Architecture Diagram

1. Analyze ALL refined sections together (not just one).
2. Based on `categoryConfig.architectureFocus`:
   - Business Requirement → high-level component diagram showing major systems and data flow.
   - Technical Design → detailed technical diagram with services, databases, queues, caches.
   - Feature Spec → feature interaction flow showing user actions and system responses.
   - API Spec → API flow diagram showing request paths, middleware, and response chains.
   - Infrastructure → infrastructure diagram with servers, load balancers, monitoring.
   - Migration → before/after comparison showing current state and target state.
   - Integration → sequence diagram showing system-to-system communication.
3. Generate a comprehensive **Mermaid diagram** that covers every component mentioned across all sections.
4. Validate: every entity in the diagram must appear in at least one section. Every major entity in the sections must appear in the diagram.

### 5B: User Stories

1. Extract ALL user needs from the refined content — scan every section, not just "requirements."
2. Based on `categoryConfig.storyStyle`:
   - Business → "As a [business role], I want [business outcome] so that [business value]"
   - Technical → "As a [developer/system], I need [technical capability] so that [implementation goal]"
   - Feature → "As a [end user], I want [feature action] so that [user benefit]"
   - API → "As a [consuming system/developer], I need [API capability] so that [integration goal]"
   - Infrastructure → "As a [ops engineer/SRE], I need [operational capability] so that [reliability goal]"
   - Migration → "As a [migration lead], I need [migration step] so that [safe transition]"
   - Integration → "As a [integrating system], I need [integration capability] so that [data flow goal]"
3. Each story must include: acceptance criteria (testable), priority (must/should/could), and the section it was derived from.
4. Validate: every functional requirement in the epic must map to at least one user story. Flag any orphan requirements.

**Output → passed to Stage 6:**
- `architectureDiagram`: string (Mermaid syntax)
- `userStories`: Array<{ role, want, soThat, acceptanceCriteria, priority, sourceSection }>
- `coverageReport`: { totalRequirements, coveredByStories, orphanRequirements }
- `fullRefinedEpic`: complete document ready for coherence review

---

## Data Flow Summary

```
Epic Input
    │
    ▼
┌─────────────────────┐
│ Stage 1: Comprehend  │──→ projectEssence, gaps, risks, entities
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ Stage 2: Classify    │──→ category, config, intent mismatch
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ Stage 3: Assess      │──→ section scores, transformation plan
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ Stage 4: Refine      │──→ refined sections, terminology, remaining gaps
│   (parallel)         │
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ Stage 5: Mandatory   │──→ architecture diagram, user stories, coverage
└─────────┬───────────┘
          ▼
    Ready for Stage 6 (Coherence Review)
```

---

## Key Principles Maintained

- **Fast**: Stage 4 runs sections in parallel. No redundant AI calls — each stage produces a focused output the next stage consumes.
- **Robust**: Every stage has typed outputs. Stage 3's scoring prevents garbage flowing downstream. Stage 5 validates coverage so nothing is missed.
- **Effective**: Category-awareness means an API spec and a business requirement get fundamentally different treatment, not the same generic pass. Full context is preserved at every step — no stage works in isolation.
