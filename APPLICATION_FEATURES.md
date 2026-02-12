# Epic Generator v4 - Application Features & Capabilities

**FRAME - Feature Requirements & Architecture Management Engine**

An AI-powered technical documentation platform that generates comprehensive 17-section technical design documents through a guided wizard interface with GitLab integration.

---

## Table of Contents

1. [Core Application](#1-core-application)
2. [Wizard System (6 Stages)](#2-wizard-system-6-stages)
3. [AI Capabilities](#3-ai-capabilities)
4. [Epic Editor](#4-epic-editor)
5. [Blueprint & Diagrams](#5-blueprint--diagrams)
6. [GitLab Integration](#6-gitlab-integration)
7. [Issue Management](#7-issue-management)
8. [Category Templates](#8-category-templates)
9. [Settings & Configuration](#9-settings--configuration)
10. [Export Capabilities](#10-export-capabilities)
11. [Development Features](#11-development-features)

---

## 1. Core Application

### Navigation & Layout

| Component | Description |
|-----------|-------------|
| **4 Main Tabs** | Epic Planner (Wizard), Epic Editor, Blueprints, Settings |
| **Collapsible Sidebar** | Icon-based navigation with expand/collapse |
| **Header** | Application branding, mock mode indicator, notifications |
| **Toast Notifications** | Success, error, warning, info messages with auto-dismiss |

### UI Design

- UBS brand styling with official color palette
- Flat design (no gradients)
- Glass morphism effects on cards
- Smooth transitions and animations
- Responsive layout
- Accessibility compliant (ARIA labels, keyboard navigation)

---

## 2. Wizard System (6 Stages)

A guided 6-stage input form that collects project information and generates comprehensive epics.

### Stage 1: Project
| Field | Purpose |
|-------|---------|
| Project Name | Epic title and identifier |
| Background & Context | Project context and history |

### Stage 2: Objective & Scope
| Field | Purpose |
|-------|---------|
| Objective | What the epic aims to achieve |
| In Scope | What's included |
| Out of Scope | What's explicitly excluded (optional) |

### Stage 3: Architecture
| Field | Purpose |
|-------|---------|
| Assumptions | Project assumptions (optional) |
| Architecture Overview | High-level technical design |
| Data Stores & Services | Database and service definitions |

### Stage 4: Features
| Field | Purpose |
|-------|---------|
| Key Features | Core functionality list |
| User Stories | As a [persona]... format stories (optional) |
| Non-Functional Requirements | Performance, security, scalability (optional) |
| Deliverables | What will be delivered |

### Stage 5: Team & Environment
| Field | Purpose |
|-------|---------|
| Team & Roles | RACI matrix, responsibilities |
| Environments & CI/CD | Dev, staging, prod setup |
| Data Security & Access | Security controls (optional) |

### Stage 6: Delivery
| Field | Purpose |
|-------|---------|
| Dependencies | External dependencies (optional) |
| Risks | Identified risks (optional) |
| Next Steps | Immediate action items |
| Definition of Done | Completion criteria |
| Approvers | Sign-off authorities (optional) |

### Wizard Features

- **Progress Indicator**: Visual dots showing current stage (1-6)
- **Navigation**: Previous/Next buttons with validation
- **AI Suggestions**: Per-field AI-powered content generation
- **Reset Wizard**: Clear all fields and start fresh
- **Content Persistence**: Fields retain values during navigation

---

## 3. AI Capabilities

### 3.1 Field-Level AI Suggestions

| Mode | Description |
|------|-------------|
| **With Context** | Generates content based on user's entered keywords |
| **Auto** | Generates content from scratch using project context |
| **Alternatives** | Dropdown with multiple suggestion options |

### 3.2 AI Critique (Quality Analysis)

Activated via the orange star button in Epic Editor.

| Feature | Description |
|---------|-------------|
| **Overall Score** | 0-10 score with color coding (green/yellow/red) |
| **Section Breakdown** | Per-section scores and status |
| **Status Labels** | Strong, Adequate, Weak, Missing |
| **Critical Issues** | Must-fix problems highlighted in red |
| **Suggestions** | Specific improvements for weak sections |
| **One-Click Apply** | Apply AI-suggested improvements |

### 3.3 Premium 5-Stage Pipeline

Advanced AI refinement activated via the purple button.

| Stage | Purpose |
|-------|---------|
| **1. Deep Comprehension** | Builds mental model, identifies entities and gaps |
| **2. Category Classification** | Auto-detects epic type from 7 categories |
| **3. Structural Assessment** | Scores sections, recommends transformations |
| **4. Content Refinement** | Improves weak sections, generates missing content |
| **5. Mandatory Output** | Generates diagram, user stories, assembles final epic |

**Pipeline Features:**
- Real-time progress tracking with time estimates
- Per-stage status indicators
- Cancel capability mid-execution
- Results panel with all outputs
- Final word count and section scores

### 3.4 Additional AI Features

| Feature | Description |
|---------|-------------|
| **Global Feedback Chat** | Chat interface for epic-wide feedback |
| **Smart Refine** | Parse epic back to wizard, refine, regenerate |
| **Diagram Fixing** | AI repairs broken Mermaid syntax |
| **Section Improvement** | AI-enhance individual sections |
| **Suggestion Approval Modal** | Review and selectively apply AI suggestions |

---

## 4. Epic Editor

### Core Editing

| Feature | Description |
|---------|-------------|
| **Markdown Editor** | Full markdown editing with textarea |
| **Live Preview** | Real-time rendered markdown preview |
| **Word Count** | Real-time character and word count display |
| **17 Standard Sections** | Pre-defined section structure |

### Standard Sections

1. Objective
2. Background & Context
3. Scope
4. Assumptions
5. High-Level Architecture Overview
6. Architecture Diagrams
7. Team & Roles
8. Environments & CI/CD Strategy
9. Data Security & Access Controls
10. Data Stores, Services & Interfaces
11. Key Features & User Stories
12. Non-Functional Requirements (NFRs)
13. Dependencies & Risks
14. Deliverables
15. Next Steps
16. Definition of Done (DoD)
17. Approvals & Sign-Offs

### Preview Features

- Mermaid diagram rendering
- GitHub-flavored markdown (GFM)
- Syntax highlighting for code blocks
- Table rendering
- Nested list support
- Link handling

---

## 5. Blueprint & Diagrams

### Diagram Generation

| Feature | Description |
|---------|-------------|
| **AI-Powered Generation** | Intelligent blueprint from epic content |
| **Mermaid.js v11.4.0** | Industry-standard diagram rendering |
| **PlantUML Support** | Alternative diagram encoding |

### Supported Diagram Types

- Flowchart (default)
- Sequence Diagram
- C4 Container Diagram
- Entity-Relationship (ER) Diagram
- State Diagram
- Gantt Chart

### Diagram Controls

| Control | Description |
|---------|-------------|
| **Zoom Slider** | 0-200% zoom level |
| **Full-Screen** | Toggle fullscreen view |
| **Re-Analyze** | Regenerate diagram with AI |
| **Copy Code** | Copy Mermaid source |
| **Download .mmd** | Save Mermaid file |
| **Export SVG** | Vector export |
| **Export PNG** | Raster export |
| **Edit in Mermaid Live** | Open in online editor |
| **AI Fix** | Repair broken diagram syntax |

---

## 6. GitLab Integration

### Load Epic

| Feature | Description |
|---------|-------------|
| **Search** | Real-time search by epic title |
| **Filter by Status** | Opened, Closed, All |
| **Pagination** | 20 epics per page |
| **Epic Hierarchy** | View parent epic, child epics, related issues |
| **Group Navigation** | Browse Crews and Pods hierarchy |
| **Subgroup Caching** | Cached group data for performance |

### Publish Epic

| Feature | Description |
|---------|-------------|
| **Target Selection** | Choose Crew or Pod level group |
| **Group Dropdown** | Select from available subgroups |
| **Labels** | Auto-apply crew/pod labels |
| **Epic Creation** | Create new epic in GitLab |
| **Epic Update** | Update existing loaded epic |

### Configuration

| Setting | Description |
|---------|-------------|
| **API Endpoint** | GitLab instance URL |
| **Access Token** | Personal Access Token for authentication |
| **Root Group ID** | Top-level group for navigation |
| **Crew Label Prefix** | Prefix for crew labels (default: "crew::") |
| **Pod Label Prefix** | Prefix for pod labels (default: "pod::") |
| **Connection Test** | Verify GitLab connectivity |

---

## 7. Issue Management

### User Story Parsing

| Feature | Description |
|---------|-------------|
| **Story Extraction** | Parse stories from epic content |
| **Format Detection** | Identify "As a [persona]..." format |
| **Acceptance Criteria** | Extract criteria from stories |

### Duplicate Detection

| Feature | Description |
|---------|-------------|
| **AI Similarity Analysis** | Compare against existing issues |
| **Similarity Scoring** | 0-100% match score |
| **Auto-Selection** | Pre-select non-duplicate stories |

### Issue Creation

| Feature | Description |
|---------|-------------|
| **Batch Creation** | Create multiple issues at once |
| **Progress Tracking** | See current story being created |
| **Auto-Link** | Link created issues to epic |
| **Description Generation** | AI-enhanced issue descriptions |
| **Label Assignment** | Auto-apply user-story labels |

---

## 8. Category Templates

### 7 Epic Categories

| Category | Focus Area |
|----------|------------|
| **Business Requirement** | ROI, stakeholder value, strategic alignment |
| **Technical Design** | Architecture, alternatives, cross-cutting concerns |
| **Feature Specification** | Product-focused, user stories, evidence-based |
| **API Specification** | Developer-friendly, example-driven, precise |
| **Infrastructure Design** | Ops-focused, SLO-driven, cost-aware |
| **Migration Plan** | Procedural, risk-aware, operationally precise |
| **Integration Spec** | Contract-precise, operationally thorough |

### Template Features

| Feature | Description |
|---------|-------------|
| **Required Sections** | Category-specific must-have sections |
| **Optional Sections** | Additional sections as needed |
| **Word Targets** | Per-section word count guidance |
| **Format Hints** | Table types, list formats, code blocks |
| **Tone Guidance** | Writing style for category |
| **Expert Role** | AI persona for category |
| **Progressive Disclosure** | 10-second, 2-minute, full read paths |

### Rich Formatting Support

- RACI matrices
- Priority tables with emoji
- Risk heat maps
- Cost analysis tables
- SLO/SLA tables
- Mermaid diagrams
- Collapsible sections
- Code blocks with syntax
- Endpoint specifications
- Event schemas

---

## 9. Settings & Configuration

### AI Provider Options

| Provider | Configuration |
|----------|---------------|
| **Azure OpenAI** | Endpoint, API Key, Deployment, API Version, Model Family |
| **OpenAI** | API Key, Model Selection |
| **Mock Mode** | No API required, demo responses |

### AI Settings

| Setting | Description |
|---------|-------------|
| **Max Tokens** | Response length limit (model-specific) |
| **Temperature** | Creativity level (0-2) |
| **Model Selection** | GPT-5, GPT-4, GPT-3.5 options |
| **Connection Test** | Verify AI provider connectivity |

### Storage

| Feature | Description |
|---------|-------------|
| **Auto-Save** | Config saved to localStorage |
| **Load on Startup** | Restore previous settings |
| **Config Validation** | Verify required fields |

---

## 10. Export Capabilities

### Epic Export

| Format | Description |
|--------|-------------|
| **Markdown (.md)** | Download epic as markdown file |
| **Clipboard** | Copy entire epic to clipboard |
| **localStorage** | Save draft locally |

### Diagram Export

| Format | Description |
|--------|-------------|
| **SVG** | Vector format, scalable |
| **PNG** | Raster format, fixed resolution |
| **Mermaid (.mmd)** | Source code file |
| **Mermaid Live** | Open in online editor |

### Report Export

| Format | Description |
|--------|-------------|
| **Critique Report** | AI analysis as text |
| **Pipeline Results** | Full analysis output |

---

## 11. Development Features

### Mock Mode

| Feature | Description |
|---------|-------------|
| **Toggle** | `MOCK_GITLAB_ENABLED` in mockGitLabData.ts |
| **Mock Epics** | 6 realistic sample epics |
| **Mock Labels** | 14 sample labels |
| **Mock Hierarchy** | 3-level group structure |
| **Visual Indicator** | Yellow "MOCK MODE" badge |
| **All API Endpoints** | Full mock coverage |

### Testing

| Feature | Description |
|---------|-------------|
| **Vitest Framework** | Unit and integration tests |
| **63+ Tests** | Across 4 test files |
| **Puppeteer E2E** | End-to-end browser tests |
| **Test UI** | Visual test runner |

### Performance

| Feature | Description |
|---------|-------------|
| **Request Throttling** | Rate limiting for API calls |
| **Lazy Rendering** | Optimize large lists |
| **Debounced Search** | Reduce API calls |
| **Group Caching** | Cache subgroup data |

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Framework** | React 19.0.0 |
| **Language** | TypeScript 5.6.0 |
| **Build Tool** | Vite 6.0.0 |
| **Markdown** | react-markdown + remark-gfm |
| **Diagrams** | Mermaid.js 11.4.0 |
| **Testing** | Vitest 4.0.17 |

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/App.tsx` | Main component with UI and logic |
| `src/types.ts` | TypeScript interfaces and constants |
| `src/config.ts` | API configuration and GitLab functions |
| `src/skills.ts` | AI prompts and generation logic |
| `src/categoryTemplates.json` | Epic category definitions |
| `src/MarkdownPreview.tsx` | Markdown renderer with Mermaid |
| `src/mockGitLabData.ts` | Mock data for development |

---

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (port 3002)
npm run build        # Production build
npm test             # Run tests
```

---

*Epic Generator v4 - FRAME*
*Feature Requirements & Architecture Management Engine*
