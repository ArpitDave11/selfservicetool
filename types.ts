// Epic Generator Types & Constants

// ===========================================
// GITLAB GROUP HIERARCHY TYPES
// ===========================================

// Group metadata from GitLab API
export interface GitLabGroup {
  id: number;
  name: string;
  full_path: string;
  parent_id: number | null;  // null = root group
  description?: string;
  visibility?: string;
}

// Cache entry for a group
export interface GroupCacheEntry {
  metadata: GitLabGroup;
  subgroups: GitLabGroup[];
  epics: import('./config').GitLabEpic[];
  fetchedAt: number;
}

// Navigation state for group hierarchy
export interface GroupNavigationState {
  currentGroupId: string;
  breadcrumb: { id: string; name: string }[];
  isLoading: boolean;
}

// ===========================================
// WIZARD TYPES
// ===========================================

export interface StageField {
  name: string;
  label: string;
  placeholder: string;
  type: 'text' | 'textarea';
  required: boolean;
}

export interface Stage {
  id: string;
  title: string;
  description: string;
  fields: StageField[];
  populatesSections: number[];
}

export interface RefinedData {
  [key: string]: {
    original: string;
    refined: string;
    diagramNode: string;
  };
}

export interface EpicState {
  currentStage: number;
  data: RefinedData;
  diagramNodes: string[];
  generatedEpic: string | null;
}

// Chat/Feedback Types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  // For AI follow-up questions
  questionType?: 'section-select' | 'text-input' | 'confirm' | 'scope-select';
  options?: string[];  // For dropdown options
  selectedValue?: string;  // User's answer
  isAnswered?: boolean;  // Whether this question has been answered
}

export interface ChatState {
  messages: ChatMessage[];
  isOpen: boolean;
  isProcessing: boolean;
  pendingSection?: number;  // Section being modified
  pendingFeedback?: string;  // Original feedback to apply
}

// Global Feedback Progress (Apply to Entire Epic)
export interface GlobalFeedbackProgress {
  isApplying: boolean;
  current: number;
  total: number;
  currentSection: string;
}

export interface GlobalFeedbackResult {
  updatedEpic: string;
  summary: string;
  changedSections: string[];
  failedSections: string[];
}

// AI Refinement Types
export interface SectionFeedback {
  sectionNum: number;           // 1-17
  sectionTitle: string;         // e.g., "Objective", "Scope"
  score: number;                // 0-10 for this section
  status: 'strong' | 'adequate' | 'weak' | 'missing';
  issues: string[];             // Specific problems found
  suggestions: string[];        // How to improve
  refinedContent?: string;      // AI-improved version (optional)
}

export interface EpicQualityReport {
  overallScore: number;         // 0-10
  summary: string;              // One paragraph overall assessment
  sections: SectionFeedback[];  // Feedback for each section
  criticalIssues: string[];     // Must-fix problems
  strengthAreas: string[];      // What's done well
  missingRequired: string[];    // Required info that's missing
  // Category-aware critique fields
  detectedCategory?: string;    // e.g., "business_requirement", "technical_design"
  categoryConfidence?: number;  // 0-1 confidence in detection
  expertRole?: string;          // e.g., "software architect", "product manager"
}

export interface RefinementState {
  isRefining: boolean;
  progress: { current: number; total: number; section: string };
  report: EpicQualityReport | null;
  showReport: boolean;
}

// Suggestion Approval Types (for AI Critique flow)
export interface SuggestionPreview {
  sectionNum: number;
  sectionTitle: string;
  issues: string[];
  currentContent: string;      // Truncated for preview (300 chars)
  currentContentFull: string;  // Full content for apply
  improvedContent: string;     // AI-generated improvement
  isAccepted: boolean;         // User's choice
  isGenerating: boolean;       // Loading state
  error?: string;              // Error message if failed
  isIdentical: boolean;        // True if no changes needed
}

export interface SuggestionApprovalState {
  isOpen: boolean;
  isGenerating: boolean;       // Generating all previews
  isApplying: boolean;         // Applying selected suggestions
  suggestions: SuggestionPreview[];
  generationProgress: {
    current: number;
    total: number;
    currentSection: string;
  };
}

// ===========================================
// PREMIUM 7-STAGE PIPELINE TYPES (Stages 1-5)
// Replaces the simple refine feature in Epic Editor
// ===========================================

/**
 * Stage 1: Deep Comprehension Output
 * Builds a complete mental model of the epic before any modifications
 */
export interface EntityRelationship {
  entity: string;
  type: 'service' | 'database' | 'api' | 'user' | 'system' | 'external' | 'other';
  relationships: string[];  // Names of related entities
  description: string;
}

export interface SemanticSection {
  sectionNum: number;
  sectionTitle: string;
  semanticPurpose: string;     // What this section is trying to achieve
  keyTopics: string[];         // Main topics covered
  references: string[];        // Cross-references to other sections
  implicitContent: string[];   // Content author assumed but didn't write
}

export interface ComprehensionOutput {
  projectEssence: string;           // 2-3 sentence summary
  keyEntities: EntityRelationship[];
  detectedGaps: string[];           // Referenced but never defined
  implicitRisks: string[];          // Author didn't call out
  semanticSections: SemanticSection[];
  timestamp: number;
}

// Stage 2: Category Classification Output
export type EpicCategory =
  | 'business_requirement'
  | 'technical_design'
  | 'feature_specification'
  | 'api_specification'
  | 'infrastructure_design'
  | 'migration_plan'
  | 'integration_spec';

export type ToneType =
  | 'executive-friendly'
  | 'precise-technical'
  | 'user-focused'
  | 'ops-focused'
  | 'procedural';

export type StoryStyle =
  | 'business'
  | 'technical'
  | 'feature'
  | 'api'
  | 'infrastructure'
  | 'migration'
  | 'integration';

export type ArchitectureFocus =
  | 'high-level'
  | 'detailed-components'
  | 'user-interaction'
  | 'api-flow'
  | 'deployment'
  | 'before-after'
  | 'sequence';

export interface CategoryConfig {
  requiredSections: string[];
  optionalSections?: string[];
  tone: ToneType;
  storyStyle: StoryStyle;
  architectureFocus: ArchitectureFocus;
  description?: string;
}

export interface ClassificationOutput {
  primaryCategory: EpicCategory;
  confidence: number;              // 0-1
  secondaryCategory?: EpicCategory;
  intentMismatch?: {
    authorIntent: string;
    actualCategory: EpicCategory;
  };
  categoryConfig: CategoryConfig;
  reasoning: string;               // Why this classification
}

// Stage 3: Structural Assessment Output
export type TransformationType =
  | 'keep'         // score >= 8 all dimensions
  | 'restructure'  // good content, poor organization
  | 'merge'        // >60% overlap with another section
  | 'split'        // covers multiple concerns
  | 'add';         // required section missing

export interface SectionScore {
  sectionTitle: string;   // Primary identifier (dynamic, not hardcoded)
  completeness: number;   // 1-10
  relevance: number;      // 1-10
  placement: number;      // 1-10
  overallScore: number;   // average
}

export interface TransformationAction {
  sectionTitle: string;        // Dynamic title (not hardcoded number)
  action: TransformationType;
  rationale: string;
  mergeWith?: string;          // For merge actions - title of section to merge with
  splitInto?: string[];        // For split actions
}

export interface StructuralOutput {
  sectionScores: SectionScore[];
  transformationPlan: TransformationAction[];
  missingSections: string[];
  proposedOutline: string[];
}

// Stage 4: Content Refinement Output
export interface PipelineRefinedSection {
  sectionTitle: string;          // Dynamic title (not hardcoded number)
  originalContent: string;
  refinedContent: string;
  action: TransformationType;    // What was done (keep/refine/add)
  changes: string[];             // List of changes made
  wasKept: boolean;              // True if kept as-is (score >= 8)
}

export interface RefinementOutput {
  refinedSections: PipelineRefinedSection[];
  sectionsKept: number;          // Count of sections kept as-is
  sectionsRefined: number;       // Count of sections refined
  sectionsAdded: number;         // Count of new sections added
  totalSections: number;
}

// Stage 5: Mandatory Sections Output
export interface PipelineUserStory {
  id: string;
  title: string;               // Professional, action-oriented title (5-8 words) for issue creation
  persona: string;
  goal: string;
  benefit: string;
  acceptanceCriteria: string[];
  priority: 'high' | 'medium' | 'low';
  sourceSection: string;       // Section title this story derives from
}

export interface CoverageReport {
  totalRequirements: number;
  coveredByStories: number;
  uncoveredRequirements: string[];
}

/**
 * Final assembled epic with embedded content
 */
export interface AssembledEpic {
  markdown: string;            // Complete epic markdown
  embeddedDiagram: boolean;    // Blueprint was embedded
  embeddedStories: boolean;    // User stories were embedded
  sectionCount: number;        // Number of sections in final
  wordCount: number;           // Total word count
}

export interface MandatoryOutput {
  architectureDiagram: string;   // Mermaid diagram code
  diagramType: string;           // flowchart, sequence, etc.
  userStories: PipelineUserStory[];
  assembledEpic: AssembledEpic;  // Final epic with embedded content
}

// Pipeline State Types
export type PipelineStage = 1 | 2 | 3 | 4 | 5;
export type StageStatus = 'pending' | 'running' | 'complete' | 'error';

export interface StageProgress {
  status: StageStatus;
  message: string;
}

/** Pipeline execution progress tracking */
export interface PipelineProgress {
  currentStage: PipelineStage;
  stageProgress: {
    1: StageProgress;
    2: StageProgress;
    3: StageProgress;
    4: StageProgress;
    5: StageProgress;
  };
  startTime: number;                 // ms since epoch
  estimatedTimeRemaining: number;    // seconds
}

export interface PipelineResult {
  comprehension: ComprehensionOutput;
  classification: ClassificationOutput;
  structural: StructuralOutput;
  refinement: RefinementOutput;
  mandatory: MandatoryOutput;
  totalDuration: number;         // ms
  stagesCompleted: PipelineStage[];
}

export interface PipelineState {
  isRunning: boolean;
  progress: PipelineProgress | null;
  result: PipelineResult | null;
  error: string | null;
  showResults: boolean;
}

// ===========================================
// DYNAMIC SECTION & AGENT SKILL TYPES
// ===========================================

/**
 * Section discovered from parsing the source epic
 * (Not hardcoded - dynamically extracted)
 */
export interface DiscoveredSection {
  title: string;               // Section title as found in epic
  normalizedTitle: string;     // Normalized for matching (lowercase, trimmed)
  content: string;             // Raw content of this section
  startLine: number;           // Line number where section starts
  endLine: number;             // Line number where section ends
  wordCount: number;           // Content length indicator
  hasSubsections: boolean;     // Contains ## or ### headers
}

/**
 * Section analysis result - combines discovery with scoring
 */
export interface AnalyzedSection {
  discovered: DiscoveredSection;
  score: SectionScore;
  action: TransformationType;
  isRequired: boolean;         // Required by category template
  rationale: string;           // Why this action was chosen
}

/**
 * Agent skill definition
 */
export type SkillName =
  | 'analyze'              // Deep comprehension
  | 'classify'             // Category classification
  | 'discover-sections'    // Parse existing sections
  | 'score-section'        // Score a section
  | 'refine-section'       // Refine a section
  | 'generate-blueprint'   // Generate architecture diagram
  | 'generate-stories'     // Generate user stories
  | 'assemble-epic';       // Combine everything into final epic

export interface SkillExecution {
  skill: SkillName;
  status: 'pending' | 'running' | 'complete' | 'error';
  message: string;
  startTime?: number;
  endTime?: number;
  result?: unknown;
}

/**
 * Agent progress - shows which skills are executing
 */
export interface AgentProgress {
  currentSkill: SkillName;
  skills: SkillExecution[];
  overallProgress: number;     // 0-100 percentage
  startTime: number;
}

// ===========================================
// RICH TEMPLATE SYSTEM TYPES
// ===========================================

/**
 * Section format types for structured content generation
 */
export type SectionFormat =
  | 'table'
  | 'bullet-list'
  | 'raci-table'
  | 'priority-table'
  | 'metrics-table'
  | 'risk-heat-map-and-register'
  | 'task-list-and-table'
  | 'code-blocks'
  | 'comparison-table-and-prose'
  | 'phase-table'
  | 'endpoint-blocks'
  | 'error-table'
  | 'schema-table'
  | 'slo-table'
  | 'numbered-procedure'
  | 'mapping-table'
  | 'mermaid-sequence';

/**
 * Mermaid diagram types supported
 */
export type MermaidDiagramType =
  | 'mermaid-flowchart'
  | 'mermaid-sequence'
  | 'mermaid-c4-container'
  | 'mermaid-er'
  | 'mermaid-state'
  | 'mermaid-gantt';

/**
 * Rich section configuration with formatting hints
 */
export interface RichSectionConfig {
  target?: number;                          // Target word count
  max?: number;                             // Maximum word count
  wordLimit?: number;                       // Legacy fallback
  format?: SectionFormat;                   // Table type, list format, etc.
  columns?: string[];                       // For table formats
  hint?: string;                            // AI generation guidance
  diagram?: MermaidDiagramType;             // Embedded diagram type
  subsections?: Record<string, RichSectionConfig>; // Nested sections
  collapsible?: boolean;                    // Wrap in <details> tag
  conditional?: string;                     // When to include (e.g., "if integration exists")
  template?: string;                        // Template string (e.g., user story format)
  count?: { min: number; max: number };     // For lists
  fields?: string[];                        // For metadata tables
}

/**
 * Progressive disclosure reading levels
 */
export interface ProgressiveDisclosure {
  '10_second_scan': string[];   // Quick overview sections
  '2_minute_read': string[];    // Key details sections
  'full_read': string[];        // Complete document sections
}

/**
 * Rich category template with full formatting support
 */
export interface RichCategoryTemplate {
  requiredSections: Record<string, RichSectionConfig>;
  optionalSections: Record<string, RichSectionConfig>;
  tone: string;
  storyStyle: string;
  architectureFocus: string;
  expertRole: string;
  description: string;
  totalWordTarget?: { min: number; max: number; excludes?: string[] };
  progressiveDisclosure?: ProgressiveDisclosure;
}

/**
 * Global template defaults for all categories
 */
export interface GlobalTemplateDefaults {
  statusEmoji: Record<string, string>;
  priorityLevels: Record<string, string>;
  reviewStates: Record<string, string>;
  markdownFeatures: {
    tableOfContents: string;
    alerts: string[];
    mermaidDiagrams: boolean;
    taskLists: boolean;
    collapsibleSections: boolean;
  };
}

/**
 * Full rich template data structure (matches JSON file)
 */
export interface RichTemplateData {
  _meta: {
    version: string;
    globalDefaults: GlobalTemplateDefaults;
  };
  business_requirement: RichCategoryTemplate;
  technical_design: RichCategoryTemplate;
  feature_specification: RichCategoryTemplate;
  api_specification: RichCategoryTemplate;
  infrastructure_design: RichCategoryTemplate;
  migration_plan: RichCategoryTemplate;
  integration_spec: RichCategoryTemplate;
}

// 6 Input Stages
export const STAGES: Stage[] = [
  {
    id: 'project',
    title: 'Project',
    description: 'Project name and background context',
    fields: [
      { name: 'projectName', label: 'Project Name', placeholder: 'Enter project name', type: 'text', required: true },
      { name: 'background', label: 'Background & Context', placeholder: 'Why does this project exist? What problem does it solve?', type: 'textarea', required: true },
    ],
    populatesSections: [1, 2],
  },
  {
    id: 'objective_scope',
    title: 'Objective & Scope',
    description: 'Define the goal and boundaries',
    fields: [
      { name: 'objective', label: 'Objective', placeholder: 'What is the main goal of this project?', type: 'textarea', required: true },
      { name: 'inScope', label: 'In Scope', placeholder: 'What is included in this project?', type: 'textarea', required: true },
      { name: 'outOfScope', label: 'Out of Scope', placeholder: 'What is explicitly excluded?', type: 'textarea', required: false },
    ],
    populatesSections: [1, 3],
  },
  {
    id: 'architecture',
    title: 'Architecture',
    description: 'System design and data stores',
    fields: [
      { name: 'assumptions', label: 'Assumptions', placeholder: 'What assumptions are we making?', type: 'textarea', required: false },
      { name: 'architectureOverview', label: 'Architecture Overview', placeholder: 'Describe the high-level system architecture', type: 'textarea', required: true },
      { name: 'dataStores', label: 'Data Stores & Services', placeholder: 'What databases, APIs, and services will be used?', type: 'textarea', required: true },
    ],
    populatesSections: [4, 5, 6, 10],
  },
  {
    id: 'features',
    title: 'Features',
    description: 'Key features, user stories, and requirements',
    fields: [
      { name: 'features', label: 'Key Features', placeholder: 'List the main features', type: 'textarea', required: true },
      { name: 'userStories', label: 'User Stories', placeholder: 'As a [user], I want [feature] so that [benefit]', type: 'textarea', required: false },
      { name: 'nfrs', label: 'Non-Functional Requirements', placeholder: 'Performance, scalability, security requirements', type: 'textarea', required: false },
      { name: 'deliverables', label: 'Deliverables', placeholder: 'What will be delivered?', type: 'textarea', required: true },
    ],
    populatesSections: [11, 12, 14],
  },
  {
    id: 'team_env',
    title: 'Team & Environment',
    description: 'Team structure, environments, and security',
    fields: [
      { name: 'teams', label: 'Team & Roles', placeholder: 'Who is involved and what are their roles?', type: 'textarea', required: true },
      { name: 'environments', label: 'Environments & CI/CD', placeholder: 'Dev, Staging, Prod environments and deployment strategy', type: 'textarea', required: true },
      { name: 'security', label: 'Data Security & Access', placeholder: 'Security requirements and access controls', type: 'textarea', required: false },
    ],
    populatesSections: [7, 8, 9],
  },
  {
    id: 'delivery',
    title: 'Delivery',
    description: 'Dependencies, risks, and completion criteria',
    fields: [
      { name: 'dependencies', label: 'Dependencies', placeholder: 'What does this project depend on?', type: 'textarea', required: false },
      { name: 'risks', label: 'Risks', placeholder: 'What are the potential risks?', type: 'textarea', required: false },
      { name: 'nextSteps', label: 'Next Steps', placeholder: 'Immediate actions to take', type: 'textarea', required: true },
      { name: 'dod', label: 'Definition of Done', placeholder: 'When is this project considered complete?', type: 'textarea', required: true },
      { name: 'approvers', label: 'Approvers', placeholder: 'Who needs to sign off?', type: 'textarea', required: false },
    ],
    populatesSections: [13, 15, 16, 17],
  },
];

// 17 Epic Sections Template
export const EPIC_SECTIONS = [
  { num: 1, title: 'Objective', dataKeys: ['objective'] },
  { num: 2, title: 'Background & Context', dataKeys: ['background'] },
  { num: 3, title: 'Scope', dataKeys: ['inScope', 'outOfScope'], subsections: ['In Scope', 'Out of Scope'] },
  { num: 4, title: 'Assumptions', dataKeys: ['assumptions'] },
  { num: 5, title: 'High-Level Architecture Overview', dataKeys: ['architectureOverview'], hasDiagram: true },
  { num: 6, title: 'Architecture Diagrams', dataKeys: [], isReference: true },
  { num: 7, title: 'Team & Roles', dataKeys: ['teams'], isTable: true },
  { num: 8, title: 'Environments & CI/CD Strategy', dataKeys: ['environments'] },
  { num: 9, title: 'Data Security & Access Controls', dataKeys: ['security'] },
  { num: 10, title: 'Data Stores, Services & Interfaces', dataKeys: ['dataStores'] },
  { num: 11, title: 'Key Features & User Stories', dataKeys: ['features', 'userStories'] },
  { num: 12, title: 'Non-Functional Requirements (NFRs)', dataKeys: ['nfrs'] },
  { num: 13, title: 'Dependencies & Risks', dataKeys: ['dependencies', 'risks'], subsections: ['Dependencies', 'Risks'] },
  { num: 14, title: 'Deliverables', dataKeys: ['deliverables'] },
  { num: 15, title: 'Next Steps', dataKeys: ['nextSteps'] },
  { num: 16, title: 'Definition of Done (DoD)', dataKeys: ['dod'] },
  { num: 17, title: 'Approvals & Sign-Offs', dataKeys: ['approvers'], isTable: true },
];

// ===========================================
// ISSUE MANAGEMENT TYPES
// ===========================================

// Parsed user story from epic content
export interface ParsedUserStory {
  id: string;                    // Unique ID for UI
  rawText: string;               // Original text from markdown
  title: string;                 // Extracted/cleaned title for issue
  description: string;           // Description for issue body
  persona?: string;              // "As a [persona]"
  goal?: string;                 // "I want [goal]"
  benefit?: string;              // "So that [benefit]"
  acceptanceCriteria?: string[]; // Extracted acceptance criteria
  hasExistingIssue: boolean;     // Whether this maps to an existing issue
  matchedIssueId?: number;       // ID of matched existing issue
  matchedIssueIid?: number;      // IID of matched existing issue
  similarityScore?: number;      // 0-100 similarity to existing issue
}

// Issue creation parameters
export interface CreateIssueParams {
  title: string;
  description?: string;
  labels?: string[];
  assignee_ids?: number[];
  milestone_id?: number;
  due_date?: string;
  weight?: number;
}

// Issue creation result
export interface GitLabIssueResult {
  success: boolean;
  data?: {
    id: number;
    iid: number;
    title: string;
    description: string;
    state: string;
    web_url: string;
    labels: string[];
  };
  error?: string;
}

// Issue-to-Epic link result
export interface LinkIssueToEpicResult {
  success: boolean;
  error?: string;
}

// State for issue creation modal
export interface IssueCreationState {
  isOpen: boolean;
  epicId?: number;
  epicIid?: number;
  parsedStories: ParsedUserStory[];
  selectedStoryIds: string[];
  existingIssues: Array<{
    id: number;
    iid: number;
    title: string;
    state: string;
    web_url: string;
  }>;
  isAnalyzing: boolean;         // LLM analyzing for duplicates
  isCreating: boolean;          // Creating issues
  creationProgress: {
    current: number;
    total: number;
    currentTitle: string;
  };
}
