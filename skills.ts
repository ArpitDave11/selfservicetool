// Epic Generator Skills & Prompts

import {
  EPIC_SECTIONS,
  STAGES,
  type RefinedData,
  type SectionFeedback,
  type EpicQualityReport,
  // Pipeline types
  type EpicCategory,
  type CategoryConfig,
  type ComprehensionOutput,
  type ClassificationOutput,
  type StructuralOutput,
  type RefinementOutput,
  type MandatoryOutput,
  type PipelineResult,
  type PipelineStage,
  type PipelineRefinedSection,
  type PipelineUserStory,
  type CoverageReport,
  type EntityRelationship,
  type SemanticSection,
  type SectionScore,
  type TransformationAction,
  type DiscoveredSection,
  type AnalyzedSection,
  type AssembledEpic,
  type ExtractedRequirement,
  type RequirementGap,
  type TraceabilityRow,
  type AuditCheckItem,
  type DetectedFailure,
  type ValidationOutput,
  type DeterministicScoreBreakdown,
  type SectionFeedbackItem,
  type StoryFeedbackItem,
  type IterationFeedback,
  type StoryPointCorrection,
  type SkillName,
  type SkillExecution,
  type AgentProgress,
  // Rich template types
  type RichSectionConfig,
  type RichCategoryTemplate,
  type RichTemplateData,
  type GlobalTemplateDefaults,
  type SectionFormat,
  type ProgressiveDisclosure
} from './types';
import { type AppConfig, callAI } from './config';

// ===========================================
// REQUEST THROTTLING - Prevent API Rate Limits
// ===========================================

/**
 * Simple request queue to limit concurrent API calls
 * Prevents hitting rate limits by spacing out requests
 */
class RequestThrottler {
  private activeRequests = 0;
  private maxConcurrent: number;
  private minDelayMs: number;
  private lastRequestTime = 0;
  private _enabled = true;

  constructor(maxConcurrent = 2, minDelayMs = 500) {
    this.maxConcurrent = maxConcurrent;
    this.minDelayMs = minDelayMs;
  }

  /**
   * Enable or disable throttling (disable for tests)
   */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  async throttle<T>(fn: () => Promise<T>): Promise<T> {
    // If throttling is disabled, just run the function directly
    if (!this._enabled) {
      return fn();
    }

    // Wait for slot to become available
    while (this.activeRequests >= this.maxConcurrent) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Ensure minimum delay between requests
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minDelayMs) {
      await new Promise(resolve => setTimeout(resolve, this.minDelayMs - timeSinceLastRequest));
    }

    this.activeRequests++;
    this.lastRequestTime = Date.now();

    try {
      return await fn();
    } finally {
      this.activeRequests--;
    }
  }

  /**
   * Process items with throttled concurrency
   */
  async mapThrottled<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = [];

    for (const item of items) {
      const result = await this.throttle(() => fn(item));
      results.push(result);
    }

    return results;
  }
}

// Global throttler instance - limits to 2 concurrent requests with 500ms minimum gap
export const apiThrottler = new RequestThrottler(2, 500);

/**
 * Disable throttling for tests
 */
export function disableThrottlingForTests(): void {
  apiThrottler.setEnabled(false);
}

/**
 * Re-enable throttling after tests
 */
export function enableThrottling(): void {
  apiThrottler.setEnabled(true);
}

// Skill Types
export interface RefineResult {
  refined: string;
  diagramNode: string;
  suggestions?: string[];
}

export interface GenerateResult {
  epic: string;
  diagram: string;
}

export interface SuggestionResult {
  suggestion: string;
  alternatives?: string[];
}

// Store config reference for AI calls
let currentConfig: AppConfig | null = null;

export function setConfig(config: AppConfig) {
  currentConfig = config;
}

// ===========================================
// PREMIUM PIPELINE: CATEGORY CONFIGURATIONS
// ===========================================

/**
 * Category-specific configurations for the 7 epic types.
 * Each category defines required sections, writing tone, user story style,
 * and architecture diagram focus.
 */
export const CATEGORY_CONFIGS: Record<EpicCategory, CategoryConfig> = {
  business_requirement: {
    requiredSections: ['Objective', 'Background', 'Scope', 'Success Metrics', 'Stakeholders'],
    tone: 'executive-friendly',
    storyStyle: 'business',
    architectureFocus: 'high-level'
  },
  technical_design: {
    requiredSections: ['Objective', 'Architecture', 'Data Model', 'API Contracts', 'NFRs'],
    tone: 'precise-technical',
    storyStyle: 'technical',
    architectureFocus: 'detailed-components'
  },
  feature_specification: {
    requiredSections: ['Objective', 'User Flows', 'Acceptance Criteria', 'Edge Cases'],
    tone: 'user-focused',
    storyStyle: 'feature',
    architectureFocus: 'user-interaction'
  },
  api_specification: {
    requiredSections: ['Endpoints', 'Request/Response', 'Error Codes', 'Auth', 'Rate Limits'],
    tone: 'precise-technical',
    storyStyle: 'api',
    architectureFocus: 'api-flow'
  },
  infrastructure_design: {
    requiredSections: ['Architecture', 'Scaling', 'Monitoring', 'Disaster Recovery'],
    tone: 'ops-focused',
    storyStyle: 'infrastructure',
    architectureFocus: 'deployment'
  },
  migration_plan: {
    requiredSections: ['Current State', 'Target State', 'Migration Steps', 'Rollback', 'Timeline'],
    tone: 'procedural',
    storyStyle: 'migration',
    architectureFocus: 'before-after'
  },
  integration_spec: {
    requiredSections: ['Systems', 'Data Flow', 'Error Handling', 'Retry Logic', 'Monitoring'],
    tone: 'precise-technical',
    storyStyle: 'integration',
    architectureFocus: 'sequence'
  }
};

/**
 * Story style instructions mapped by category
 */
export const STORY_STYLE_PROMPTS: Record<string, string> = {
  business: 'As a [business role] (executive, product owner, business analyst)',
  technical: 'As a [developer/system] (backend developer, frontend engineer, system)',
  feature: 'As a [end user] (customer, user, visitor)',
  api: 'As a [consuming system] (client application, integration, service)',
  infrastructure: 'As a [ops engineer] (DevOps, SRE, platform engineer)',
  migration: 'As a [migration lead] (data engineer, migration specialist)',
  integration: 'As a [integrating system] (partner system, external service)'
};

/**
 * Tone writing instructions for each tone type
 */
export const TONE_INSTRUCTIONS: Record<string, string> = {
  'executive-friendly': 'Use business language, focus on ROI, clear metrics, avoid jargon',
  'precise-technical': 'Use precise terminology, no ambiguity, include specific technical details',
  'user-focused': 'Write from user perspective, clear flows, testable criteria',
  'ops-focused': 'Focus on operations, monitoring, failure modes, runbooks',
  'procedural': 'Step-by-step format, clear ordering, checkpoints'
};

// ===========================================
// AI-POWERED INTELLIGENT REFINEMENT
// ===========================================

/**
 * AI-powered refinement that reads existing content and enhances intelligently
 * WITHOUT duplicating what's already there
 */
export async function aiRefineField(
  fieldName: string,
  userInput: string,
  context: Record<string, string>
): Promise<string> {
  if (!currentConfig) {
    // Fallback to basic formatting if no AI
    return userInput;
  }

  const systemPrompt = `You are an expert technical writer creating concise, professional content for a software project epic.

CRITICAL RULES:
1. READ the existing content carefully - DO NOT duplicate or repeat what's already there
2. Be CONCISE and DIRECT - avoid verbose phrases like "in order to", "the ability to", "functionality for"
3. If content already has headers like "**Context:**", do NOT add another one
4. Add only ESSENTIAL information that adds clear value
5. Use professional, active voice - no filler or fluff
6. Be specific to THIS project based on the context provided
7. Output ONLY the enhanced content - no explanations or preamble
8. TARGET: Keep content scannable - use bullet points, short sentences (15-20 words max)`;

  const fieldPrompts: Record<string, string> = {
    background: `Write concise project background (80-120 words max). Include business justification and strategic context. Be direct, no filler.`,
    objective: `Write clear objective (60-100 words). Include 3-5 SPECIFIC, MEASURABLE success metrics. Use numbers.`,
    inScope: `List in-scope items (5-10 bullets, max 15 words each). Be specific and actionable.`,
    outOfScope: `List out-of-scope items (3-7 bullets, max 12 words each). Be explicit about exclusions.`,
    assumptions: `List project assumptions (5-8 bullets, max 15 words each). Be specific to this project.`,
    architectureOverview: `Write architecture overview (100-150 words). Focus on key components and patterns. No generic text.`,
    dataStores: `Describe data stores (80-120 words). Include specific databases, schemas, caching strategies.`,
    features: `List features (5-10 items, 1-2 sentences each). Number each. Focus on what, not how.`,
    userStories: `This is handled by generateUserStories function.`,
    nfrs: `List NFRs (5-8 items, max 20 words each). Include specific numbers (e.g., "P99 latency <200ms").`,
    deliverables: `List deliverables (5-10 checklist items, max 15 words each). Be specific about artifacts.`,
    teams: `Define team structure (80-120 words). Include roles with clear responsibilities.`,
    environments: `Describe environments (60-100 words). Cover dev, staging, prod with key configs.`,
    security: `List security controls (5-8 bullets, max 20 words each). Be specific about auth, encryption, access.`,
    dependencies: `List dependencies (5-10 bullets, max 15 words each). Include external services and integrations.`,
    risks: `List risks (3-6 items). Each: one-line risk, likelihood (High/Med/Low), one-line mitigation.`,
    nextSteps: `List next steps (5-8 numbered items, max 15 words each). Be specific and actionable.`,
    dod: `List Definition of Done criteria (5-10 checklist items, max 15 words each). Be measurable.`,
    approvers: `List approvers (3-5 items). Include role and approval scope.`
  };

  const userPrompt = `PROJECT CONTEXT:
Project: ${context.projectName || 'Not specified'}
Objective: ${context.objective || 'Not specified'}
Key Features: ${context.features || 'Not specified'}
Architecture: ${context.architectureOverview || 'Not specified'}

FIELD TO ENHANCE: ${fieldName}

EXISTING CONTENT:
${userInput || '(empty)'}

TASK: ${fieldPrompts[fieldName] || 'Enhance this content with relevant details.'}

IMPORTANT: If the existing content is empty or minimal, generate appropriate content. If it already has good content, enhance it WITHOUT duplicating.

Enhanced content:`;

  try {
    const response = await callAI(currentConfig, systemPrompt, userPrompt);
    return response.trim();
  } catch (e) {
    console.error(`[aiRefineField] Error refining ${fieldName}:`, e);
    return userInput; // Fallback to original
  }
}

/**
 * Generate 15-20 meaningful user stories based on project context
 */
export async function generateUserStories(
  context: Record<string, string>,
  existingStories: string = ''
): Promise<string> {
  if (!currentConfig) {
    return existingStories || 'User stories to be defined based on features.';
  }

  const systemPrompt = `You are an expert Agile coach and product owner creating user stories for a software project.

RULES:
1. Generate 15-20 meaningful, specific user stories
2. Each story MUST follow format: "As a [specific persona], I want [specific goal], so that [specific benefit]"
3. Stories must be based on the project's features and objectives
4. Include different personas (end user, admin, system, developer, etc.) as appropriate
5. Stories should be atomic - one feature per story
6. Stories should be testable and have clear acceptance criteria implied
7. DO NOT duplicate any existing stories provided
8. Group stories by feature area with headers
9. Output ONLY the user stories - no explanations`;

  const userPrompt = `PROJECT CONTEXT:
Project: ${context.projectName || 'Software Project'}
Objective: ${context.objective || 'Not specified'}

KEY FEATURES:
${context.features || 'General software features'}

SCOPE:
${context.inScope || 'Standard project scope'}

ARCHITECTURE:
${context.architectureOverview || 'Standard architecture'}

${existingStories ? `EXISTING STORIES (DO NOT DUPLICATE):
${existingStories}` : ''}

Generate 15-20 user stories organized by feature area:`;

  try {
    const response = await callAI(currentConfig, systemPrompt, userPrompt);

    // Combine with existing if any
    if (existingStories && existingStories.trim()) {
      return `${existingStories.trim()}\n\n### Additional User Stories\n\n${response.trim()}`;
    }
    return response.trim();
  } catch (e) {
    console.error('[generateUserStories] Error:', e);
    return existingStories || 'User stories to be defined.';
  }
}

/**
 * Generate project-specific NFRs based on architecture
 */
export async function generateNFRs(
  context: Record<string, string>,
  existingNFRs: string = ''
): Promise<string> {
  if (!currentConfig) {
    return existingNFRs || 'NFRs to be defined.';
  }

  const systemPrompt = `You are a software architect defining Non-Functional Requirements.

Generate specific, measurable NFRs in these categories:
1. Performance (response times, throughput)
2. Scalability (user capacity, data volume)
3. Availability (uptime, recovery time)
4. Security (encryption, authentication, compliance)
5. Maintainability (code coverage, documentation)
6. Usability (accessibility, browser support)

RULES:
- Each NFR must have SPECIFIC, MEASURABLE values
- Base requirements on the project's architecture and scale
- Do NOT use generic values - tailor to this project
- Format with category headers and bullet points`;

  const userPrompt = `PROJECT:
${context.projectName || 'Software Project'}

ARCHITECTURE:
${context.architectureOverview || 'Standard architecture'}

DATA STORES:
${context.dataStores || 'Standard data stores'}

FEATURES:
${context.features || 'Standard features'}

${existingNFRs ? `EXISTING NFRs (enhance, don't duplicate):
${existingNFRs}` : ''}

Generate comprehensive NFRs:`;

  try {
    const response = await callAI(currentConfig, systemPrompt, userPrompt);
    return response.trim();
  } catch (e) {
    console.error('[generateNFRs] Error:', e);
    return existingNFRs || 'NFRs to be defined.';
  }
}

/**
 * Generate project-specific risks based on scope and architecture
 */
export async function generateRisks(
  context: Record<string, string>,
  existingRisks: string = ''
): Promise<string> {
  if (!currentConfig) {
    return existingRisks || 'Risks to be assessed.';
  }

  const systemPrompt = `You are a project risk analyst identifying and assessing project risks.

For each risk provide:
- Risk description
- Likelihood (High/Medium/Low)
- Impact (High/Medium/Low)
- Mitigation strategy

RULES:
- Identify 5-8 specific risks based on the project context
- Consider technical, resource, timeline, and external risks
- Be specific to THIS project, not generic risks
- Format each risk clearly with all four components`;

  const userPrompt = `PROJECT:
${context.projectName || 'Software Project'}

OBJECTIVE:
${context.objective || 'Not specified'}

ARCHITECTURE:
${context.architectureOverview || 'Standard architecture'}

DEPENDENCIES:
${context.dependencies || 'Not specified'}

SCOPE:
${context.inScope || 'Standard scope'}

${existingRisks ? `EXISTING RISKS (enhance, don't duplicate):
${existingRisks}` : ''}

Identify and assess project risks:`;

  try {
    const response = await callAI(currentConfig, systemPrompt, userPrompt);
    return response.trim();
  } catch (e) {
    console.error('[generateRisks] Error:', e);
    return existingRisks || 'Risks to be assessed.';
  }
}

/**
 * Generate security requirements based on architecture and data
 */
export async function generateSecurityRequirements(
  context: Record<string, string>,
  existingSecurity: string = ''
): Promise<string> {
  if (!currentConfig) {
    return existingSecurity || 'Security requirements to be defined.';
  }

  const systemPrompt = `You are a security architect defining security requirements.

Cover these areas:
1. Authentication & Authorization
2. Data Protection (encryption, masking)
3. Network Security
4. Audit & Logging
5. Compliance requirements
6. Secrets Management

RULES:
- Be specific based on the data stores and architecture
- Include specific protocols, standards, and tools
- Consider the sensitivity of data being handled
- Format with clear headers and bullet points`;

  const userPrompt = `PROJECT:
${context.projectName || 'Software Project'}

ARCHITECTURE:
${context.architectureOverview || 'Standard architecture'}

DATA STORES:
${context.dataStores || 'Standard data stores'}

${existingSecurity ? `EXISTING SECURITY REQUIREMENTS (enhance, don't duplicate):
${existingSecurity}` : ''}

Define security requirements:`;

  try {
    const response = await callAI(currentConfig, systemPrompt, userPrompt);
    return response.trim();
  } catch (e) {
    console.error('[generateSecurityRequirements] Error:', e);
    return existingSecurity || 'Security requirements to be defined.';
  }
}

// Get AI suggestion for a field using Azure OpenAI
// mode: 'with-context' uses user's keywords to tailor suggestion
// mode: 'auto' generates from scratch using project context
export async function getSuggestion(
  stageId: string,
  fieldName: string,
  context: Record<string, string>,
  mode: 'with-context' | 'auto' = 'auto'
): Promise<SuggestionResult> {
  if (!currentConfig) {
    throw new Error('Azure OpenAI is not configured. Please check Settings.');
  }

  const userHint = context['_userHint'];
  const systemPrompt = getSystemPromptForField(stageId, fieldName);
  const userPrompt = buildUserPrompt(stageId, fieldName, context, userHint, mode);

  const aiResponse = await callAI(currentConfig, systemPrompt, userPrompt);

  return {
    suggestion: aiResponse.trim(),
    alternatives: [],
  };
}

// Get system prompt for a specific field
function getSystemPromptForField(stageId: string, fieldName: string): string {
  const basePrompt = `You are an expert technical writer helping to create comprehensive software project epics.
Provide concise, professional content suitable for a technical design document.
Be specific and actionable. Use bullet points or numbered lists where appropriate.
Do not include any preamble or explanation - just provide the content directly.`;

  const fieldPrompts: Record<string, Record<string, string>> = {
    project: {
      projectName: `${basePrompt}\nGenerate a professional project name (2-4 words, no quotes).`,
      background: `${basePrompt}\nWrite a project background section explaining why this initiative exists and its business context.`,
    },
    objective_scope: {
      objective: `${basePrompt}\nWrite a clear, measurable project objective with success criteria.`,
      inScope: `${basePrompt}\nList items that are IN SCOPE for this project. Use bullet points, one item per line.`,
      outOfScope: `${basePrompt}\nList items that are OUT OF SCOPE for this project. Use bullet points, one item per line.`,
    },
    architecture: {
      assumptions: `${basePrompt}\nList technical and business assumptions for this project. Use bullet points.`,
      architectureOverview: `${basePrompt}\nDescribe the high-level system architecture including components, technologies, and how they interact.`,
      dataStores: `${basePrompt}\nDescribe the data stores, databases, caching layers, and data flow for this system.`,
    },
    features: {
      features: `${basePrompt}\nList the key features for this project. Use numbered list format.`,
      userStories: `${basePrompt}\nWrite user stories in the format "As a [role], I want [feature] so that [benefit]".`,
      nfrs: `${basePrompt}\nDefine non-functional requirements including performance, scalability, security, and availability targets.`,
      deliverables: `${basePrompt}\nList project deliverables. Use bullet points.`,
    },
    team_env: {
      teams: `${basePrompt}\nDefine team roles and responsibilities. Format: Role - Responsibility`,
      environments: `${basePrompt}\nDescribe the environment strategy (dev, staging, prod) and CI/CD approach.`,
      security: `${basePrompt}\nDefine security controls including authentication, authorization, encryption, and compliance requirements.`,
    },
    delivery: {
      dependencies: `${basePrompt}\nList project dependencies (teams, systems, third parties). Use bullet points.`,
      risks: `${basePrompt}\nIdentify project risks with mitigations. Format: Risk: [description] | Mitigation: [approach]`,
      nextSteps: `${basePrompt}\nList immediate next steps to kick off this project. Use numbered list.`,
      dod: `${basePrompt}\nDefine the Definition of Done criteria for this project. Use bullet points.`,
      approvers: `${basePrompt}\nList required approvers with their roles. Format: Name/Role - Type of approval`,
    },
  };

  return fieldPrompts[stageId]?.[fieldName] || basePrompt;
}

// Build user prompt based on context
function buildUserPrompt(
  _stageId: string,
  fieldName: string,
  context: Record<string, string>,
  userHint: string | undefined,
  mode: 'with-context' | 'auto'
): string {
  let prompt = '';

  // Add project context if available
  if (context.projectName) {
    prompt += `Project: ${context.projectName}\n`;
  }
  if (context.objective) {
    prompt += `Objective: ${context.objective}\n`;
  }
  if (context.background) {
    prompt += `Background: ${context.background}\n`;
  }

  // Add user hint if in with-context mode
  if (mode === 'with-context' && userHint) {
    prompt += `\nUser's keywords/ideas to incorporate: ${userHint}\n`;
    prompt += `\nBased on these keywords, generate appropriate content for the "${fieldName}" field.`;
  } else {
    prompt += `\nGenerate content for the "${fieldName}" field based on the project context above.`;
  }

  // Add field-specific guidance
  const fieldGuidance: Record<string, string> = {
    projectName: 'Generate a professional, concise project name.',
    background: 'Write 2-3 paragraphs explaining the business context and need.',
    objective: 'Write a clear objective with measurable success criteria.',
    inScope: 'List 5-8 items that are in scope.',
    outOfScope: 'List 3-5 items explicitly out of scope.',
    assumptions: 'List 4-6 key assumptions.',
    architectureOverview: 'Describe the architecture in 2-3 paragraphs with key components.',
    dataStores: 'Describe databases, caching, and data flow.',
    features: 'List 5-8 key features.',
    userStories: 'Write 3-5 user stories.',
    nfrs: 'Define performance, scalability, security, and availability requirements.',
    deliverables: 'List 5-7 project deliverables.',
    teams: 'Define 5-7 team roles.',
    environments: 'Describe dev, staging, and production environments.',
    security: 'Define authentication, authorization, and encryption approach.',
    dependencies: 'List 4-6 dependencies.',
    risks: 'Identify 3-5 risks with mitigations.',
    nextSteps: 'List 4-6 immediate next steps.',
    dod: 'Define 5-7 Definition of Done criteria.',
    approvers: 'List 3-5 required approvers.',
  };

  if (fieldGuidance[fieldName]) {
    prompt += `\n${fieldGuidance[fieldName]}`;
  }

  return prompt;
}

// Small delay for UI feedback
const mockDelay = () => new Promise(resolve => setTimeout(resolve, 300));

/**
 * Sanitize projectName for use as document title.
 * Ensures the H1 heading is a proper short title, not a long sentence or truncated text.
 * - If <=60 chars and <=8 words, keep as-is
 * - Otherwise truncate to 8 words / 60 chars, removing trailing incomplete words
 */
export function sanitizeProjectName(name: string): string {
  const trimmed = name.trim();
  const words = trimmed.split(/\s+/);

  // Already a reasonable title
  if (trimmed.length <= 60 && words.length <= 8) {
    // Still check for single-char trailing word (truncation artifact)
    if (words.length > 1 && words[words.length - 1].length <= 1) {
      return words.slice(0, -1).join(' ');
    }
    return trimmed;
  }

  // Truncate to first 8 words
  let sanitized = words.slice(0, 8).join(' ');
  if (sanitized.length > 60) {
    sanitized = sanitized.substring(0, 60);
    // Remove trailing partial word
    const lastSpace = sanitized.lastIndexOf(' ');
    if (lastSpace > 10) {
      sanitized = sanitized.substring(0, lastSpace);
    }
  }

  // Remove trailing single-char word (truncation artifact like "e" or "a")
  sanitized = sanitized.replace(/\s+\S{1,2}$/, '').trim();

  return sanitized || 'Untitled Project';
}

// Get diagram node for a field (used for Blueprint tab)
function getDiagramNode(fieldName: string, content: string): string {
  const diagramNodes: Record<string, string> = {
    projectName: `Project["${content.slice(0, 30)}"]`,
    background: `Context["Background & Context"]`,
    objective: `Objective["${content.slice(0, 30)}..."]`,
    inScope: `Scope["In Scope Items"]`,
    outOfScope: `OutScope["Out of Scope"]`,
    assumptions: `Assumptions["Assumptions"]`,
    architectureOverview: `Architecture["System Architecture"]`,
    dataStores: `DataStores["Data & Services"]`,
    features: `Features["Key Features"]`,
    userStories: `Stories["User Stories"]`,
    nfrs: `NFRs["NFRs"]`,
    deliverables: `Deliverables["Deliverables"]`,
    teams: `Team["Team Structure"]`,
    environments: `Environments["Environments"]`,
    security: `Security["Security"]`,
    dependencies: `Dependencies["Dependencies"]`,
    risks: `Risks["Risks"]`,
    nextSteps: `NextSteps["Next Steps"]`,
    dod: `DoD["Definition of Done"]`,
    approvers: `Approvers["Approvers"]`,
  };
  return diagramNodes[fieldName] || `Node_${fieldName}["${fieldName}"]`;
}

// Basic formatting helpers (used when AI is not available or for simple fields)
function formatAsBulletList(input: string): string {
  if (!input) return '';
  return input.split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.startsWith('-') || line.startsWith('•') ? line : `- ${line}`)
    .join('\n');
}

function formatAsNumberedList(input: string): string {
  if (!input) return '';
  return input.split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, i) => {
      // Check if already numbered
      if (/^\d+[\.\)]\s/.test(line)) return line;
      return `${i + 1}. ${line}`;
    })
    .join('\n');
}

function formatAsChecklist(input: string): string {
  if (!input) return '';
  return input.split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      // Check if already a checklist item
      if (/^-\s*\[[ x]\]/.test(line)) return line;
      return `- [ ] ${line.replace(/^-\s*/, '')}`;
    })
    .join('\n');
}

// Refine Skill - Enhances user input at each stage using AI
async function refineInput(
  stageId: string,
  fieldName: string,
  userInput: string,
  context: Record<string, string>
): Promise<RefineResult> {
  // Project name doesn't need AI - just return as-is
  if (fieldName === 'projectName') {
    return {
      refined: userInput,
      diagramNode: getDiagramNode(fieldName, userInput),
    };
  }

  // Special handling for fields that have dedicated AI generators
  if (fieldName === 'userStories') {
    // Use dedicated user story generator for 15-20 stories
    const refined = await generateUserStories(context, userInput);
    return {
      refined,
      diagramNode: getDiagramNode(fieldName, userInput),
    };
  }

  if (fieldName === 'nfrs') {
    // Use dedicated NFR generator
    const refined = await generateNFRs(context, userInput);
    return {
      refined,
      diagramNode: getDiagramNode(fieldName, userInput),
    };
  }

  if (fieldName === 'risks') {
    // Use dedicated risk generator
    const refined = await generateRisks(context, userInput);
    return {
      refined,
      diagramNode: getDiagramNode(fieldName, userInput),
    };
  }

  if (fieldName === 'security') {
    // Use dedicated security requirements generator
    const refined = await generateSecurityRequirements(context, userInput);
    return {
      refined,
      diagramNode: getDiagramNode(fieldName, userInput),
    };
  }

  // For all other fields, use the general AI refinement
  if (currentConfig) {
    try {
      const refined = await aiRefineField(fieldName, userInput, context);
      return {
        refined,
        diagramNode: getDiagramNode(fieldName, userInput),
      };
    } catch (e) {
      console.error(`[refineInput] AI refinement failed for ${fieldName}, falling back to basic formatting:`, e);
      // Fall through to basic formatting
    }
  }

  // Fallback: Basic formatting when AI is not available
  await mockDelay();

  // Apply appropriate formatting based on field type
  let refined = userInput;

  // Fields that should be bullet lists
  const bulletListFields = ['inScope', 'outOfScope', 'assumptions', 'dependencies'];
  if (bulletListFields.includes(fieldName)) {
    refined = formatAsBulletList(userInput) || userInput;
  }

  // Fields that should be numbered lists
  const numberedListFields = ['features', 'nextSteps'];
  if (numberedListFields.includes(fieldName)) {
    refined = formatAsNumberedList(userInput) || userInput;
  }

  // Fields that should be checklists
  const checklistFields = ['deliverables', 'dod'];
  if (checklistFields.includes(fieldName)) {
    refined = formatAsChecklist(userInput) || userInput;
  }

  return {
    refined,
    diagramNode: getDiagramNode(fieldName, userInput),
  };
}

// Generate Epic Skill - Creates full 17-section epic
async function generateEpic(data: RefinedData, projectName: string, blueprintCode?: string): Promise<GenerateResult> {
  await mockDelay();

  // Sanitize project name for H1 title — prevent sentence-as-title and truncation
  const title = sanitizeProjectName(projectName);

  // Build the epic document — document identity comes after context sections (not at top)
  let epic = `# ${title}\n\n`;
  epic += `*Generated on ${new Date().toLocaleDateString()}*\n\n---\n\n`;

  // Generate each section
  for (const section of EPIC_SECTIONS) {
    epic += `## ${section.num}. ${section.title}\n\n`;

    if (section.subsections) {
      // Handle sections with subsections (Scope, Dependencies & Risks)
      section.dataKeys.forEach((key, idx) => {
        const subsectionTitle = section.subsections![idx];
        const content = data[key]?.refined || '_To be defined_';
        epic += `### ${section.num}.${idx + 1} ${subsectionTitle}\n\n${content}\n\n`;
      });
    } else if (section.isTable && section.dataKeys[0] === 'teams') {
      // Team & Roles table
      epic += `| Role | Responsibility |\n|------|----------------|\n`;
      const teamData = data['teams']?.refined || 'Team structure to be defined';
      teamData.split('\n').filter(Boolean).forEach(line => {
        epic += `| ${line} | TBD |\n`;
      });
      epic += '\n';
    } else if (section.isTable && section.dataKeys[0] === 'approvers') {
      // Approvals table
      epic += `| Approver | Role | Status |\n|----------|------|--------|\n`;
      const approverData = data['approvers']?.refined || 'Stakeholders';
      approverData.split('\n').filter(Boolean).forEach(line => {
        epic += `| ${line.trim()} | Stakeholder | Pending |\n`;
      });
      epic += '\n';
    } else if (section.hasDiagram) {
      // Architecture overview - no embedded diagram (Blueprint tab has the visual)
      const content = data[section.dataKeys[0]]?.refined || '_Architecture details to be defined_';
      epic += `${content}\n\n`;
    } else if (section.isReference) {
      // Architecture diagrams - embed mermaid if available, otherwise point to Blueprint tab
      if (blueprintCode && blueprintCode.trim()) {
        epic += '```mermaid\n';
        epic += blueprintCode.trim();
        epic += '\n```\n\n';
        epic += `> *Diagram auto-generated from epic content. Regenerate in Blueprint tab to update.*\n\n`;
      } else {
        epic += `> **Note:** Generate a diagram in the **Blueprint** tab to include it here.\n\n`;
      }
    } else {
      // Standard section
      const content = section.dataKeys
        .map(key => data[key]?.refined)
        .filter(Boolean)
        .join('\n\n') || '_To be defined_';
      epic += `${content}\n\n`;
    }

    // Insert Epic Status after context sections (Objective, Background, Scope, Assumptions)
    // Readers need project context before seeing status metadata
    if (section.num === 4) {
      epic += `## Epic Status\n\n`;
      epic += `| Field | Value |\n|---|---|\n`;
      epic += `| **Status** | Draft |\n`;
      epic += `| **Owner** | _TBD_ |\n`;
      epic += `| **Last Updated** | ${new Date().toLocaleDateString()} |\n\n`;
    }
  }

  // Generate the multilayer summary diagram
  const diagram = generateMultilayerDiagram(data, projectName);

  return { epic, diagram };
}

// Generate architecture diagram from refined data
function generateArchitectureDiagram(data: RefinedData): string {
  const hasDataStores = data['dataStores']?.refined;
  const hasFeatures = data['features']?.refined;

  let diagram = 'graph TD\n';
  diagram += '    User[User/Client] --> API[API Gateway]\n';
  diagram += '    API --> Services[Service Layer]\n';

  if (hasFeatures) {
    diagram += '    Services --> Features[Feature Modules]\n';
  }

  if (hasDataStores) {
    diagram += '    Services --> DB[(Database)]\n';
    diagram += '    Services --> Cache[(Cache)]\n';
  } else {
    diagram += '    Services --> DB[(Data Store)]\n';
  }

  diagram += '    Services --> External[External Services]\n';

  return diagram;
}

// Generate multilayer diagram showing the full flow
function generateMultilayerDiagram(_data: RefinedData, projectName: string): string {
  let diagram = 'graph TD\n';

  // Input Layer
  diagram += '    subgraph Input["Input Layer"]\n';
  diagram += '        I1[Project Info]\n';
  diagram += '        I2[Objective & Scope]\n';
  diagram += '        I3[Architecture]\n';
  diagram += '        I4[Features]\n';
  diagram += '        I5[Team & Env]\n';
  diagram += '        I6[Delivery]\n';
  diagram += '    end\n\n';

  // Refinement Layer
  diagram += '    subgraph Refine["AI Refinement Layer"]\n';
  diagram += '        R1[Refined Background]\n';
  diagram += '        R2[Refined Scope]\n';
  diagram += '        R3[Refined Architecture]\n';
  diagram += '        R4[Refined Features]\n';
  diagram += '        R5[Refined Team]\n';
  diagram += '        R6[Refined Delivery]\n';
  diagram += '    end\n\n';

  // Connections
  diagram += '    I1 --> R1\n';
  diagram += '    I2 --> R2\n';
  diagram += '    I3 --> R3\n';
  diagram += '    I4 --> R4\n';
  diagram += '    I5 --> R5\n';
  diagram += '    I6 --> R6\n\n';

  // Epic Document
  diagram += `    subgraph Epic["${projectName} Epic"]\n`;
  diagram += '        E[17-Section Document]\n';
  diagram += '    end\n\n';

  diagram += '    R1 --> E\n';
  diagram += '    R2 --> E\n';
  diagram += '    R3 --> E\n';
  diagram += '    R4 --> E\n';
  diagram += '    R5 --> E\n';
  diagram += '    R6 --> E\n';

  return diagram;
}

// Main skill runner
export async function runSkill(
  skill: 'refine' | 'generate',
  params: {
    stageId?: string;
    fieldName?: string;
    input?: string;
    context?: Record<string, string>;
    data?: RefinedData;
    projectName?: string;
    blueprintCode?: string;
  }
): Promise<RefineResult | GenerateResult> {
  if (skill === 'refine') {
    return refineInput(
      params.stageId!,
      params.fieldName!,
      params.input!,
      params.context || {}
    );
  } else {
    return generateEpic(params.data!, params.projectName!, params.blueprintCode);
  }
}

// ===========================================
// INTELLIGENT PLANTUML GENERATION
// ===========================================

// ===========================================
// DIAGRAM STYLING - Color Palette & Theme
// ===========================================

// Colorful palette for diagrams (Okabe-Ito colorblind-safe)
// Primary=#0072B2, Secondary=#56B4E9, Accent=#009E73, Data=#E69F00, External=#CC79A7

/**
 * Apply colorful theme to a Mermaid diagram
 * Uses Okabe-Ito colorblind-safe palette for clear visual distinction
 */
function applyDiagramTheme(diagramCode: string): string {
  // Don't double-apply theme
  if (diagramCode.includes('%%{init:')) {
    return diagramCode;
  }

  const themeInit = `%%{init: {'theme': 'base', 'themeVariables': {
  'primaryColor': '#0072B2',
  'primaryTextColor': '#ffffff',
  'primaryBorderColor': '#005A8C',
  'secondaryColor': '#56B4E9',
  'secondaryTextColor': '#ffffff',
  'secondaryBorderColor': '#0072B2',
  'tertiaryColor': '#E69F00',
  'tertiaryTextColor': '#000000',
  'tertiaryBorderColor': '#CC8800',
  'lineColor': '#64748B',
  'textColor': '#1F2937',
  'mainBkg': '#FAFAFA',
  'nodeBorder': '#E5E7EB',
  'clusterBkg': '#F0F9FF',
  'clusterBorder': '#BAE6FD',
  'edgeLabelBackground': 'transparent',
  'fontSize': '14px'
}}}%%
`;

  return themeInit + diagramCode;
}

// Diagram types that can be generated based on context
type DiagramType =
  | 'c4-container'      // Best for system architecture overview
  | 'component'         // Best for internal component structure
  | 'sequence'          // Best for user flows and interactions
  | 'deployment';       // Best for infrastructure and environments

interface DiagramContext {
  hasArchitecture: boolean;
  hasFeatures: boolean;
  hasUserStories: boolean;
  hasDataStores: boolean;
  hasEnvironments: boolean;
  hasDeploymentDetails: boolean;
  hasWorkflows: boolean;
  featureCount: number;
  componentCount: number;
  integrationCount: number;
}

// Analyze epic data to understand what type of diagram would be most valuable
function analyzeEpicContext(data: RefinedData): DiagramContext {
  const archText = (data['architectureOverview']?.original || '').toLowerCase();
  const featuresText = data['features']?.original || '';
  const storiesText = data['userStories']?.original || '';
  const dataText = data['dataStores']?.original || '';
  const envsText = data['environments']?.original || '';

  // Count meaningful items
  const featureLines = featuresText.split('\n').filter(l => l.trim().length > 3);
  const componentMatches = archText.match(/\b(service|component|module|layer|api|database|cache|queue|gateway)\b/gi) || [];
  const integrationMatches = archText.match(/\b(integration|external|third-party|api|webhook|oauth|sso)\b/gi) || [];

  return {
    hasArchitecture: archText.length > 50,
    hasFeatures: featureLines.length > 0,
    hasUserStories: storiesText.length > 50,
    hasDataStores: dataText.length > 30,
    hasEnvironments: envsText.length > 30,
    hasDeploymentDetails: envsText.toLowerCase().includes('deploy') || envsText.toLowerCase().includes('kubernetes') || envsText.toLowerCase().includes('docker'),
    hasWorkflows: storiesText.toLowerCase().includes('when') || storiesText.toLowerCase().includes('then') || archText.includes('flow'),
    featureCount: featureLines.length,
    componentCount: new Set(componentMatches.map(m => m.toLowerCase())).size,
    integrationCount: new Set(integrationMatches.map(m => m.toLowerCase())).size,
  };
}

// Intelligently select the best diagram type based on context
function selectBestDiagramType(context: DiagramContext): DiagramType {
  // Priority scoring for diagram types that support horizontal layout
  const scores: Record<string, number> = {
    'c4-container': 2, // Default baseline score
    'component': 0,
    'sequence': 0,
    'deployment': 0,
  };

  // Score based on available data
  if (context.hasArchitecture && context.componentCount >= 3) {
    scores['c4-container'] += 5;
    scores['component'] += 4;
  }

  if (context.hasUserStories && context.hasWorkflows) {
    scores['sequence'] += 5;
  }

  if (context.hasDeploymentDetails && context.hasEnvironments) {
    scores['deployment'] += 5;
  }

  if (context.hasDataStores && context.componentCount >= 2) {
    scores['component'] += 2;
  }

  if (context.integrationCount >= 2) {
    scores['c4-container'] += 3;
    scores['sequence'] += 2;
  }

  // C4 is a good default for architecture-focused epics
  if (context.hasArchitecture) {
    scores['c4-container'] += 2;
  }

  // Find highest scoring type (only from our supported horizontal types)
  let bestType: DiagramType = 'c4-container';
  let highestScore = 0;

  for (const [type, score] of Object.entries(scores)) {
    if (score > highestScore) {
      highestScore = score;
      bestType = type as DiagramType;
    }
  }

  return bestType;
}

// Extract meaningful components from architecture text
function extractComponents(archText: string): string[] {
  const components: string[] = [];
  const lines = archText.split('\n');

  for (const line of lines) {
    // Look for bold items like **Component Name**
    const boldMatches = line.match(/\*\*([^*]+)\*\*/g);
    if (boldMatches) {
      boldMatches.forEach(m => {
        const cleaned = m.replace(/\*\*/g, '').trim();
        if (cleaned.length > 2 && cleaned.length < 40) {
          components.push(cleaned);
        }
      });
    }

    // Look for list items
    const listMatch = line.match(/^[-•*]\s*(.+?)(?:\s*[-:]|$)/);
    if (listMatch && listMatch[1].length > 2 && listMatch[1].length < 40) {
      components.push(listMatch[1].trim());
    }
  }

  return [...new Set(components)].slice(0, 8);
}

// Extract user stories for sequence diagrams
function extractUserFlows(storiesText: string): { actor: string; action: string; target: string }[] {
  const flows: { actor: string; action: string; target: string }[] = [];
  const lines = storiesText.split('\n');

  for (const line of lines) {
    // Parse "As a [role], I want [action] so that [benefit]"
    const storyMatch = line.match(/as\s+(?:a|an)\s+(\w+).*?(?:I want|I need|I can)\s+(.+?)(?:\s+so that|\s+in order|$)/i);
    if (storyMatch) {
      flows.push({
        actor: storyMatch[1].charAt(0).toUpperCase() + storyMatch[1].slice(1),
        action: storyMatch[2].trim().slice(0, 50),
        target: 'System',
      });
    }
  }

  return flows.slice(0, 6);
}

// Generate C4-style Container diagram using Mermaid - great for system overview
function generateC4ContainerDiagram(data: RefinedData, projectName: string): string {
  const arch = data['architectureOverview']?.original || '';
  const dataStores = data['dataStores']?.original || '';

  const components = extractComponents(arch);
  const hasDB = dataStores.toLowerCase().includes('database') || dataStores.toLowerCase().includes('postgres') || dataStores.toLowerCase().includes('mysql') || dataStores.toLowerCase().includes('warehouse');
  const hasCache = dataStores.toLowerCase().includes('cache') || dataStores.toLowerCase().includes('redis') || dataStores.toLowerCase().includes('memcache');
  const hasQueue = dataStores.toLowerCase().includes('queue') || dataStores.toLowerCase().includes('kafka') || dataStores.toLowerCase().includes('rabbit') || dataStores.toLowerCase().includes('streaming');
  const hasNoSQL = dataStores.toLowerCase().includes('nosql') || dataStores.toLowerCase().includes('mongodb') || dataStores.toLowerCase().includes('cassandra');
  const hasFrontend = arch.toLowerCase().includes('frontend') || arch.toLowerCase().includes('react') || arch.toLowerCase().includes('ui') || arch.toLowerCase().includes('user interface');
  const hasAPI = arch.toLowerCase().includes('api') || arch.toLowerCase().includes('gateway') || arch.toLowerCase().includes('rest');
  const hasAnalytics = arch.toLowerCase().includes('analytics') || arch.toLowerCase().includes('machine learning') || arch.toLowerCase().includes('ml');
  const hasExternal = arch.toLowerCase().includes('external') || arch.toLowerCase().includes('third-party') || arch.toLowerCase().includes('integration');

  // Sanitize project name for Mermaid
  const safeProjectName = projectName.replace(/[^a-zA-Z0-9\s]/g, '').trim() || 'System';

  let mermaid = `flowchart LR\n`;

  // User
  mermaid += `    U((User))\n`;

  // Frontend
  if (hasFrontend) {
    mermaid += `    subgraph Frontend["Frontend"]\n`;
    mermaid += `        WA[Web App]\n`;
    mermaid += `    end\n`;
  }

  // Backend
  mermaid += `    subgraph Backend["Backend Services"]\n`;
  if (hasAPI) {
    mermaid += `        API[API Gateway]\n`;
  }
  if (components.length > 0) {
    components.slice(0, 3).forEach((comp, i) => {
      const safeComp = comp.replace(/[^a-zA-Z0-9\s]/g, '').trim().slice(0, 15) || `Service${i}`;
      mermaid += `        SVC${i}[${safeComp}]\n`;
    });
  } else {
    mermaid += `        SVC0[Services]\n`;
  }
  if (hasAnalytics) {
    mermaid += `        ANA[Analytics]\n`;
  }
  mermaid += `    end\n`;

  // Data layer - always include at least a database
  mermaid += `    subgraph Data["Data Layer"]\n`;
  if (hasDB || (!hasCache && !hasQueue && !hasNoSQL)) {
    mermaid += `        DB[(Database)]\n`;
  }
  if (hasCache) {
    mermaid += `        CACHE[(Cache)]\n`;
  }
  if (hasQueue) {
    mermaid += `        QUEUE[(Queue)]\n`;
  }
  if (hasNoSQL) {
    mermaid += `        NOSQL[(NoSQL)]\n`;
  }
  mermaid += `    end\n`;

  if (hasExternal) {
    mermaid += `    EXT{{External API}}\n`;
  }

  // Connections
  if (hasFrontend) {
    mermaid += `    U --> WA\n`;
    if (hasAPI) {
      mermaid += `    WA --> API\n`;
    } else {
      mermaid += `    WA --> SVC0\n`;
    }
  } else if (hasAPI) {
    mermaid += `    U --> API\n`;
  } else {
    mermaid += `    U --> SVC0\n`;
  }

  if (hasAPI) {
    mermaid += `    API --> SVC0\n`;
    if (hasAnalytics) {
      mermaid += `    API --> ANA\n`;
    }
  }

  // Service connections to data - always connect to DB since we always have it
  mermaid += `    SVC0 --> DB\n`;
  if (hasAnalytics) {
    mermaid += `    ANA --> DB\n`;
  }
  if (hasCache) {
    mermaid += `    SVC0 --> CACHE\n`;
  }
  if (hasQueue) {
    mermaid += `    SVC0 --> QUEUE\n`;
  }
  if (hasNoSQL) {
    mermaid += `    SVC0 --> NOSQL\n`;
  }
  if (hasExternal) {
    mermaid += `    SVC0 --> EXT\n`;
  }

  // Colorful styles for architecture diagrams
  mermaid += `\n    %% Colorful Styling\n`;
  if (hasFrontend) {
    mermaid += `    style WA fill:#56B4E9,stroke:#0072B2,color:#fff\n`;
  }
  if (hasAPI) {
    mermaid += `    style API fill:#0072B2,stroke:#005A8C,color:#fff\n`;
  }
  // Style service nodes
  if (components.length > 0) {
    components.slice(0, 3).forEach((_, i) => {
      mermaid += `    style SVC${i} fill:#009E73,stroke:#007A5E,color:#fff\n`;
    });
  } else {
    mermaid += `    style SVC0 fill:#009E73,stroke:#007A5E,color:#fff\n`;
  }
  if (hasAnalytics) {
    mermaid += `    style ANA fill:#CC79A7,stroke:#AA5585,color:#fff\n`;
  }
  // Data layer styling - warm colors
  if (hasDB || (!hasCache && !hasQueue && !hasNoSQL)) {
    mermaid += `    style DB fill:#E69F00,stroke:#CC8800,color:#fff\n`;
  }
  if (hasCache) {
    mermaid += `    style CACHE fill:#E69F00,stroke:#CC8800,color:#fff\n`;
  }
  if (hasQueue) {
    mermaid += `    style QUEUE fill:#009E73,stroke:#007A5E,color:#fff\n`;
  }
  if (hasNoSQL) {
    mermaid += `    style NOSQL fill:#E69F00,stroke:#CC8800,color:#fff\n`;
  }
  if (hasExternal) {
    mermaid += `    style EXT fill:#CC79A7,stroke:#AA5585,color:#fff\n`;
  }

  return mermaid;
}

// Generate Sequence diagram using Mermaid - great for user flows
function generateSequenceDiagram(data: RefinedData, projectName: string): string {
  const stories = data['userStories']?.original || '';
  const flows = extractUserFlows(stories);

  let mermaid = `sequenceDiagram
    autonumber
    participant U as User
    participant UI as Web App
    participant API as API
    participant SVC as Service
    participant DB as Database
`;

  if (flows.length > 0) {
    flows.forEach((flow, index) => {
      // Sanitize the action text
      const safeAction = flow.action.replace(/[^a-zA-Z0-9\s]/g, '').trim().slice(0, 30);
      const shortAction = safeAction.slice(0, 20);

      if (index > 0) mermaid += `\n`;
      mermaid += `    Note over U,DB: ${safeAction}\n`;
      mermaid += `    U->>+UI: ${shortAction}\n`;
      mermaid += `    UI->>+API: Request\n`;
      mermaid += `    API->>+SVC: Process\n`;
      mermaid += `    SVC->>+DB: Query\n`;
      mermaid += `    DB-->>-SVC: Result\n`;
      mermaid += `    SVC-->>-API: Response\n`;
      mermaid += `    API-->>-UI: Data\n`;
      mermaid += `    UI-->>-U: Display\n`;
    });
  } else {
    // Generic flow based on common patterns
    mermaid += `    Note over U,DB: Main Application Flow\n`;
    mermaid += `    U->>+UI: Access Application\n`;
    mermaid += `    UI->>+API: Request Data\n`;
    mermaid += `    API->>+SVC: Process Request\n`;
    mermaid += `    SVC->>+DB: Query Data\n`;
    mermaid += `    DB-->>-SVC: Return Results\n`;
    mermaid += `    SVC-->>-API: Send Response\n`;
    mermaid += `    API-->>-UI: Return Data\n`;
    mermaid += `    UI-->>-U: Display Results\n`;
  }

  return mermaid;
}

// Generate Deployment diagram using Mermaid - great for infrastructure
function generateDeploymentDiagram(data: RefinedData, projectName: string): string {
  const envs = data['environments']?.original || '';

  const hasK8s = envs.toLowerCase().includes('kubernetes') || envs.toLowerCase().includes('k8s');
  const hasDocker = envs.toLowerCase().includes('docker') || envs.toLowerCase().includes('container');

  let mermaid = `flowchart LR
    subgraph CICD["CI/CD Pipeline"]
        BUILD[Build] --> TEST[Test]
        TEST --> DEPLOY[Deploy]
    end

    subgraph Environments["Environments"]
        DEV[Dev]
        STAGE[Staging]
        PROD[Production]
    end

`;

  if (hasK8s) {
    mermaid += `    subgraph Infra["Infrastructure"]
        K8S[Kubernetes]
        DB[(Database)]
    end

`;
  } else if (hasDocker) {
    mermaid += `    subgraph Infra["Infrastructure"]
        DOCKER[Docker]
        DB[(Database)]
    end

`;
  } else {
    mermaid += `    subgraph Infra["Infrastructure"]
        SERVER[Server]
        DB[(Database)]
    end

`;
  }

  // Connections
  mermaid += `    DEPLOY --> DEV\n`;
  mermaid += `    DEPLOY --> STAGE\n`;
  mermaid += `    DEPLOY --> PROD\n`;

  if (hasK8s) {
    mermaid += `    PROD --> K8S\n`;
    mermaid += `    K8S --> DB\n`;
  } else if (hasDocker) {
    mermaid += `    PROD --> DOCKER\n`;
    mermaid += `    DOCKER --> DB\n`;
  } else {
    mermaid += `    PROD --> SERVER\n`;
    mermaid += `    SERVER --> DB\n`;
  }

  // Colorful styles for deployment diagrams
  mermaid += `\n    %% Colorful Styling\n`;
  mermaid += `    style BUILD fill:#64748B,stroke:#475569,color:#fff\n`;
  mermaid += `    style TEST fill:#64748B,stroke:#475569,color:#fff\n`;
  mermaid += `    style DEPLOY fill:#64748B,stroke:#475569,color:#fff\n`;
  mermaid += `    style DEV fill:#56B4E9,stroke:#0072B2,color:#fff\n`;
  mermaid += `    style STAGE fill:#E69F00,stroke:#CC8800,color:#fff\n`;
  mermaid += `    style PROD fill:#D55E00,stroke:#B34D00,color:#fff\n`;
  if (hasK8s) {
    mermaid += `    style K8S fill:#326CE5,stroke:#1A4DB3,color:#fff\n`;
  } else if (hasDocker) {
    mermaid += `    style DOCKER fill:#2496ED,stroke:#1A75C7,color:#fff\n`;
  } else {
    mermaid += `    style SERVER fill:#64748B,stroke:#475569,color:#fff\n`;
  }
  mermaid += `    style DB fill:#E69F00,stroke:#CC8800,color:#fff\n`;

  return mermaid;
}

// Generate Component diagram using Mermaid - for internal structure
function generateComponentDiagram(data: RefinedData, projectName: string): string {
  const arch = data['architectureOverview']?.original || '';
  const features = data['features']?.original || '';
  const components = extractComponents(arch);
  const featureList = features.split('\n').filter(l => l.trim().length > 3).slice(0, 4);

  let mermaid = `flowchart LR
    subgraph Presentation["Presentation Layer"]
        UI[User Interface]
    end

    subgraph API["API Layer"]
        GW[API Gateway]
    end

    subgraph Services["Service Layer"]
`;

  // Add components from architecture or features
  const compIds: string[] = [];
  if (components.length > 0) {
    components.slice(0, 3).forEach((comp, i) => {
      const safeComp = comp.replace(/[^a-zA-Z0-9\s]/g, '').trim().slice(0, 15) || `Service${i}`;
      compIds.push(`COMP${i}`);
      mermaid += `        COMP${i}[${safeComp}]\n`;
    });
  } else if (featureList.length > 0) {
    featureList.slice(0, 3).forEach((feat, i) => {
      const cleanFeat = feat.replace(/^[\d.\-*]+\s*/, '').replace(/[^a-zA-Z0-9\s]/g, '').trim().slice(0, 15) || `Feature${i}`;
      compIds.push(`COMP${i}`);
      mermaid += `        COMP${i}[${cleanFeat}]\n`;
    });
  } else {
    compIds.push('COMP0');
    mermaid += `        COMP0[Service]\n`;
  }

  mermaid += `    end

    subgraph Data["Data Layer"]
        DB[(Database)]
    end

`;

  // Connections
  mermaid += `    UI --> GW\n`;

  if (compIds.length > 0) {
    mermaid += `    GW --> ${compIds[0]}\n`;
    // Chain components
    for (let i = 0; i < compIds.length - 1; i++) {
      mermaid += `    ${compIds[i]} --> ${compIds[i + 1]}\n`;
    }
    mermaid += `    ${compIds[compIds.length - 1]} --> DB\n`;
  } else {
    mermaid += `    GW --> DB\n`;
  }

  // Add color styles for eye-catching visuals
  mermaid += `\n    %% Styling\n`;
  mermaid += `    style UI fill:#0EA5E9,stroke:#0284C7,color:#fff\n`;
  mermaid += `    style GW fill:#4F46E5,stroke:#3730A3,color:#fff\n`;
  // Style component nodes
  compIds.forEach(id => {
    mermaid += `    style ${id} fill:#10B981,stroke:#059669,color:#fff\n`;
  });
  mermaid += `    style DB fill:#F59E0B,stroke:#D97706,color:#fff\n`;

  return mermaid;
}

// Main intelligent blueprint generator
export async function generateIntelligentBlueprint(data: RefinedData, projectName: string): Promise<{ diagram: string; type: DiagramType; reasoning: string }> {
  // Add small delay so UI shows loading state
  await mockDelay();

  // AI-only generation with retry loop for fixing errors
  // NO rule-based fallback - AI fixes its own errors
  if (!currentConfig) {
    throw new Error('AI configuration not available. Please configure Azure OpenAI settings.');
  }

  let lastError = '';
  let diagram = '';
  let reasoning = 'AI-generated architecture diagram';
  let diagramType: DiagramType = 'c4-container';

  // Helper function to wait with exponential backoff
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Check if error is rate-limit related
  const isRateLimitError = (error: string): boolean => {
    return error.includes('429') ||
           error.toLowerCase().includes('rate limit') ||
           error.toLowerCase().includes('too many requests') ||
           error.toLowerCase().includes('quota');
  };

  // Try AI generation with retry loop (up to 5 attempts) with exponential backoff
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      if (attempt === 1 || !diagram) {
        // First attempt or no diagram yet: fresh AI generation
        console.log(`[Blueprint] Attempt ${attempt}/5: Generating with AI...`);
        const result = await generateAIPoweredBlueprint(data, projectName);
        diagram = result.diagram;
        reasoning = result.reasoning;
        diagramType = result.type;
      } else {
        // Subsequent attempts: AI fixes previous error
        console.log(`[Blueprint] Attempt ${attempt}/5: Using AI to fix error: ${lastError}`);
        diagram = await fixMermaidDiagram(diagram, lastError);
      }

      // Validate the diagram - throws if invalid
      const validated = validateMermaidDiagram(diagram);

      // Success - apply theme and return
      console.log(`[Blueprint] Success on attempt ${attempt}`);
      return {
        diagram: applyDiagramTheme(validated),
        type: diagramType,
        reasoning
      };

    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.error(`[Blueprint] Attempt ${attempt}/5 failed:`, lastError);

      // If we have more attempts, wait before retrying
      if (attempt < 5) {
        // Use longer delay for rate limit errors
        const baseDelay = isRateLimitError(lastError) ? 5000 : 1000;
        const delay = baseDelay * Math.pow(1.5, attempt - 1); // Exponential backoff
        console.log(`[Blueprint] Waiting ${Math.round(delay)}ms before retry...`);
        await sleep(delay);
      }
    }
  }

  // All AI attempts failed - throw error to user (NO silent rule-based fallback)
  throw new Error(`Blueprint generation failed after 5 AI attempts. Last error: ${lastError}`);
}


// AI-powered blueprint generation using Mermaid
async function generateAIPoweredBlueprint(
  data: RefinedData,
  projectName: string
): Promise<{ diagram: string; type: DiagramType; reasoning: string }> {
  const systemPrompt = `You are an expert software architect and data visualization specialist who creates stunning, comprehensive Mermaid.js diagrams.

## YOUR TASK
Analyze the provided epic/project information and generate a beautiful, intelligent, and architecturally accurate Mermaid diagram that fully represents the system. Select the MOST APPROPRIATE diagram type based on content analysis.

---

## PHASE 1: INTELLIGENT DIAGRAM TYPE SELECTION

### Step 1.1 — Content-Driven Diagram Selection

CRITICAL: Analyze the epic content and select the diagram type that best represents the information structure. Do NOT default to flowchart — choose based on what the content actually describes.

| Content Pattern | Keywords/Signals | Diagram Type | Mermaid Syntax |
|-----------------|------------------|--------------|----------------|
| System architecture, microservices, APIs, components | service, API, gateway, backend, frontend, microservice | Architecture | flowchart LR |
| Time-ordered interactions, API calls, request/response | request, response, call, authenticate, flow between actors | Sequence | sequenceDiagram |
| Object structure, classes, inheritance, methods | class, interface, inherit, extend, method, property | Class Diagram | classDiagram |
| Lifecycle, status changes, transitions, states | state, status, transition, pending, approved, workflow | State Diagram | stateDiagram-v2 |
| Project timeline, tasks, milestones, dependencies | task, milestone, deadline, sprint, phase, schedule | Gantt Chart | gantt |
| Git workflow, branches, merges, releases | branch, merge, commit, release, version, git | Git Graph | gitGraph |
| Hierarchical concepts, brainstorming, categories | concept, idea, category, topic, overview, breakdown | Block Diagram | block-beta |
| Chronological events, history, milestones | timeline, history, event, year, milestone, era | Timeline | timeline |
| Priority matrix, comparison on two axes | priority, impact, effort, urgency, quadrant, matrix | Quadrant Chart | quadrantChart |
| Numeric flow quantities with specific amounts, budget allocation, conversion funnels with percentages | conversion rate, budget, allocation, revenue, cost, percentage, funnel metrics | Sankey Diagram | sankey-beta |
| Multi-dimensional comparison, skills, ratings | compare, rating, score, skill, dimension, radar | Radar Chart | radar-beta |
| Proportional distribution, percentages, shares | percentage, distribution, share, breakdown, pie | Pie Chart | pie |
| Data trends, metrics over time, statistics | trend, metric, chart, data, x-axis, y-axis | XY Chart | xychart-beta |
| Infrastructure, cloud, deployment, containers | deploy, kubernetes, docker, cloud, server, container | Block Diagram | block-beta |
| Task board, kanban, work items, columns | kanban, board, todo, doing, done, backlog | Kanban | kanban |
| Network packets, protocol, bit fields | packet, protocol, bit, field, header, byte | Packet Diagram | packet-beta |

### Step 1.2 — Decision Heuristics

Apply these rules in order:
1. If content describes TIME-ORDERED interactions between actors → sequenceDiagram
2. If content describes OBJECT/CLASS structure with methods → classDiagram
3. If content describes STATE TRANSITIONS or lifecycle → stateDiagram-v2
4. If content describes PROJECT SCHEDULE with dates → gantt
5. If content describes GIT WORKFLOW → gitGraph
6. If content describes SYSTEM COMPONENTS, services, APIs, data pipelines, or their connections → flowchart LR (architecture). This includes data pipelines, microservices, integration architectures, and any project with named systems that interact.
7. If content describes HIERARCHICAL CONCEPTS with no clear data flow → block-beta (structured block diagram)
8. If content describes NUMERIC FLOW QUANTITIES with specific amounts/percentages between sources → sankey-beta. NOTE: Do NOT use sankey for data pipelines — use flowchart LR instead. Sankey is ONLY for numeric quantity flows (budget allocation, conversion funnels with percentages).
9. If content describes PRIORITY/COMPARISON on two axes → quadrantChart
10. When genuinely uncertain → flowchart LR (most versatile)

### Step 1.3 — Assess Complexity Budget

| Epic Scope | Feature Count | Target Nodes | Max Connections |
|------------|---------------|--------------|-----------------|
| Simple | 1–3 features | 8–12 nodes | 15 connections |
| Medium | 4–7 features | 12–18 nodes | 25 connections |
| Complex | 8+ features | 18–25 nodes | 35 connections |

**HARD LIMIT:** Never exceed 25 nodes. For larger systems, focus on the most critical components.

---

## PHASE 2: SEMANTIC COLOR SYSTEM

### Universal Color Palette (Okabe-Ito + Industry Standards)

This palette is colorblind-safe and uses industry-standard semantic associations:

| Semantic Role | Color | Hex Code | Usage |
|---------------|-------|----------|-------|
| Primary/Compute | Blue | #0072B2 | Core services, main components, compute |
| Data/Storage | Orange | #E69F00 | Databases, caches, file storage |
| Security/Auth | Vermillion | #D55E00 | Authentication, authorization, security |
| Async/Events | Teal | #009E73 | Message queues, events, async flows |
| External/3rd Party | Purple | #CC79A7 | External APIs, third-party services |
| Infrastructure | Slate | #64748B | Load balancers, gateways, infra |
| Success/Healthy | Green | #22C55E | Success states, healthy indicators |
| Warning/Pending | Amber | #F59E0B | Warnings, pending states |
| Error/Critical | Red | #EF4444 | Errors, critical alerts |
| Client/UI | Sky Blue | #56B4E9 | User interfaces, client apps |

### Domain-Specific Palette Overrides

| Domain Keywords | Primary | Secondary | Accent | Data | External |
|-----------------|---------|-----------|--------|------|----------|
| bank, finance, payment, transaction | #0369A1 | #0EA5E9 | #059669 | #E69F00 | #CC79A7 |
| health, medical, patient, clinical | #0891B2 | #14B8A6 | #6366F1 | #E69F00 | #CC79A7 |
| shop, cart, order, ecommerce, retail | #7C3AED | #8B5CF6 | #F97316 | #E69F00 | #CC79A7 |
| deploy, kubernetes, docker, cloud, devops | #0072B2 | #56B4E9 | #009E73 | #E69F00 | #CC79A7 |
| learn, course, student, education | #059669 | #10B981 | #0072B2 | #E69F00 | #CC79A7 |
| video, music, game, media, stream | #EC4899 | #F472B6 | #A855F7 | #E69F00 | #CC79A7 |
| AI, machine learning, model, neural | #6366F1 | #8B5CF6 | #EC4899 | #E69F00 | #CC79A7 |
| security, auth, encrypt, identity | #475569 | #64748B | #D55E00 | #E69F00 | #CC79A7 |
| DEFAULT | #0072B2 | #56B4E9 | #009E73 | #E69F00 | #CC79A7 |

### Accessibility Requirements (WCAG 2.1)

| Requirement | Standard | Implementation |
|-------------|----------|----------------|
| Text contrast | 4.5:1 minimum | Use white (#fff) text on dark fills |
| Graphical contrast | 3:1 minimum | Ensure stroke is darker than fill |
| Colorblind safety | 8% of men affected | Use Okabe-Ito palette (already implemented) |
| Shape redundancy | Don't rely on color alone | Different shapes for different component types |

**CRITICAL**: Never differentiate components by color alone. Always use shape + color combination.

### Alternative Industry Palettes (Optional)

**IBM Carbon Design System:**
| Token | Hex | Usage |
|-------|-----|-------|
| Blue 60 | #0F62FE | Interactive elements |
| Cyan 50 | #1192E8 | Links, highlights |
| Teal 50 | #009D9A | Success states |
| Magenta 50 | #EE5396 | Attention |
| Purple 60 | #8A3FFC | Creative elements |

**Material Design 3:**
| Color | Hex | Usage |
|-------|-----|-------|
| Primary | #6750A4 | Key components |
| Secondary | #625B71 | Less prominent |
| Tertiary | #7D5260 | Contrast accents |
| Error | #B3261E | Error states |

The UBS color mapping ensures:
- Consistent brand identity across all diagrams
- Professional, enterprise-appropriate appearance
- Clear visual hierarchy using gray scale + red accent

---

## PHASE 3: CRITICAL MERMAID SYNTAX RULES

VIOLATIONS WILL CAUSE PARSE ERRORS — FOLLOW EXACTLY:

### Rule 1: Node ID Format (MOST IMPORTANT)
Every node MUST have format: ID[Label] or ID[(Label)] etc. Never use bare text after arrows.

WRONG: API Gateway --> User Service --> Database
CORRECT: AG[API Gateway] --> US[User Service]
         US --> DB[(Database)]

### Rule 2: Node IDs — Alphanumeric Only
Use short 2-5 character alphanumeric IDs. No hyphens, underscores, spaces, or special characters in IDs.

WRONG: user-service[User Service]
CORRECT: US[User Service]

### Rule 3: Labels — No Special Characters
Avoid quotes, apostrophes, parentheses, and special characters inside labels.

WRONG: A[User's Data]
WRONG: B[Auth (OAuth2)]
CORRECT: A[User Data]
CORRECT: B[Auth via OAuth2]

### Rule 4: Subgraph Naming
Subgraph names with spaces MUST use quotes.

WRONG: subgraph Data Layer
CORRECT: subgraph DL["Data Layer"]

### Rule 5: One Connection Per Line
Never chain multiple arrows.

WRONG: A --> B --> C --> D
CORRECT:
    A --> B
    B --> C
    C --> D

### Rule 6: Reserved Word "end"
Never use lowercase "end" as a node label — it breaks parsing. Use "End" or "Finish" instead.

### Rule 7: Strict Command Order
1. %%{init:...}%% theme block (FIRST, for flowcharts only)
2. Diagram type declaration
3. Subgraphs and connections
4. linkStyle commands (all together)
5. style commands (LAST)

---

## PHASE 4: NODE SHAPES BY SEMANTIC ROLE

| Component Type | Shape | Syntax | Example |
|----------------|-------|--------|---------|
| Services/APIs | Rectangle | ID[Label] | US[User Service] |
| Processes/Actions | Rounded | ID(Label) | VAL(Validation) |
| Start/End Points | Stadium | ID([Label]) | START([Begin]) |
| Events/Triggers | Circle | ID((Label)) | EVT((Event)) |
| Databases/Storage | Cylinder | ID[(Label)] | DB[(PostgreSQL)] |
| External APIs | Hexagon | ID{{Label}} | STRIPE{{Stripe}} |
| Decisions | Diamond | ID{Label} | CHK{Valid} |
| Input/Output | Parallelogram | ID[/Label/] | IN[/Request/] |
| Subroutines | Framed | ID[[Label]] | SUB[[Process]] |

---

## PHASE 5: ARROW SEMANTICS BY FLOW TYPE

### Line Style as Primary Semantic (Most Important)
- **Solid line (-->)**: Synchronous, blocking calls
- **Dashed line (-.->)**: Asynchronous, non-blocking, events
- **Thick line (==>)**: Critical path, emphasis

### Arrow Colors by Flow Type

| Flow Type | Color | Hex | LinkStyle |
|-----------|-------|-----|-----------|
| User/Client Request | Blue | #0072B2 | stroke:#0072B2,stroke-width:2.5px |
| Service-to-Service | Indigo | #6366F1 | stroke:#6366F1,stroke-width:2px |
| Database Read/Write | Orange | #E69F00 | stroke:#E69F00,stroke-width:2px |
| Async/Event/Queue | Teal | #009E73 | stroke:#009E73,stroke-width:2px,stroke-dasharray:5 |
| External API Call | Purple | #CC79A7 | stroke:#CC79A7,stroke-width:2px |
| Auth/Security Flow | Vermillion | #D55E00 | stroke:#D55E00,stroke-width:2px |
| Response/Return | Gray | #94A3B8 | stroke:#94A3B8,stroke-width:1.5px,stroke-dasharray:3 |
| File/Blob Storage | Amber | #F59E0B | stroke:#F59E0B,stroke-width:2px |
| Monitoring/Logs | Slate | #64748B | stroke:#64748B,stroke-width:1px,stroke-dasharray:3 |

### Link Index Counting
Link styles are applied by 0-based INDEX in order of arrow appearance:

    WEB --> LB      %% Link index 0
    LB --> AUTH     %% Link index 1
    AUTH --> API    %% Link index 2

    linkStyle 0 stroke:#0072B2,stroke-width:2.5px
    linkStyle 1 stroke:#64748B,stroke-width:2px
    linkStyle 2 stroke:#D55E00,stroke-width:2px

### Arrow Labels for Data Flow Description

Use |text| syntax to add descriptive labels to arrows:

\`\`\`
    WEB -->|HTTP Request| LB
    LB -->|Forward| AG
    AG -->|JWT Token| AUTH
    AUTH -.->|Validate| USER
    USER -->|Query| DB
    DB -->|User Record| USER
\`\`\`

**Label Conventions:**
- Protocol: HTTP, gRPC, WebSocket, AMQP, REST
- Action: Query, Insert, Update, Delete, Publish, Subscribe
- Data: Token, Payload, Event, Message, Response, Request

---

## PHASE 6: DIAGRAM-SPECIFIC SYNTAX

### Flowchart (Architecture)
\`\`\`
%%{init: {'theme': 'base', 'themeVariables': {...}}}%%
flowchart LR
    subgraph CL["Clients"]
        WEB[Web App]
    end
    WEB --> API[API Service]
    API --> DB[(Database)]

    linkStyle 0 stroke:#0072B2,stroke-width:2px
    style WEB fill:#56B4E9,stroke:#0072B2,color:#fff
\`\`\`

### Sequence Diagram
\`\`\`
sequenceDiagram
    autonumber
    participant U as User
    participant API as API Gateway
    participant DB as Database
    
    U->>API: POST /login
    activate API
    API->>DB: Query user
    DB-->>API: User data
    API-->>U: JWT token
    deactivate API
\`\`\`

### State Diagram
\`\`\`
stateDiagram-v2
    [*] --> Draft
    Draft --> Pending: Submit
    Pending --> Approved: Approve
    Pending --> Rejected: Reject
    Approved --> [*]
    Rejected --> Draft: Revise
\`\`\`

### Class Diagram
\`\`\`
classDiagram
    class User {
        +int id
        +String email
        +login()
        +logout()
    }
    class Order {
        +int id
        +Date createdAt
        +calculate()
    }
    User "1" --> "*" Order : places
\`\`\`

### Gantt Chart
\`\`\`
gantt
    title Project Timeline
    dateFormat YYYY-MM-DD
    section Phase 1
        Design    :a1, 2024-01-01, 30d
        Review    :a2, after a1, 7d
    section Phase 2
        Development :b1, after a2, 60d
        Testing     :b2, after b1, 14d
\`\`\`

### Git Graph
\`\`\`
gitGraph
    commit id: "Initial"
    branch develop
    checkout develop
    commit id: "Feature A"
    checkout main
    merge develop
    commit id: "Release v1.0" tag: "v1.0"
\`\`\`

### Block Diagram (for hierarchical concepts)
\`\`\`
block-beta
    columns 3
    block:backend["Backend"]
        api["API Gateway"]
        svc["Services"]
        db[("Database")]
    end
    block:frontend["Frontend"]
        web["Web App"]
        mobile["Mobile App"]
    end
    block:infra["Infrastructure"]
        aws["AWS"]
        k8s["Kubernetes"]
    end
\`\`\`

### Quadrant Chart
\`\`\`
quadrantChart
    title Priority Matrix
    x-axis Low Effort --> High Effort
    y-axis Low Impact --> High Impact
    quadrant-1 Do First
    quadrant-2 Schedule
    quadrant-3 Delegate
    quadrant-4 Eliminate
    Feature A: [0.8, 0.9]
    Feature B: [0.3, 0.7]
    Feature C: [0.6, 0.2]
\`\`\`

### Sankey Diagram
\`\`\`
sankey-beta
    Users,API Gateway,1000
    API Gateway,Auth Service,1000
    Auth Service,Success,850
    Auth Service,Failed,150
\`\`\`

### Timeline
\`\`\`
timeline
    title Product Evolution
    2022 : MVP Launch
         : First 100 users
    2023 : Series A
         : 10K users
    2024 : Enterprise Launch
         : 100K users
\`\`\`

### Pie Chart
\`\`\`
pie showData
    title Traffic Sources
    "Organic" : 45
    "Paid" : 30
    "Referral" : 15
    "Direct" : 10
\`\`\`

### XY Chart
\`\`\`
xychart-beta
    title "Monthly Revenue"
    x-axis [Jan, Feb, Mar, Apr, May]
    y-axis "Revenue (K)" 0 --> 100
    bar [30, 45, 60, 75, 90]
    line [30, 45, 60, 75, 90]
\`\`\`

### Block Diagram
\`\`\`
block-beta
    columns 3
    Frontend:1
    space:1
    Backend:1
    
    block:Frontend
        Web["Web App"]
        Mobile["Mobile"]
    end
    
    block:Backend
        API["API"]
        DB[("DB")]
    end
\`\`\`

### Kanban
\`\`\`
kanban
    Todo
        Task 1
        Task 2
    In Progress
        Task 3
    Done
        Task 4
\`\`\`

### Requirement Diagram
\`\`\`
requirementDiagram
    requirement req1 {
        id: REQ-001
        text: User Authentication
        risk: high
        verifymethod: test
    }

    requirement req2 {
        id: REQ-002
        text: Data Encryption
        risk: medium
        verifymethod: inspection
    }

    element auth_service {
        type: service
    }

    auth_service - satisfies -> req1
    auth_service - satisfies -> req2
\`\`\`

---

## PHASE 7: THEME CONFIGURATION (Flowcharts Only)

Place at VERY START of flowchart diagrams:

\`\`\`
%%{init: {
  'theme': 'base',
  'themeVariables': {
    'primaryColor': '#0072B2',
    'primaryTextColor': '#FFFFFF',
    'primaryBorderColor': '#005A8C',
    'secondaryColor': '#56B4E9',
    'secondaryTextColor': '#FFFFFF',
    'tertiaryColor': '#E69F00',
    'lineColor': '#64748B',
    'textColor': '#1F2937',
    'clusterBkg': '#F0F9FF',
    'clusterBorder': '#BAE6FD'
  }
}}%%
\`\`\`

---

## PHASE 8: NODE STYLING BY COMPONENT TYPE

Apply AFTER all connections and linkStyle commands:

| Component Type | Style |
|----------------|-------|
| Client/UI | fill:#56B4E9,stroke:#0072B2,color:#fff |
| Gateway/Infra | fill:#64748B,stroke:#475569,color:#fff |
| Core Services | fill:#0072B2,stroke:#005A8C,color:#fff |
| Databases | fill:#E69F00,stroke:#CC8800,color:#fff |
| Caches | fill:#E69F00,stroke:#CC8800,color:#fff |
| Message Queues | fill:#009E73,stroke:#007A5E,color:#fff |
| External APIs | fill:#CC79A7,stroke:#AA5A87,color:#fff |
| Auth/Security | fill:#D55E00,stroke:#B34700,color:#fff |

---

## PHASE 8.5: REUSABLE STYLE DEFINITIONS (classDef)

Use classDef to define reusable style classes, then apply with ::: syntax:

\`\`\`
%%{init: {...}}%%
flowchart LR
    %% Define reusable style classes
    classDef client fill:#56B4E9,stroke:#0072B2,color:#fff,stroke-width:2px
    classDef service fill:#0072B2,stroke:#005A8C,color:#fff,stroke-width:2px
    classDef database fill:#E69F00,stroke:#CC8800,color:#fff,stroke-width:2px
    classDef external fill:#CC79A7,stroke:#AA5A87,color:#fff,stroke-width:2px
    classDef queue fill:#009E73,stroke:#007A5E,color:#fff,stroke-width:2px
    classDef auth fill:#D55E00,stroke:#B34700,color:#fff,stroke-width:2px

    %% Apply classes using ::: syntax
    WEB[Web App]:::client
    MOB[Mobile App]:::client
    API[API Service]:::service
    AUTH[Auth Service]:::auth
    DB[(Database)]:::database
    REDIS[(Redis)]:::database
    KAFKA([Kafka]):::queue
    STRIPE{{Stripe}}:::external
\`\`\`

**Benefits of classDef:**
- Cleaner diagram code (no repeated style commands)
- Consistent styling across nodes of same type
- Easier to maintain and modify
- Reduces diagram size and complexity

### Subgraph Styling

Style subgraphs for visual grouping by architectural layer:

\`\`\`
flowchart LR
    subgraph CL["Client Layer"]
        WEB[Web]
        MOB[Mobile]
    end

    subgraph SVC["Service Layer"]
        API[API]
    end

    %% Style entire subgraphs
    style CL fill:#DBEAFE,stroke:#93C5FD,stroke-width:2px
    style SVC fill:#F0F9FF,stroke:#BAE6FD,stroke-width:2px
\`\`\`

**Subgraph color by layer:**
| Layer | Background | Border |
|-------|------------|--------|
| Client | #DBEAFE (Light Blue) | #93C5FD |
| Gateway | #F1F5F9 (Slate-100) | #CBD5E1 |
| Services | #F0F9FF (Sky-50) | #BAE6FD |
| Data | #FEF3C7 (Amber-100) | #FCD34D |
| External | #FCE7F3 (Pink-100) | #F9A8D4 |

---

## PHASE 9: CONTENT-DRIVEN ARCHITECTURE (CRITICAL)

IMPORTANT: The diagram MUST represent the ACTUAL system described in the project content. Do NOT use generic template components.

Rules:
1. ONLY include components, services, and systems that are EXPLICITLY mentioned in the project content
2. If the project is a data pipeline, show the data pipeline components (not "Web App" or "Mobile App")
3. If the project mentions Kafka, Axway, SFTP, Azure — show THOSE specific systems
4. If the project does NOT mention "Stripe", "SendGrid", "OAuth Provider" — do NOT include them
5. Read the project content carefully and extract the actual flow: what sends data where, what triggers what, what stores what
6. Use the exact names from the project content (e.g., "ESL Service", "MF Job", "Broadridge") not generic names
7. Show the actual data flow described by the user, not a hypothetical web application architecture

Organization:
- Group related components into logical subgraphs based on the project's actual architecture
- Use left-to-right (LR) for data flow pipelines, top-to-bottom (TB) for hierarchical systems
- Label connections with the actual data/protocol described (e.g., "Kafka notification", "SFTP pull", "file copy")

---

## PHASE 10: DIAGRAM CONTENT WARNING

**CRITICAL: Do NOT copy the syntax examples above as your diagram content.**

The examples in earlier phases (Web App, Mobile App, Stripe, etc.) are ONLY to show Mermaid SYNTAX formatting. Your actual diagram MUST contain ONLY components from the project content provided in the user prompt.

If the project describes a data pipeline with Kafka, SFTP, Azure containers → show THOSE components.
If the project describes a microservices migration → show THOSE services.
NEVER include generic components (Web App, Mobile App, Stripe, SendGrid, OAuth) unless the project explicitly mentions them.

Read the project content. Extract the actual systems, services, data stores, and flows. Build the diagram from THOSE.

---

## PHASE 11: ERROR RECOVERY

1. Remove theme block — test basic structure first
2. Simplify subgraph names — use single words
3. Check labels — remove ALL special characters
4. Recount linkStyle indices — verify 0-based counting
5. Check for "end" keyword — capitalize as "End"
6. Reduce complexity — remove nodes incrementally

---

## PHASE 12: PRE-OUTPUT VALIDATION CHECKLIST

### Syntax Checks
[ ] Diagram type matches content (not defaulting to flowchart)
[ ] Every node uses ID[Label] format
[ ] Node IDs are alphanumeric only
[ ] No special characters in labels
[ ] No lowercase "end" in labels
[ ] Subgraph names properly quoted
[ ] One connection per line
[ ] Theme block at start (flowcharts only)
[ ] linkStyle after connections
[ ] style commands last

### Semantic Checks
[ ] Arrow colors match flow types
[ ] Node colors match component types
[ ] Async flows use dashed lines
[ ] Databases use cylinder shape
[ ] External services use hexagon shape

---

## STEP 3B — ARCHITECTURE DIAGRAM RULES (mandatory)

- **Source-faithful only**: Every node MUST correspond to a system, service, component, data store, queue, or integration point explicitly mentioned in the source epic. No node may be added because "most systems have one" or because a template includes it. Self-test: for every node, ask "Where in the source is this mentioned?" If you cannot point to a specific phrase, the node does not belong.
- **Admit gaps rather than fake**: If the source doesn't describe enough components, write a note in the diagram rather than inventing nodes.
- **Naming consistency**: Diagram node labels MUST match the terminology used in the document body. If the document says "Ingestion Pipeline", the diagram says "Ingestion Pipeline" — not "PIPE" or "Service A".
- **Flow direction must match**: The actual data/process flow described in the source. Do not force a flowchart on a system integration or vice versa.

---

## OUTPUT FORMAT

Return response in this EXACT format with no markdown code fences:

TYPE: [architecture|sequence|er|class|state|gantt|gitgraph|timeline|quadrant|sankey|pie|xychart|block|kanban]
REASONING: [One sentence explaining why this diagram type was selected]
DIAGRAM:
[Complete Mermaid diagram code]`;

  const epicSummary = buildEpicSummary(data, projectName);

  const response = await callAI(currentConfig!, systemPrompt, epicSummary);

  // Parse AI response
  const typeMatch = response.match(/TYPE:\s*(\S+)/i);
  const reasoningMatch = response.match(/REASONING:\s*(.+?)(?=DIAGRAM:|$)/is);

  // CRITICAL FIX: Extract content AFTER "DIAGRAM:" marker first
  // This prevents matching "gantt" in "TYPE: gantt" instead of the actual diagram
  let diagramSection = response;
  const diagramMarkerMatch = response.match(/DIAGRAM:\s*([\s\S]*)/i);
  if (diagramMarkerMatch) {
    diagramSection = diagramMarkerMatch[1];
  }

  // Strip code fence wrappers from the diagram section
  diagramSection = diagramSection
    .replace(/^```(?:mermaid)?\s*\n?/i, '')  // Remove opening fence
    .replace(/\n?```\s*$/i, '')               // Remove closing fence
    .trim();

  // Match any Mermaid diagram type (now searches only diagram section)
  const diagramPatterns = [
    /%%\{init:[\s\S]*?\}%%\s*(flowchart|graph)\s+(?:LR|TB|TD|RL|BT)[\s\S]*/i,
    /(flowchart|graph)\s+(?:LR|TB|TD|RL|BT)[\s\S]*/i,
    /(sequenceDiagram[\s\S]*)/i,
    /(classDiagram[\s\S]*)/i,
    /(stateDiagram-v2[\s\S]*)/i,
    /(stateDiagram[\s\S]*)/i,
    /(gantt[\s\S]*)/i,
    /(gitGraph[\s\S]*)/i,
    // Mind map removed - user feedback indicated messy output with no value
    /(timeline[\s\S]*)/i,
    /(quadrantChart[\s\S]*)/i,
    /(sankey-beta[\s\S]*)/i,
    /(pie[\s\S]*)/i,
    /(xychart-beta[\s\S]*)/i,
    /(block-beta[\s\S]*)/i,
    /(kanban[\s\S]*)/i,
    /(requirementDiagram[\s\S]*)/i,
    /(radar-beta[\s\S]*)/i,
  ];

  let diagram = '';
  for (const pattern of diagramPatterns) {
    const match = diagramSection.match(pattern);  // Now searches only diagram section!
    if (match) {
      diagram = match[0].trim();
      break;
    }
  }

  const type = (typeMatch?.[1]?.toLowerCase().replace('-', '_') as DiagramType) || 'architecture';
  const reasoning = reasoningMatch?.[1]?.trim() || 'AI-generated based on epic content.';

  // Validate the diagram
  if (!diagram) {
    throw new Error('AI did not return a diagram. Response may have been empty or malformed.');
  }

  // Validate - throws if invalid, caller will use AI to fix
  diagram = validateMermaidDiagram(diagram);

  return { diagram, type, reasoning };
}

// Validate Mermaid diagram and fix common issues
// Throws error if invalid - caller should use AI to fix errors
function validateMermaidDiagram(mermaid: string): string {
  // Remove any code fence markers
  mermaid = mermaid.replace(/```mermaid\s*/gi, '').replace(/```\s*/g, '').trim();

  // Valid Mermaid diagram starters
  const validStarts = [
    'flowchart',
    'graph',
    'sequenceDiagram',
    'classDiagram',
    'stateDiagram',
    'gantt',
    'gitGraph',
    // 'mindmap' removed - user feedback: messy output with no value
    'timeline',
    'quadrantChart',
    'sankey-beta',
    'pie',
    'xychart-beta',
    'block-beta',
    'kanban',
    'requirementDiagram',  // NEW: Requirements traceability
    'radar-beta',          // NEW: Multi-dimensional comparison
    '%%{init'  // Theme block before flowchart
  ];

  const hasValidStart = validStarts.some(start =>
    mermaid.toLowerCase().startsWith(start.toLowerCase())
  );

  if (!hasValidStart) {
    // Throw error instead of silent fallback - AI will fix this
    throw new Error(`Invalid Mermaid syntax: diagram must start with a valid type (flowchart, gantt, sequenceDiagram, etc). Found: "${mermaid.substring(0, 60)}..."`);
  }

  // Fix common issues

  // Fix lowercase "end" that breaks parsing (but not "End" or "END")
  mermaid = mermaid.replace(/\[end\]/g, '[Finish]');
  mermaid = mermaid.replace(/\(end\)/g, '(Finish)');

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

// Build a summary of the epic for AI consumption
function buildEpicSummary(data: RefinedData, projectName: string): string {
  let summary = `Project: ${projectName}\n\n`;

  // Primary fields (wizard-based)
  const primaryFields = ['objective', 'architectureOverview', 'features', 'userStories', 'dataStores', 'teams', 'environments'];
  for (const field of primaryFields) {
    if (data[field]?.original) {
      summary += `${field.toUpperCase()}:\n${data[field].original}\n\n`;
    }
  }

  // Include ALL other content from the epic — critical for non-wizard epics
  // (data pipeline projects, integration specs, etc. have sections that don't map to wizard fields)
  for (const [key, value] of Object.entries(data)) {
    if (!primaryFields.includes(key) && value?.original && value.original.length > 20) {
      const sectionName = key.replace(/([A-Z])/g, ' $1').trim().toUpperCase();
      summary += `${sectionName}:\n${value.original.substring(0, 1500)}\n\n`;
    }
  }

  // Hard cap to avoid exceeding token limits
  if (summary.length > 8000) {
    summary = summary.substring(0, 8000) + '\n...(truncated)';
  }

  return summary;
}

// Generate Mermaid Blueprint - Multilayer Epic Overview Diagram (renamed from PlantUML)
export function generatePlantUMLBlueprint(data: RefinedData, projectName: string): string {
  // Extract key data for the diagram
  const features = data['features']?.original?.split('\n').filter(Boolean).slice(0, 4) || ['Feature 1', 'Feature 2'];
  const teams = data['teams']?.original?.split('\n').filter(Boolean).slice(0, 3) || ['Team'];
  const hasDataStores = data['dataStores']?.original ? true : false;
  const deliverables = data['deliverables']?.original?.split('\n').filter(Boolean).slice(0, 3) || ['Deliverable'];

  // Sanitize function
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9\s]/g, '').trim().slice(0, 20);

  let mermaid = `flowchart TB
    subgraph Stakeholders["1. Stakeholders"]
        PO((Product Owner))
        TL((Tech Lead))
        BIZ((Business))
    end

    subgraph Requirements["2. Requirements"]
`;

  // Add features
  features.forEach((f, i) => {
    mermaid += `        F${i}[${sanitize(f)}]\n`;
  });

  mermaid += `    end

    subgraph Architecture["3. Architecture"]
        UI[Frontend]
        API[API Gateway]
        SVC[Services]
`;

  if (hasDataStores) {
    mermaid += `        DB[(Database)]
        CACHE[(Cache)]
    end
`;
  } else {
    mermaid += `        DB[(Database)]
    end
`;
  }

  mermaid += `
    subgraph Team["4. Team & Execution"]
`;

  teams.forEach((t, i) => {
    mermaid += `        TM${i}[${sanitize(t)}]\n`;
  });

  mermaid += `        subgraph Pipeline["CI/CD"]
            BUILD[Build] --> TEST[Test] --> DEPLOY[Deploy]
        end
    end

    subgraph Environments["5. Environments"]
        DEV[Development]
        STG[Staging]
        PROD[Production]
    end

    subgraph Deliverables["6. Deliverables"]
`;

  deliverables.forEach((d, i) => {
    mermaid += `        D${i}[${sanitize(d)}]\n`;
  });

  mermaid += `    end

    %% Connections
    PO --> Requirements
    TL --> Requirements
    BIZ --> Requirements

    Requirements --> Architecture
    UI --> API
    API --> SVC
    SVC --> DB
`;

  if (hasDataStores) {
    mermaid += `    SVC --> CACHE
`;
  }

  mermaid += `
    Architecture --> Team
    Team --> Pipeline
    DEPLOY --> DEV
    DEV --> STG
    STG --> PROD

    PROD --> Deliverables
`;

  return mermaid;
}

// ===========================================
// EPIC FEEDBACK CHAT FUNCTIONS
// ===========================================

// Analyze user feedback to determine which section they want to modify
export async function analyzeUserFeedback(
  feedback: string,
  epicSections: string[]
): Promise<{ needsClarification: boolean; suggestedSection?: number; followUpQuestion?: string }> {
  if (!currentConfig) {
    throw new Error('Azure OpenAI is not configured. Please check Settings.');
  }

  const systemPrompt = `You are an assistant helping users modify their epic document.
Analyze the user's feedback to determine which section they want to modify.

Available sections:
${epicSections.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Based on the user's feedback:
1. Can you confidently identify which section(s) the user is referring to?
2. Do you need more information to make the change?

Return a JSON object (no markdown, just raw JSON):
{
  "needsClarification": boolean,
  "suggestedSection": number or null (1-17),
  "followUpQuestion": "question to ask user" or null
}

If the feedback clearly mentions a specific section (by name or number), set needsClarification to false and suggestedSection to that section number.
If the feedback is vague or could apply to multiple sections, set needsClarification to true and ask a clarifying question.`;

  const userPrompt = `User feedback: "${feedback}"

Return JSON only:`;

  const response = await callAI(currentConfig, systemPrompt, userPrompt);

  // Clean up response and parse JSON
  let cleanResponse = response.trim();
  // Remove markdown code fences if present
  cleanResponse = cleanResponse.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  try {
    return JSON.parse(cleanResponse);
  } catch {
    // If parsing fails, ask for clarification
    return {
      needsClarification: true,
      suggestedSection: undefined,
      followUpQuestion: 'Which section would you like me to update?'
    };
  }
}

// Process user feedback and generate updated section content
export async function processFeedback(
  feedback: string,
  currentEpic: string,
  targetSection: number,
  additionalContext?: string
): Promise<{ updatedSection: string; explanation: string }> {
  if (!currentConfig) {
    throw new Error('Azure OpenAI is not configured. Please check Settings.');
  }

  const sectionTitle = EPIC_SECTIONS[targetSection - 1]?.title || `Section ${targetSection}`;

  const systemPrompt = `You are an expert technical writer helping to modify an epic document.
The user wants to modify section "${sectionTitle}" of their epic document.

RULES:
1. Only modify the specified section - do not touch other sections
2. Return the updated section content in markdown format
3. Preserve the section header format: "## ${targetSection}. ${sectionTitle}"
4. Keep the same style and tone as the rest of the document
5. Be concise but thorough
6. If the section has subsections, preserve them
7. Do not add unnecessary fluff - make meaningful improvements based on the feedback

Return a JSON object (no markdown, just raw JSON):
{
  "updatedSection": "## ${targetSection}. ${sectionTitle}\\n\\n[updated content here]",
  "explanation": "Brief 1-2 sentence explanation of changes made"
}`;

  const userPrompt = `CURRENT EPIC DOCUMENT:
${currentEpic}

USER FEEDBACK: ${feedback}
${additionalContext ? `\nADDITIONAL CONTEXT: ${additionalContext}` : ''}

TARGET SECTION: ${targetSection}. ${sectionTitle}

Return JSON only:`;

  const response = await callAI(currentConfig, systemPrompt, userPrompt);

  // Clean up response and parse JSON
  let cleanResponse = response.trim();
  cleanResponse = cleanResponse.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  try {
    return JSON.parse(cleanResponse);
  } catch {
    // If parsing fails, return a generic error response
    throw new Error('Failed to parse AI response. Please try again.');
  }
}

// ======================================================
// GLOBAL FEEDBACK - Apply to Entire Epic
// ======================================================

const GLOBAL_FEEDBACK_CONCURRENCY = 5;
const MAX_RETRIES = 2;

/**
 * Apply feedback to a single section, determining if changes are needed
 * Returns the updated content only if changes were made
 */
async function applySectionFeedback(
  feedback: string,
  sectionNum: number,
  sectionTitle: string,
  currentSectionContent: string,
  signal?: AbortSignal
): Promise<{ wasChanged: boolean; updatedContent: string; changeReason?: string }> {
  if (!currentConfig) {
    throw new Error('AI is not configured. Please check Settings.');
  }

  if (signal?.aborted) {
    throw new Error('Operation cancelled');
  }

  const systemPrompt = `You are an expert technical writer modifying an epic document.
Apply this user feedback to section ${sectionNum} "${sectionTitle}":

FEEDBACK: "${feedback}"

RULES:
1. If this feedback is RELEVANT to this section, update it meaningfully
2. If this feedback is NOT relevant to this section, set wasChanged to false
3. Preserve the section header: "## ${sectionNum}. ${sectionTitle}"
4. Keep the same format, style, and structure
5. Make substantive improvements, not superficial word changes
6. If section has subsections (like "### 3.1 In Scope"), preserve them

Return JSON only (no markdown fences):
{
  "wasChanged": boolean,
  "updatedContent": "## ${sectionNum}. ${sectionTitle}\\n\\n[content here]",
  "changeReason": "Brief reason for change" or null if unchanged
}`;

  const userPrompt = `CURRENT SECTION CONTENT:
${currentSectionContent}

Apply the feedback and return JSON:`;

  const response = await callAI(currentConfig, systemPrompt, userPrompt);

  // Clean up response and parse JSON
  let cleanResponse = response.trim();
  cleanResponse = cleanResponse.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  try {
    const parsed = JSON.parse(cleanResponse);
    return {
      wasChanged: parsed.wasChanged === true,
      updatedContent: parsed.updatedContent || currentSectionContent,
      changeReason: parsed.changeReason
    };
  } catch {
    throw new Error(`Failed to parse AI response for section ${sectionNum}`);
  }
}

/**
 * Batch replace all sections in a single pass - O(n) instead of O(17n)
 */
function batchReplaceAllSections(
  epic: string,
  updates: Map<number, string>
): string {
  if (updates.size === 0) return epic;

  // Parse all sections from the epic
  const sectionRegex = /##\s*(\d+)\.\s*([^\n]+)\n([\s\S]*?)(?=##\s*\d+\.|$)/g;

  let result = epic;
  const matches: { start: number; end: number; sectionNum: number; fullMatch: string }[] = [];

  let match;
  while ((match = sectionRegex.exec(epic)) !== null) {
    const sectionNum = parseInt(match[1], 10);
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      sectionNum,
      fullMatch: match[0]
    });
  }

  // Replace from end to start to preserve indices
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    const newContent = updates.get(m.sectionNum);
    if (newContent) {
      result = result.slice(0, m.start) + newContent + '\n\n' + result.slice(m.end);
    }
  }

  return result;
}

/**
 * Generate a summary of changes made to the epic
 */
async function generateGlobalFeedbackSummary(
  feedback: string,
  changedSections: string[],
  failedSections: string[]
): Promise<string> {
  if (!currentConfig) {
    // Fallback to simple summary
    if (changedSections.length === 0) {
      return "No sections required changes based on this feedback.";
    }
    return `Updated ${changedSections.length} section${changedSections.length > 1 ? 's' : ''}: ${changedSections.join(', ')}.`;
  }

  if (changedSections.length === 0 && failedSections.length === 0) {
    return "No sections required changes based on this feedback.";
  }

  const systemPrompt = `Summarize changes made to an epic document in 2-3 concise sentences. Be specific about what was changed.`;

  const userPrompt = `Feedback applied: "${feedback}"
Sections updated: ${changedSections.length > 0 ? changedSections.join(', ') : 'None'}
${failedSections.length > 0 ? `Sections that failed to update: ${failedSections.join(', ')}` : ''}

Write a brief summary:`;

  try {
    const response = await callAI(currentConfig, systemPrompt, userPrompt);
    return response.trim();
  } catch {
    // Fallback summary
    let summary = `Updated ${changedSections.length} section${changedSections.length > 1 ? 's' : ''}.`;
    if (failedSections.length > 0) {
      summary += ` Failed to update: ${failedSections.join(', ')}.`;
    }
    return summary;
  }
}

/**
 * Apply feedback globally to entire epic using parallel processing
 * Time Complexity: O(ceil(S/C) * L) where S=sections, C=concurrency, L=latency
 * Space Complexity: O(n) where n=epic size
 */
export async function applyFeedbackToEntireEpic(
  feedback: string,
  currentEpic: string,
  onProgress?: (current: number, total: number, sectionTitle: string) => void,
  signal?: AbortSignal
): Promise<{ updatedEpic: string; summary: string; changedSections: string[]; failedSections: string[] }> {
  console.log('[applyFeedbackToEntireEpic] Called');
  console.log('[applyFeedbackToEntireEpic] feedback:', feedback?.substring(0, 50));
  console.log('[applyFeedbackToEntireEpic] epic length:', currentEpic?.length);
  console.log('[applyFeedbackToEntireEpic] currentConfig:', currentConfig ? 'SET' : 'NOT SET');

  if (!currentConfig) {
    console.error('[applyFeedbackToEntireEpic] ERROR: AI not configured');
    throw new Error('AI is not configured. Please check Settings.');
  }

  // Filter out reference-only sections (like Architecture Diagrams)
  const sectionsToProcess = EPIC_SECTIONS.filter(s => !s.isReference);
  const totalSections = sectionsToProcess.length;

  // Pre-parse all section contents once - O(n)
  const parsedSections = parseEpicSections(currentEpic);

  // Results tracking
  const updates = new Map<number, string>();
  const changedSections: string[] = [];
  const failedSections: string[] = [];
  let completed = 0;

  // Process sections with concurrency limit
  const processBatch = async (batch: typeof sectionsToProcess) => {
    await Promise.all(batch.map(async (section) => {
      if (signal?.aborted) return;

      const sectionContent = parsedSections.get(section.num) || '';
      const fullSectionWithHeader = `## ${section.num}. ${section.title}\n\n${sectionContent}`;

      let lastError: Error | null = null;

      // Retry logic with exponential backoff
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (signal?.aborted) return;

        try {
          const result = await applySectionFeedback(
            feedback,
            section.num,
            section.title,
            fullSectionWithHeader,
            signal
          );

          if (result.wasChanged) {
            updates.set(section.num, result.updatedContent);
            changedSections.push(section.title);
          }

          lastError = null;
          break;
        } catch (error) {
          lastError = error as Error;
          if (attempt < MAX_RETRIES && !signal?.aborted) {
            // Exponential backoff: 1s, 2s
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          }
        }
      }

      if (lastError) {
        failedSections.push(section.title);
        console.error(`Failed to update section ${section.num} (${section.title}):`, lastError.message);
      }

      completed++;
      onProgress?.(completed, totalSections, section.title);
    }));
  };

  // Process in batches of CONCURRENCY
  for (let i = 0; i < sectionsToProcess.length; i += GLOBAL_FEEDBACK_CONCURRENCY) {
    if (signal?.aborted) break;
    const batch = sectionsToProcess.slice(i, i + GLOBAL_FEEDBACK_CONCURRENCY);
    await processBatch(batch);
  }

  if (signal?.aborted) {
    throw new Error('Operation cancelled');
  }

  // Batch replace all sections in single pass - O(n)
  const updatedEpic = batchReplaceAllSections(currentEpic, updates);

  // Generate summary
  const summary = await generateGlobalFeedbackSummary(feedback, changedSections, failedSections);

  return { updatedEpic, summary, changedSections, failedSections };
}

// Fix Mermaid diagram syntax errors using AI
export async function fixMermaidDiagram(
  failedCode: string,
  errorMessage: string
): Promise<string> {
  if (!currentConfig) {
    throw new Error('Config not set. Cannot fix diagram without AI.');
  }

  const systemPrompt = `You are a Mermaid.js syntax expert.
A diagram failed to render with the following error. Fix the syntax while keeping the EXACT same structure, nodes, and connections.

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

  const userPrompt = `ERROR MESSAGE:
${errorMessage}

FAILED MERMAID CODE:
${failedCode}

Return ONLY the fixed Mermaid code:`;

  const response = await callAI(currentConfig, systemPrompt, userPrompt);

  // Clean up response - remove any code fences
  let fixed = response
    .replace(/```mermaid\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  return fixed;
}

// ======================================================
// AI REFINEMENT - Epic Quality Analysis & Scoring
// ======================================================

/**
 * Parse epic markdown to extract section contents
 */
function parseEpicSections(epicContent: string): Map<number, string> {
  const sections = new Map<number, string>();

  // Match section headers like "## 1. Objective" or "## 15. Next Steps"
  const sectionRegex = /##\s*(\d+)\.\s*([^\n]+)\n([\s\S]*?)(?=##\s*\d+\.|$)/g;

  let match;
  while ((match = sectionRegex.exec(epicContent)) !== null) {
    const sectionNum = parseInt(match[1], 10);
    const content = match[3].trim();
    sections.set(sectionNum, content);
  }

  return sections;
}

/**
 * Parse epic markdown back into stage data (reverse of generateEpic)
 * Used by Smart Refine to extract content for re-refinement
 */
export function parseEpicToStageData(
  epicMarkdown: string
): { data: RefinedData; missingFields: string[]; projectName: string } {
  const data: RefinedData = {};
  const missingFields: string[] = [];

  // Extract project name from title: "# {PROJECT_NAME}" (also supports legacy "# Technical Design Epic: {PROJECT_NAME}")
  const titleMatch = epicMarkdown.match(/^#\s*(?:Technical Design Epic:\s*)?(.+?)(?:\n|$)/m);
  const projectName = titleMatch ? titleMatch[1].trim() : 'Untitled Project';

  // Parse all sections
  const parsedSections = parseEpicSections(epicMarkdown);

  // Map each EPIC_SECTION back to its dataKeys
  for (const section of EPIC_SECTIONS) {
    const sectionContent = parsedSections.get(section.num) || '';

    // Skip reference-only sections (like Architecture Diagrams)
    if (section.isReference || section.dataKeys.length === 0) {
      continue;
    }

    // Handle sections with subsections (like Scope, Dependencies & Risks)
    if (section.subsections && section.subsections.length > 0) {
      // Parse subsections: "### In Scope" and "### Out of Scope"
      const subsectionParts: string[] = [];

      for (let i = 0; i < section.subsections.length; i++) {
        const subsectionTitle = section.subsections[i];
        const dataKey = section.dataKeys[i];

        // Try to find subsection content
        const subsectionRegex = new RegExp(
          `###\\s*(?:\\d+\\.\\d+\\.?\\s*)?${subsectionTitle}\\s*\\n([\\s\\S]*?)(?=###|$)`,
          'i'
        );
        const subsectionMatch = sectionContent.match(subsectionRegex);

        if (subsectionMatch) {
          const content = subsectionMatch[1].trim();
          data[dataKey] = {
            original: content,
            refined: content,
            diagramNode: `${dataKey}["${subsectionTitle}"]`,
          };

          if (!content || content.length < 10) {
            missingFields.push(dataKey);
          }
        } else {
          // No subsection found
          data[dataKey] = {
            original: '',
            refined: '',
            diagramNode: '',
          };
          missingFields.push(dataKey);
        }
      }
    } else {
      // Single dataKey for this section
      const dataKey = section.dataKeys[0];

      if (dataKey) {
        const content = sectionContent.trim();

        data[dataKey] = {
          original: content,
          refined: content,
          diagramNode: `${dataKey}["${section.title}"]`,
        };

        // Check if content is missing or too short
        if (!content || content.length < 10) {
          missingFields.push(dataKey);
        }
      }
    }

    // Handle multi-dataKey sections without subsections (like Features & User Stories)
    if (!section.subsections && section.dataKeys.length > 1) {
      // Split content intelligently or assign to first key
      const content = sectionContent.trim();

      // For section 11 (Features & User Stories), try to split
      if (section.num === 11) {
        // Look for "User Stories" header within the content
        const userStoriesMatch = content.match(/([\s\S]*?)(?:###?\s*User Stories|As a\s)/i);

        if (userStoriesMatch) {
          data['features'] = {
            original: userStoriesMatch[1].trim(),
            refined: userStoriesMatch[1].trim(),
            diagramNode: 'features["Key Features"]',
          };

          const userStoriesPart = content.replace(userStoriesMatch[1], '').trim();
          data['userStories'] = {
            original: userStoriesPart,
            refined: userStoriesPart,
            diagramNode: 'userStories["User Stories"]',
          };
        } else {
          // Assign all to features
          data['features'] = {
            original: content,
            refined: content,
            diagramNode: 'features["Key Features"]',
          };
          data['userStories'] = {
            original: '',
            refined: '',
            diagramNode: '',
          };
          missingFields.push('userStories');
        }
      }
    }
  }

  // Add projectName to data
  data['projectName'] = {
    original: projectName,
    refined: projectName,
    diagramNode: `project["${projectName}"]`,
  };

  return { data, missingFields, projectName };
}

/**
 * Determine section status based on score
 */
function getStatusFromScore(score: number): 'strong' | 'adequate' | 'weak' | 'missing' {
  if (score === 0) return 'missing';
  if (score >= 8) return 'strong';
  if (score >= 5) return 'adequate';
  return 'weak';
}

/**
 * Lightweight category detection for critique
 * Returns category and confidence without full comprehension
 */
async function detectCategoryForCritique(
  epicContent: string
): Promise<{ category: EpicCategory; confidence: number }> {
  if (!currentConfig) {
    return { category: 'technical_design', confidence: 0.5 };
  }

  const systemPrompt = `You are a document classifier. Classify this epic into ONE category.

CATEGORIES:
- business_requirement: ROI focus, stakeholder value, strategic alignment
- technical_design: System architecture, components, implementation
- feature_specification: User features, acceptance criteria, user flows
- api_specification: API endpoints, schemas, integration contracts
- infrastructure_design: Cloud, deployment, scaling, monitoring
- migration_plan: Current/target state, migration steps, rollback
- integration_spec: System-to-system data flows, interfaces

Return ONLY JSON: {"category": "<id>", "confidence": <0.0-1.0>}`;

  const userPrompt = `Classify this document:\n\n${epicContent.substring(0, 4000)}`;

  try {
    const response = await callAI(currentConfig, systemPrompt, userPrompt);
    const clean = response.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(clean);
    return {
      category: (parsed.category || 'technical_design') as EpicCategory,
      confidence: parsed.confidence || 0.7
    };
  } catch {
    return { category: 'technical_design', confidence: 0.5 };
  }
}

/**
 * Get tone instruction based on category tone setting
 */
function getToneInstruction(tone: string): string {
  const toneMap: Record<string, string> = {
    'executive-friendly': 'Use clear business language. Focus on value, outcomes, and strategic impact.',
    'precise-technical': 'Use precise technical terminology. Be specific about systems, APIs, and implementations.',
    'user-focused': 'Focus on user experience and outcomes. Emphasize usability and acceptance criteria.',
    'ops-focused': 'Focus on operational concerns: reliability, scalability, monitoring, and recovery.',
    'procedural': 'Be step-by-step and methodical. Ensure clear sequencing and dependencies.'
  };
  return toneMap[tone] || 'Be clear, specific, and actionable.';
}

/**
 * Analyze and score an epic document, providing detailed feedback
 * Uses CATEGORY-AWARE critique based on the detected epic type
 */
export async function analyzeAndRefineEpic(
  epicContent: string
): Promise<EpicQualityReport> {
  if (!currentConfig) {
    throw new Error('AI is not configured. Please check Settings.');
  }

  // Step 1: Detect the category of this epic
  const { category, confidence } = await detectCategoryForCritique(epicContent);

  // Step 2: Load the category template
  const template = loadCategoryTemplate(category);

  // Step 3: Build category-specific section list
  const requiredSections = Object.keys(template.requiredSections);
  const optionalSections = Object.keys(template.optionalSections);

  const requiredList = requiredSections.map((s, i) => `${i + 1}. ${s} (REQUIRED)`).join('\n');
  const optionalList = optionalSections.map((s, i) => `${requiredSections.length + i + 1}. ${s} (optional)`).join('\n');

  // Step 4: Build category-aware prompt using expert role and tone
  const expertRole = template.expertRole || 'technical reviewer';
  const toneInstruction = getToneInstruction(template.tone);
  const categoryLabel = category.replace(/_/g, ' ');

  const systemPrompt = `You are an expert ${expertRole} reviewing a ${categoryLabel} document.

YOUR EXPERTISE:
${toneInstruction}

CRITICAL RULES:
1. Evaluate this as a ${categoryLabel} document - NOT a generic technical epic
2. Required sections MUST be present and well-written - score harshly if missing
3. Optional sections are nice-to-have - don't penalize if absent
4. Be specific about what's missing FOR THIS TYPE of document
5. Suggestions should match the ${expertRole} perspective

SCORING RUBRIC:
- 10: Exceptional - comprehensive, clear, actionable with concrete details
- 8-9: Strong - well-written with minor improvements possible
- 6-7: Adequate - meets basic requirements but lacks depth
- 4-5: Weak - significant gaps or vague content
- 1-3: Poor - critical information missing
- 0: Missing - section not present

For a ${categoryLabel}, specifically assess:
${category === 'business_requirement' ? '- Business value and ROI clarity\n- Stakeholder identification\n- Success metrics definition' :
  category === 'technical_design' ? '- Architecture completeness\n- Component interactions\n- Technical feasibility' :
  category === 'feature_specification' ? '- User story clarity\n- Acceptance criteria completeness\n- Edge case coverage' :
  category === 'api_specification' ? '- Endpoint definitions\n- Request/response schemas\n- Error handling' :
  category === 'infrastructure_design' ? '- Scalability considerations\n- Monitoring strategy\n- Disaster recovery' :
  category === 'migration_plan' ? '- Current/target state clarity\n- Rollback procedures\n- Risk mitigation' :
  '- Integration points\n- Data flow clarity\n- Error handling'}`;

  const userPrompt = `Analyze this ${categoryLabel} document.

REQUIRED SECTIONS FOR ${categoryLabel.toUpperCase()}:
${requiredList}

OPTIONAL SECTIONS:
${optionalList}

DOCUMENT CONTENT:
${epicContent}

Respond with ONLY valid JSON (no markdown):
{
  "overallScore": <0-10>,
  "summary": "<honest assessment as a ${expertRole}>",
  "criticalIssues": ["<critical issue>"],
  "strengthAreas": ["<strength>"],
  "missingRequired": ["<missing required section>"],
  "sections": [
    {
      "sectionTitle": "<section name>",
      "score": <0-10>,
      "isRequired": <true/false>,
      "issues": ["<specific issue>"],
      "suggestions": ["<actionable suggestion>"]
    }
  ]
}

IMPORTANT:
- Evaluate ONLY the sections listed above (not hardcoded 17)
- Required sections missing = critical issue
- Be specific to ${categoryLabel} requirements`;

  const response = await callAI(currentConfig, systemPrompt, userPrompt);

  // Parse response
  let cleanResponse = response.trim();
  cleanResponse = cleanResponse.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  try {
    const parsed = JSON.parse(cleanResponse);

    // Build section feedback from AI response
    const sectionFeedback: SectionFeedback[] = [];

    // Process sections from AI response
    const aiSections = parsed.sections || [];
    for (let i = 0; i < aiSections.length; i++) {
      const s = aiSections[i];
      sectionFeedback.push({
        sectionNum: i + 1,
        sectionTitle: s.sectionTitle || `Section ${i + 1}`,
        score: s.score || 0,
        status: getStatusFromScore(s.score || 0),
        issues: s.issues || [],
        suggestions: s.suggestions || [],
      });
    }

    // Add any required sections not covered by AI
    for (const reqSection of requiredSections) {
      const found = sectionFeedback.some(s =>
        normalizeTitle(s.sectionTitle).includes(normalizeTitle(reqSection)) ||
        normalizeTitle(reqSection).includes(normalizeTitle(s.sectionTitle))
      );
      if (!found) {
        sectionFeedback.push({
          sectionNum: sectionFeedback.length + 1,
          sectionTitle: reqSection,
          score: 0,
          status: 'missing',
          issues: [`Required section "${reqSection}" not found in document`],
          suggestions: [`Add a ${reqSection} section - this is required for ${categoryLabel} documents`],
        });
      }
    }

    return {
      overallScore: parsed.overallScore || 0,
      summary: parsed.summary || 'Unable to generate summary.',
      sections: sectionFeedback,
      criticalIssues: parsed.criticalIssues || [],
      strengthAreas: parsed.strengthAreas || [],
      missingRequired: parsed.missingRequired || [],
      // Category-aware fields
      detectedCategory: category,
      categoryConfidence: confidence,
      expertRole: expertRole,
    };
  } catch {
    throw new Error('Failed to parse AI response. Please try again.');
  }
}

/**
 * Generate improved content for a weak section
 * Now category-aware: uses section title and detects category for appropriate tone
 */
export async function generateSectionImprovement(
  sectionNum: number,
  currentContent: string,
  issues: string[],
  epicContext: string,
  sectionTitle?: string,  // New: explicit section title
  category?: string       // New: detected category for tone
): Promise<string> {
  if (!currentConfig) {
    throw new Error('AI is not configured. Please check Settings.');
  }

  // Try to get section title from EPIC_SECTIONS for backward compatibility
  // If not found, use the provided sectionTitle
  let title = sectionTitle;
  if (!title) {
    const section = EPIC_SECTIONS.find(s => s.num === sectionNum);
    title = section?.title || `Section ${sectionNum}`;
  }

  // Get category-specific expert role and word limit
  const cat = (category || 'technical_design') as EpicCategory;
  const template = loadCategoryTemplate(cat);
  const expertRole = template.expertRole || 'technical writer';
  const wordLimit = getSectionWordLimit(title, template);
  const toneInstruction = getToneInstruction(template.tone);
  const categoryLabel = cat.replace(/_/g, ' ');

  const systemPrompt = `You are an expert ${expertRole} improving ${categoryLabel} documentation.
Rewrite the section to address the identified issues while maintaining the original intent.

TONE: ${toneInstruction}

RULES:
1. Keep the section header format: "## ${title}"
2. Be specific and actionable - no vague statements
3. Add concrete details, metrics, and owners where appropriate
4. Use professional language suitable for ${categoryLabel} documents
5. Structure content with bullet points or numbered lists where appropriate
6. DO NOT add placeholder text like [TBD] or [insert here]
7. Target approximately ${wordLimit} words - be concise but complete`;

  const userPrompt = `SECTION: ${title}

CURRENT CONTENT:
${currentContent || '(empty)'}

ISSUES TO ADDRESS:
${issues.map(i => `- ${i}`).join('\n')}

DOCUMENT CONTEXT (for reference):
${epicContext.slice(0, 2000)}

Write an improved version of this section (target: ${wordLimit} words):`;

  const response = await callAI(currentConfig, systemPrompt, userPrompt);

  return response.trim();
}

// ===========================================
// USER STORY PARSING & ISSUE MANAGEMENT
// ===========================================

export interface ParsedUserStory {
  id: string;
  rawText: string;
  title: string;
  description: string;
  persona?: string;
  goal?: string;
  benefit?: string;
  acceptanceCriteria?: string[];
  hasExistingIssue: boolean;
  matchedIssueId?: number;
  matchedIssueIid?: number;
  similarityScore?: number;
}

/**
 * Parse user stories from epic markdown content
 * Looks for Section 11 (Key Features & User Stories) and extracts stories
 * Supports both new format (with professional titles) and legacy format
 */
export function parseUserStoriesFromEpic(epicContent: string): ParsedUserStory[] {
  const stories: ParsedUserStory[] = [];

  // Find the User Stories section — supports multiple formats:
  //   1. "## 11. Key Features & User Stories" (wizard format)
  //   2. "## User Stories" or "### User Stories" (pipeline format, no number)
  //   3. "## N. User Stories" (pipeline format with auto-number)
  //   4. "## N. Key Features & User Stories" (any number, not just 11)
  const section11Match = epicContent.match(/##\s*\d+\.\s*(?:Key Features\s*&?\s*)?User Stories[\s\S]*?(?=\n##\s|$)/i);
  // NOTE: Termination must NOT include ### sub-headers — those are INSIDE the User Stories section
  // (e.g., "### Infrastructure & Operational"). Only stop at ## section-level headers.
  const userStoriesMatch = epicContent.match(/###?\s*(?:\d+\.\s*)?User Stories[\s\S]*?(?=\n##\s*\d+\.|\n##\s[A-Z]|$)/i);

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

  // Pattern 1 (NEW FORMAT): **US-XXX: Professional Title** with blockquote story
  // Matches: **US-001: Implement MFA Authentication** 🔴
  //          > As a user, I want to enable multi-factor authentication, so that my account is secure.
  // NOTE: Title uses (.*?) to handle backtick-code with * inside (e.g., `*`-enclosed).
  // Goal uses (.+?) (non-greedy, allows commas) anchored by [.\n] at end.
  const newFormatPattern = /\*\*([A-Z]{2,3}-\d+):\s*(.*?)\*\*[^\n]*\n>\s*As an?\s+([^,]+),?\s*I\s+want\s+(.+?)(?:,?\s*so\s+that\s+([^.\n]+))?[.\n]/gi;

  // Helper: strip assembly artifacts from parsed text (e.g., trailing **, [Req #N] tags)
  function cleanArtifacts(text: string): string {
    return text
      .replace(/\*{1,2}\s*/g, '')         // strip stray * or **
      .replace(/\s*\[Req\s*#\d+(?:,\s*Req\s*#\d+)*\]/gi, '') // strip [Req #N] tags
      .trim();
  }

  let match;
  while ((match = newFormatPattern.exec(sectionContent)) !== null) {
    const storyId = match[1]?.trim();           // US-001
    const title = cleanArtifacts(match[2]?.trim() || '');
    const persona = match[3]?.trim();            // user
    const goal = cleanArtifacts(match[4]?.trim() || '');
    const benefit = match[5]?.trim();            // my account is secure

    // Skip garbage stories (empty or very short titles)
    if (!title || title.length < 5) continue;

    const rawText = `As a ${persona}, I want ${goal}${benefit ? `, so that ${benefit}` : ''}.`;

    stories.push({
      id: storyId || `story-${stories.length + 1}-${Date.now()}`,
      rawText,
      title: title.length > 100 ? title.slice(0, 97) + '...' : title,
      description: `**User Story**\n\n${rawText}\n\n**Persona:** ${persona || 'User'}\n**Goal:** ${goal || 'N/A'}\n**Benefit:** ${benefit || 'N/A'}`,
      persona,
      goal,
      benefit,
      hasExistingIssue: false
    });
  }

  // If new format found stories, return them
  if (stories.length > 0) {
    console.log(`[parseUserStories] Found ${stories.length} stories (new format with titles)`);
    return stories;
  }

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

  // Pattern 2 (LEGACY FORMAT): "As a [persona], I want [goal] so that [benefit]"
  // Uses (.+?) with [.\n] anchor (same fix as Pattern 1 — allows commas in goals)
  const asAPattern = /[-*]\s*(?:As an?\s+)([^,]+),?\s*I\s+want\s+(.+?)(?:,?\s*so\s+that\s+([^.\n]+))?[.\n]/gi;

  while ((match = asAPattern.exec(sectionContent)) !== null) {
    const persona = match[1]?.trim();
    const goal = match[2]?.trim();
    const benefit = match[3]?.trim();

    const rawText = match[0].trim();
    // Legacy fallback: capitalize goal as title (not ideal, but backward compatible)
    const title = goal ? `${goal.charAt(0).toUpperCase()}${goal.slice(1)}` : rawText;

    stories.push({
      id: `US-${String(stories.length + 1).padStart(3, '0')}`,
      rawText,
      title: title.length > 100 ? title.slice(0, 97) + '...' : title,
      description: `**User Story**\n\n${rawText}\n\n**Persona:** ${persona || 'User'}\n**Goal:** ${goal || 'N/A'}\n**Benefit:** ${benefit || 'N/A'}`,
      persona,
      goal,
      benefit,
      hasExistingIssue: false
    });
  }

  // Pattern 3: Simple bullet points (last resort)
  if (stories.length === 0) {
    const bulletPattern = /[-*]\s+(?!\s*As\s)([^\n]+)/g;
    const userStoriesSubsection = sectionContent.match(/User Stories[\s\S]*?(?=###|##|$)/i);
    const searchContent = userStoriesSubsection ? userStoriesSubsection[0] : sectionContent;

    while ((match = bulletPattern.exec(searchContent)) !== null) {
      const text = match[1]?.trim();
      if (text && text.length > 10 && !text.toLowerCase().startsWith('as a')) {
        stories.push({
          id: `US-${String(stories.length + 1).padStart(3, '0')}`,
          rawText: text,
          title: text.length > 100 ? text.slice(0, 97) + '...' : text,
          description: `**User Story**\n\n${text}`,
          hasExistingIssue: false
        });
      }
    }
  }

  console.log(`[parseUserStories] Found ${stories.length} user stories`);
  return stories;
}

/**
 * Use LLM to check if a user story is similar to existing issues
 * Returns similarity analysis to avoid creating duplicates
 */
export async function analyzeStoryDuplicates(
  stories: ParsedUserStory[],
  existingIssues: Array<{ id: number; iid: number; title: string; description?: string }>
): Promise<ParsedUserStory[]> {
  if (!currentConfig) {
    console.log('[analyzeStoryDuplicates] No config, skipping analysis');
    return stories;
  }

  if (existingIssues.length === 0) {
    console.log('[analyzeStoryDuplicates] No existing issues, all stories are new');
    return stories;
  }

  const systemPrompt = `You are an expert at detecting duplicate or similar issues in project management.
Given a list of user stories and existing issues, identify which stories are duplicates or very similar to existing issues.

RULES:
1. A story is a DUPLICATE if it describes essentially the same functionality (>80% similar)
2. A story is SIMILAR if it overlaps significantly (50-80% similar)
3. A story is UNIQUE if it describes different functionality (<50% similar)
4. Consider semantic meaning, not just keyword matching
5. Be conservative - when in doubt, mark as unique to avoid missing important stories

OUTPUT FORMAT (JSON):
{
  "analysis": [
    {
      "storyId": "story-1-xxx",
      "status": "duplicate|similar|unique",
      "similarityScore": 0-100,
      "matchedIssueIid": 123 or null,
      "reason": "brief explanation"
    }
  ]
}`;

  const existingIssuesList = existingIssues.map(i =>
    `- Issue #${i.iid}: ${i.title}`
  ).join('\n');

  const storiesList = stories.map(s =>
    `- ${s.id}: ${s.title}`
  ).join('\n');

  const userPrompt = `EXISTING ISSUES:
${existingIssuesList}

USER STORIES TO ANALYZE:
${storiesList}

Analyze each story and identify duplicates. Return JSON only.`;

  try {
    const response = await callAI(currentConfig, systemPrompt, userPrompt);

    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('[analyzeStoryDuplicates] Could not parse LLM response');
      return stories;
    }

    const analysis = JSON.parse(jsonMatch[0]);

    // Update stories with analysis results
    const updatedStories = stories.map(story => {
      const storyAnalysis = analysis.analysis?.find(
        (a: { storyId: string }) => a.storyId === story.id
      );

      if (storyAnalysis) {
        const matchedIssue = storyAnalysis.matchedIssueIid
          ? existingIssues.find(i => i.iid === storyAnalysis.matchedIssueIid)
          : null;

        return {
          ...story,
          hasExistingIssue: storyAnalysis.status === 'duplicate',
          matchedIssueId: matchedIssue?.id,
          matchedIssueIid: matchedIssue?.iid,
          similarityScore: storyAnalysis.similarityScore
        };
      }
      return story;
    });

    console.log('[analyzeStoryDuplicates] Analysis complete');
    return updatedStories;
  } catch (e) {
    console.error('[analyzeStoryDuplicates] Error:', e);
    return stories;
  }
}

/**
 * Generate a well-formatted issue description from a user story
 */
export async function generateIssueDescription(
  story: ParsedUserStory,
  epicTitle: string,
  epicContext: string
): Promise<string> {
  if (!currentConfig) {
    // Return basic description if no AI available
    return story.description;
  }

  const systemPrompt = `You are a technical writer creating GitLab issue descriptions.
Create a clear, actionable issue description from the user story.

FORMAT:
## Description
[Clear description of what needs to be done]

## User Story
[Original user story]

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Technical Notes
[Any technical considerations]

## Related Epic
[Epic reference]

RULES:
1. Be specific and actionable
2. Include 3-5 acceptance criteria
3. Keep it concise but complete
4. Use markdown formatting`;

  const userPrompt = `EPIC: ${epicTitle}

USER STORY: ${story.rawText}

EPIC CONTEXT (for reference):
${epicContext.slice(0, 1500)}

Generate a well-formatted issue description:`;

  try {
    const response = await callAI(currentConfig, systemPrompt, userPrompt);
    return response.trim();
  } catch (e) {
    console.error('[generateIssueDescription] Error:', e);
    return story.description;
  }
}

// ===========================================
// PREMIUM 7-STAGE PIPELINE (Stages 1-5)
// Replaces simple refine feature in Epic Editor
// ===========================================

/**
 * Helper: Parse JSON from AI response with cleanup
 */
function parseJSONResponse<T>(response: string, context: string): T {
  // Guard against empty/null responses
  if (!response || response.trim().length === 0) {
    console.error(`[${context}] Received empty response from AI`);
    throw new Error(`${context}: AI returned an empty response. This is usually a transient API issue — please try again.`);
  }

  let cleaned = response.trim();

  // Remove markdown code fences
  cleaned = cleaned
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Handle potential JSON not at start
  if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch (error) {
    console.error(`[${context}] JSON parse failed:`, error);
    console.error(`[${context}] Raw response (first 500 chars):`, response.substring(0, 500));
    throw new Error(`${context}: Failed to parse AI response as JSON. The AI may have returned malformed output — please try again.`);
  }
}

// ===========================================
// DYNAMIC SECTION SKILLS
// ===========================================

import categoryTemplatesData from './categoryTemplates.json';

// Type alias for backward compatibility
type LoadedCategoryTemplate = RichCategoryTemplate;

/**
 * Normalize section title for comparison
 * Removes special characters and converts to lowercase
 */
function normalizeTitle(title: string): string {
  return title.toLowerCase().trim();
}

/**
 * SKILL: Load Category Template
 * Loads section configuration from JSON based on category
 * Supports both legacy and rich template formats
 */
export function loadCategoryTemplate(category: EpicCategory): RichCategoryTemplate {
  const templates = categoryTemplatesData as RichTemplateData;
  const template = templates[category];

  if (!template) {
    // Fallback to technical_design if unknown category
    const fallback = templates['technical_design'];
    if (fallback) return fallback;

    // Ultimate fallback if no template exists
    return {
      requiredSections: {
        'Objective': { target: 80, max: 120 },
        'Architecture': { target: 150, max: 220 }
      },
      optionalSections: {},
      tone: 'precise-technical',
      storyStyle: 'technical',
      architectureFocus: 'detailed-components',
      expertRole: 'software architect',
      description: 'Default technical template'
    };
  }

  return template;
}

/**
 * Find a section config by title in the template
 * Searches both required and optional sections, including subsections
 */
export function findSectionConfig(
  sectionTitle: string,
  template: RichCategoryTemplate
): RichSectionConfig | undefined {
  const normalizedSearch = normalizeTitle(sectionTitle);

  // Search required sections
  for (const [name, config] of Object.entries(template.requiredSections)) {
    if (normalizeTitle(name) === normalizedSearch ||
        normalizeTitle(name).includes(normalizedSearch) ||
        normalizedSearch.includes(normalizeTitle(name))) {
      return config;
    }
    // Check subsections
    if (config.subsections) {
      for (const [subName, subConfig] of Object.entries(config.subsections)) {
        if (normalizeTitle(subName) === normalizedSearch ||
            normalizeTitle(subName).includes(normalizedSearch)) {
          return subConfig;
        }
      }
    }
  }

  // Search optional sections
  for (const [name, config] of Object.entries(template.optionalSections)) {
    if (normalizeTitle(name) === normalizedSearch ||
        normalizeTitle(name).includes(normalizedSearch) ||
        normalizedSearch.includes(normalizeTitle(name))) {
      return config;
    }
    // Check subsections
    if (config.subsections) {
      for (const [subName, subConfig] of Object.entries(config.subsections)) {
        if (normalizeTitle(subName) === normalizedSearch ||
            normalizeTitle(subName).includes(normalizedSearch)) {
          return subConfig;
        }
      }
    }
  }

  return undefined;
}

/**
 * Get word limits for a section (target and max)
 * Supports both legacy wordLimit and new target/max format
 */
export function getSectionWordLimits(
  sectionTitle: string,
  template: RichCategoryTemplate
): { target: number; max: number } {
  const section = findSectionConfig(sectionTitle, template);

  if (!section) {
    return { target: 100, max: 150 };
  }

  return {
    target: section.target ?? section.wordLimit ?? 100,
    max: section.max ?? section.wordLimit ?? 150
  };
}

/**
 * Get section format configuration
 * Returns format type, columns, and AI hint
 */
export function getSectionFormat(
  sectionTitle: string,
  template: RichCategoryTemplate
): { format?: SectionFormat; columns?: string[]; hint?: string; diagram?: string; collapsible?: boolean } {
  const section = findSectionConfig(sectionTitle, template);

  if (!section) {
    return {};
  }

  return {
    format: section.format,
    columns: section.columns,
    hint: section.hint,
    diagram: section.diagram,
    collapsible: section.collapsible
  };
}

/**
 * Get global template defaults (emoji, markdown features)
 */
export function getGlobalDefaults(): GlobalTemplateDefaults {
  const templates = categoryTemplatesData as RichTemplateData;
  return templates._meta?.globalDefaults || {
    statusEmoji: {
      draft: '📝',
      in_review: '🔍',
      approved: '✅',
      in_progress: '🚧',
      completed: '🎉',
      blocked: '🚫'
    },
    priorityLevels: {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🟢'
    },
    reviewStates: {
      pending: '⏳',
      changes_requested: '🔄',
      approved: '✅',
      rejected: '❌'
    },
    markdownFeatures: {
      tableOfContents: '[[_TOC_]]',
      alerts: ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'],
      mermaidDiagrams: true,
      taskLists: true,
      collapsibleSections: true
    }
  };
}

/**
 * Get progressive disclosure configuration
 */
export function getProgressiveDisclosure(
  template: RichCategoryTemplate
): ProgressiveDisclosure | undefined {
  return template.progressiveDisclosure;
}

/**
 * Get word limit for a section from template (legacy compatibility)
 */
export function getSectionWordLimit(
  sectionTitle: string,
  template: RichCategoryTemplate
): number {
  const { target } = getSectionWordLimits(sectionTitle, template);
  return target;
}

/**
 * SKILL: Extract Project Title from Epic
 * Finds the main title (# Title) from the epic markdown
 * Falls back to first meaningful line if no # header found
 */
export function extractProjectTitle(epicContent: string): string {
  const lines = epicContent.split('\n');

  // Look for # Title (H1 header) - the main epic title
  for (const line of lines) {
    const h1Match = line.match(/^#\s+(.+)$/);
    if (h1Match) {
      // Found H1 header - clean it up
      let title = h1Match[1].trim();
      // Remove any trailing numbers like "1." or section indicators
      title = title.replace(/^\d+\.\s*/, '').trim();
      // Remove any markdown formatting
      title = title.replace(/[*_`]/g, '').trim();
      if (title.length > 0) {
        return title;
      }
    }
  }

  // Fallback: Look for the first non-empty, non-metadata line
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines, metadata, and common non-title patterns
    if (!trimmed ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('|') ||
        trimmed.startsWith('-') ||
        trimmed.startsWith('Generated') ||
        trimmed.startsWith('[[') ||
        trimmed.startsWith('#')) {
      continue;
    }
    // Use first meaningful text line (truncate if too long)
    if (trimmed.length > 5) {
      return trimmed.length > 80 ? trimmed.substring(0, 80).trim() : trimmed;
    }
  }

  return 'Epic';
}

/**
 * SKILL: Discover Sections
 * Parses the epic markdown to find existing sections dynamically
 * Returns discovered sections with their content (NOT hardcoded 17)
 */
export function discoverSections(epicContent: string): DiscoveredSection[] {
  const sections: DiscoveredSection[] = [];
  const lines = epicContent.split('\n');

  let currentSection: {
    title: string;
    startLine: number;
    content: string[];
  } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match section headers: ## 1. Title or ## Title
    const sectionMatch = line.match(/^##\s+(?:\d+\.\s*)?(.+)$/);

    if (sectionMatch) {
      // Save previous section if exists
      if (currentSection) {
        const content = currentSection.content.join('\n').trim();
        sections.push({
          title: currentSection.title,
          normalizedTitle: normalizeTitle(currentSection.title),
          content,
          startLine: currentSection.startLine,
          endLine: i - 1,
          wordCount: content.split(/\s+/).filter(Boolean).length,
          hasSubsections: currentSection.content.some(l => /^###\s+/.test(l))
        });
      }

      // Start new section
      currentSection = {
        title: sectionMatch[1].trim(),
        startLine: i,
        content: []
      };
    } else if (currentSection) {
      currentSection.content.push(line);
    }
  }

  // Don't forget the last section
  if (currentSection) {
    const content = currentSection.content.join('\n').trim();
    sections.push({
      title: currentSection.title,
      normalizedTitle: normalizeTitle(currentSection.title),
      content,
      startLine: currentSection.startLine,
      endLine: lines.length - 1,
      wordCount: content.split(/\s+/).filter(Boolean).length,
      hasSubsections: currentSection.content.some(l => /^###\s+/.test(l))
    });
  }

  return sections;
}

/**
 * SKILL: Match Section to Template
 * Checks if a discovered section matches any required/optional section
 */
export function matchSectionToTemplate(
  sectionTitle: string,
  template: LoadedCategoryTemplate
): { isRequired: boolean; matchedName: string | null; wordLimit: number } {
  const normalizedTitle = normalizeTitle(sectionTitle);

  // Check required sections
  for (const [name, config] of Object.entries(template.requiredSections)) {
    const normalizedRequired = normalizeTitle(name);
    if (normalizedTitle.includes(normalizedRequired) || normalizedRequired.includes(normalizedTitle)) {
      // Support both legacy wordLimit and new target/max format
      const wordLimit = config.target ?? config.wordLimit ?? 100;
      return { isRequired: true, matchedName: name, wordLimit };
    }
  }

  // Check optional sections
  for (const [name, config] of Object.entries(template.optionalSections)) {
    const normalizedOptional = normalizeTitle(name);
    if (normalizedTitle.includes(normalizedOptional) || normalizedOptional.includes(normalizedTitle)) {
      // Support both legacy wordLimit and new target/max format
      const wordLimit = config.target ?? config.wordLimit ?? 100;
      return { isRequired: false, matchedName: name, wordLimit };
    }
  }

  return { isRequired: false, matchedName: null, wordLimit: 100 };
}

// Sections that should never be auto-generated (kept for template reference only)
// NOTE: Removed 'metadata header' and 'tl;dr' - these ARE now auto-generated
const EXCLUDED_AUTO_SECTIONS: string[] = []; // Empty - all template sections are now generated

/**
 * SKILL: Find Missing Required Sections
 * Compares discovered sections against category template
 * Excludes TOC, Metadata Header, and TL;DR from auto-generation
 */
export function findMissingRequiredSections(
  discovered: DiscoveredSection[],
  template: LoadedCategoryTemplate
): string[] {
  const missing: string[] = [];
  const normalizedDiscovered = discovered.map(s => s.normalizedTitle);

  for (const sectionName of Object.keys(template.requiredSections)) {
    const normalizedRequired = normalizeTitle(sectionName);

    // Skip sections that should not be auto-generated
    if (EXCLUDED_AUTO_SECTIONS.some(excluded => normalizedRequired.includes(excluded))) {
      continue;
    }

    const found = normalizedDiscovered.some(d =>
      d.includes(normalizedRequired) || normalizedRequired.includes(d)
    );

    if (!found) {
      missing.push(sectionName);
    }
  }

  return missing;
}

// ===========================================
// STAGE 1: DEEP COMPREHENSION
// ===========================================

/**
 * Stage 1: Build complete mental model of the epic
 * Extracts project essence, entities, gaps, and risks
 */
export async function runStage1Comprehension(
  epicContent: string
): Promise<ComprehensionOutput> {
  if (!currentConfig) {
    throw new Error('AI is not configured. Please check Settings.');
  }

  const systemPrompt = `You are an expert technical analyst performing deep comprehension of a software epic document.

YOUR TASK:
1. Parse the full epic content with complete context
2. Extract semantic meaning of each section (intent vs actual)
3. Build internal model: project, audience, problem, moving parts
4. Identify implicit knowledge author assumed but didn't write
5. Surface hidden assumptions and unstated dependencies

OUTPUT FORMAT:
Return ONLY valid JSON (no markdown fences) with this structure:
{
  "projectEssence": "<2-3 sentence summary of what this project IS>",
  "keyEntities": [
    {
      "entity": "<name>",
      "type": "service|database|api|user|system|external|other",
      "relationships": ["<related entity names>"],
      "description": "<what this entity does>"
    }
  ],
  "detectedGaps": ["<things referenced but never defined>"],
  "implicitRisks": ["<risks author didn't explicitly call out>"],
  "semanticSections": [
    {
      "sectionNum": <number>,
      "sectionTitle": "<title>",
      "semanticPurpose": "<what this section tries to achieve>",
      "keyTopics": ["<topic1>", "<topic2>"],
      "references": ["<cross-references to other sections>"],
      "implicitContent": ["<content author assumed but didn't write>"]
    }
  ]
}

ANALYSIS GUIDELINES:
- Look for undefined acronyms, mentioned but unexplained systems
- Identify dependencies that aren't explicitly stated
- Note when sections promise something that isn't delivered elsewhere
- Flag technical assumptions that may not hold`;

  const userPrompt = `Analyze this epic document for deep comprehension:

${epicContent}

Return comprehensive analysis as JSON:`;

  const response = await callAI(currentConfig, systemPrompt, userPrompt);

  const parsed = parseJSONResponse<{
    projectEssence?: string;
    keyEntities?: EntityRelationship[];
    detectedGaps?: string[];
    implicitRisks?: string[];
    semanticSections?: SemanticSection[];
  }>(response, 'Stage 1 Comprehension');

  const baseComprehension: ComprehensionOutput = {
    projectEssence: parsed.projectEssence || 'Project analysis pending',
    keyEntities: parsed.keyEntities || [],
    detectedGaps: parsed.detectedGaps || [],
    implicitRisks: parsed.implicitRisks || [],
    semanticSections: parsed.semanticSections || [],
    timestamp: Date.now()
  };

  // Refinement Process Step 1 + 2: Requirement Extraction + Gap Analysis
  try {
    const reqExtraction = await runRequirementExtraction(epicContent, baseComprehension);
    return {
      ...baseComprehension,
      extractedRequirements: reqExtraction.extractedRequirements || [],
      requirementCount: reqExtraction.requirementCount || 0,
      gapAnalysis: reqExtraction.gapAnalysis || [],
      validOpenQuestions: reqExtraction.validOpenQuestions || [],
    };
  } catch (error) {
    console.warn('[Stage 1] Requirement extraction failed, continuing without:', error);
    return baseComprehension;
  }
}

/**
 * Refinement Process Steps 1 & 2: Extract every distinct requirement + gap analysis.
 * Called as second AI call within Stage 1.
 */
async function runRequirementExtraction(
  epicContent: string,
  comprehension: ComprehensionOutput
): Promise<{
  extractedRequirements: ExtractedRequirement[];
  requirementCount: number;
  gapAnalysis: RequirementGap[];
  validOpenQuestions: string[];
}> {
  if (!currentConfig) {
    return { extractedRequirements: [], requirementCount: 0, gapAnalysis: [], validOpenQuestions: [] };
  }

  const systemPrompt = `You are a requirements engineer performing STEP 1 and STEP 2 of The Refinement Process.

STEP 1: REQUIREMENT EXTRACTION
Read the entire source document. Extract every distinct requirement as a numbered list.

What counts as a requirement:
- Any action the source says must happen ("migrate to X", "add support for Y")
- Any enhancement to existing systems ("enhance pipeline to handle Z")
- Any infrastructure/operational change ("disable deletion on server X", "establish network path")
- Any constraint or specification ("use schema file from vendor X", "trigger from Kafka not polling")
- Any stated decision ("existing flow must remain unchanged")
- Any integration point ("pull file from system A, write to system B")

Extraction rules:
- One sentence can contain MULTIPLE requirements if they describe truly independent deliverables.
  Example: "Enhance the pipeline to support MD5 and parse enclosed fields" is TWO requirements (MD5 support + enclosure parsing).
- Infrastructure items are FULL requirements. "Set up connectivity between A and B" requires firewall rules, credentials, validation.
- Preserve every technical specific exactly: algorithms, protocols, formats, trigger mechanisms, system names, field names.
- Do NOT skip requirements because they seem minor.
- GRANULARITY GUIDE (CRITICAL): You MUST produce 5-15 requirements. If you have more than 15, you are over-splitting — merge related items. A 400-word document should have 5-8 requirements, not 20+. Group related sub-items: "support OAuth 2.0 with Google and GitHub SSO" is ONE requirement, not three. Each bullet point in a list is NOT automatically a separate requirement — group by theme/capability.

STEP 2: GAP ANALYSIS
For each extracted requirement, assess:
- Does the source provide enough detail to implement it?
- Valid open questions: source genuinely doesn't answer (e.g., "What API does system X expose?")
- Invalid open questions: source DOES answer this — it's a requirement, not a gap.
  If the source says "add MD5 support", "Should we support MD5?" is NOT an open question.

OUTPUT FORMAT (JSON only, no markdown fences):
{
  "extractedRequirements": [
    {
      "reqNum": 1,
      "description": "<what must be done>",
      "sourceSection": "<section title where found>",
      "sourceText": "<exact quote from source, max 200 chars>",
      "category": "functional|non-functional|infrastructure|operational"
    }
  ],
  "requirementCount": <total count — THIS IS THE CONTRACT>,
  "gapAnalysis": [
    {
      "reqNum": 1,
      "hasEnoughDetail": true,
      "openQuestions": ["<legitimate unknowns>"],
      "detailLevel": "complete|partial|minimal"
    }
  ],
  "validOpenQuestions": ["<questions the source genuinely leaves unanswered>"]
}`;

  const userPrompt = `PROJECT ESSENCE: ${comprehension.projectEssence}

SOURCE DOCUMENT:
${epicContent.substring(0, 15000)}

Extract ALL requirements (numbered list) and perform gap analysis. Count them — this count is the contract:`;

  const response = await callAI(currentConfig, systemPrompt, userPrompt);
  const parsed = parseJSONResponse<{
    extractedRequirements?: ExtractedRequirement[];
    requirementCount?: number;
    gapAnalysis?: RequirementGap[];
    validOpenQuestions?: string[];
  }>(response, 'Requirement Extraction');

  console.log(`[Stage 1] Extracted ${parsed.requirementCount || parsed.extractedRequirements?.length || 0} requirements`);

  return {
    extractedRequirements: parsed.extractedRequirements || [],
    requirementCount: parsed.requirementCount || parsed.extractedRequirements?.length || 0,
    gapAnalysis: parsed.gapAnalysis || [],
    validOpenQuestions: parsed.validOpenQuestions || [],
  };
}

// ===========================================
// STAGE 2: CATEGORY CLASSIFICATION
// ===========================================

/**
 * Stage 2: Classify the document type for downstream treatment
 */
export async function runStage2Classification(
  epicContent: string,
  comprehension: ComprehensionOutput
): Promise<ClassificationOutput> {
  if (!currentConfig) {
    throw new Error('AI is not configured. Please check Settings.');
  }

  const categoryList = [
    'business_requirement - Business requirements, ROI focus, executive stakeholders',
    'technical_design - Technical architecture, system design, implementation details',
    'feature_specification - User features, acceptance criteria, user flows',
    'api_specification - API endpoints, request/response schemas, integration',
    'infrastructure_design - Cloud infrastructure, deployment, scaling, monitoring',
    'migration_plan - Data/system migration, rollback plans, timeline',
    'integration_spec - System integration, data flows between systems'
  ].join('\n');

  const systemPrompt = `You are an expert document classifier for software technical documents.

YOUR TASK:
1. Analyze the epic content and comprehension summary
2. Determine the PRIMARY document category
3. Assign confidence score (0-1)
4. Identify if author's intent differs from actual content
5. Select appropriate configuration for downstream processing

CATEGORIES:
${categoryList}

OUTPUT FORMAT:
Return ONLY valid JSON (no markdown fences):
{
  "primaryCategory": "<category_id>",
  "confidence": <0.0-1.0>,
  "secondaryCategory": "<optional category if confidence < 0.85>",
  "intentMismatch": {
    "authorIntent": "<what author seems to want>",
    "actualCategory": "<what content actually is>"
  },
  "reasoning": "<why this classification>"
}

Set intentMismatch to null if there's no mismatch.

DECISION RULES:
- If content focuses on business value, stakeholders, ROI -> business_requirement
- If content has detailed system components, APIs -> technical_design
- If content emphasizes user journeys, acceptance criteria -> feature_specification
- If content defines endpoints, schemas, examples -> api_specification
- If content covers deployment, scaling, infra -> infrastructure_design
- If content has current state, target state, migration steps -> migration_plan
- If content focuses on system-to-system communication -> integration_spec`;

  const entitiesSummary = comprehension.keyEntities
    .slice(0, 10)
    .map(e => `- ${e.entity} (${e.type}): ${e.description}`)
    .join('\n');

  const userPrompt = `COMPREHENSION SUMMARY:
${comprehension.projectEssence}

KEY ENTITIES:
${entitiesSummary}

EPIC CONTENT (first 8000 chars):
${epicContent.substring(0, 8000)}

Classify this document:`;

  const response = await callAI(currentConfig, systemPrompt, userPrompt);

  const parsed = parseJSONResponse<{
    primaryCategory?: string;
    confidence?: number;
    secondaryCategory?: string;
    intentMismatch?: { authorIntent: string; actualCategory: string } | null;
    reasoning?: string;
  }>(response, 'Stage 2 Classification');

  const category = (parsed.primaryCategory || 'technical_design') as EpicCategory;

  // Properly type the intentMismatch if present
  const intentMismatch = parsed.intentMismatch ? {
    authorIntent: parsed.intentMismatch.authorIntent,
    actualCategory: parsed.intentMismatch.actualCategory as EpicCategory
  } : undefined;

  return {
    primaryCategory: category,
    confidence: parsed.confidence || 0.8,
    secondaryCategory: parsed.secondaryCategory as EpicCategory | undefined,
    intentMismatch,
    categoryConfig: CATEGORY_CONFIGS[category] || CATEGORY_CONFIGS.technical_design,
    reasoning: parsed.reasoning || ''
  };
}

// ===========================================
// STAGE 3: STRUCTURAL ASSESSMENT (Dynamic)
// ===========================================

/**
 * Stage 3: Discover sections dynamically and score them
 * Uses discovered sections (NOT hardcoded 17)
 */
export async function runStage3Structural(
  epicContent: string,
  comprehension: ComprehensionOutput,
  classification: ClassificationOutput
): Promise<StructuralOutput> {
  if (!currentConfig) {
    throw new Error('AI is not configured. Please check Settings.');
  }

  // SKILL: Discover sections dynamically from the epic
  const discovered = discoverSections(epicContent);

  // SKILL: Load category template
  const template = loadCategoryTemplate(classification.primaryCategory);

  // SKILL: Find missing required sections
  const missingSections = findMissingRequiredSections(discovered, template);

  // Build section info for AI
  const existingSections = discovered
    .map(s => `"${s.title}" (${s.wordCount} words, lines ${s.startLine}-${s.endLine})`)
    .join('\n');

  const requiredNames = Object.keys(template.requiredSections).join(', ');
  const optionalNames = Object.keys(template.optionalSections).join(', ');

  const systemPrompt = `You are an expert ${template.expertRole} analyzing document structure.

DISCOVERED SECTIONS (from parsing, NOT hardcoded):
${existingSections}

CATEGORY: ${classification.primaryCategory.replace(/_/g, ' ')}
REQUIRED SECTIONS: ${requiredNames}
OPTIONAL SECTIONS: ${optionalNames}

YOUR TASK:
1. Score ONLY the discovered sections (by title) on 3 dimensions (1-10):
   - Completeness: covers what it should for this category
   - Relevance: belongs here or is noise
   - Placement: right position in document flow
2. Decide transformation for each:
   - keep: ALL scores >= 8 (don't touch it!)
   - restructure: good content, poor organization
   - merge: >60% overlap with another (specify mergeWith)
   - split: covers multiple concerns (specify splitInto)
   - add: for missing required sections only

IMPORTANT: Use section TITLES as identifiers, not numbers!

OUTPUT FORMAT (JSON only, no markdown):
{
  "sectionScores": [
    {
      "sectionTitle": "<exact title>",
      "completeness": <1-10>,
      "relevance": <1-10>,
      "placement": <1-10>,
      "overallScore": <average>
    }
  ],
  "transformationPlan": [
    {
      "sectionTitle": "<exact title>",
      "action": "keep|restructure|merge|split|add",
      "rationale": "<brief reason>",
      "mergeWith": "<other section title if merge>",
      "splitInto": ["<section1>", "<section2>"]
    }
  ],
  "proposedOutline": ["<optimal section order by title>"]
}`;

  const userPrompt = `PROJECT ESSENCE:
${comprehension.projectEssence}

DETECTED GAPS:
${comprehension.detectedGaps.join('\n') || 'None detected'}

FULL EPIC CONTENT:
${epicContent.substring(0, 15000)}

Analyze structure and score each discovered section:`;

  const response = await callAI(currentConfig, systemPrompt, userPrompt);

  const parsed = parseJSONResponse<{
    sectionScores?: Array<{
      sectionTitle: string;
      completeness: number;
      relevance: number;
      placement: number;
      overallScore: number;
    }>;
    transformationPlan?: Array<{
      sectionTitle: string;
      action: string;
      rationale: string;
      mergeWith?: string;
      splitInto?: string[];
    }>;
    proposedOutline?: string[];
  }>(response, 'Stage 3 Structural');

  // Convert to proper types
  const sectionScores: SectionScore[] = (parsed.sectionScores || []).map(s => ({
    sectionTitle: s.sectionTitle,
    completeness: s.completeness,
    relevance: s.relevance,
    placement: s.placement,
    overallScore: s.overallScore
  }));

  const transformationPlan: TransformationAction[] = (parsed.transformationPlan || []).map(t => ({
    sectionTitle: t.sectionTitle,
    action: t.action as 'keep' | 'restructure' | 'merge' | 'split' | 'add',
    rationale: t.rationale,
    mergeWith: t.mergeWith,
    splitInto: t.splitInto
  }));

  return {
    sectionScores,
    transformationPlan,
    missingSections,
    proposedOutline: parsed.proposedOutline || []
  };
}

// ===========================================
// FORMAT GENERATOR UTILITIES
// ===========================================

/**
 * Get format instruction for AI based on section format type
 */
export function getFormatInstruction(format: SectionFormat | undefined, columns?: string[]): string {
  if (!format) return '';

  const columnStr = columns?.join(', ') || '';

  switch (format) {
    case 'raci-table':
      return `FORMAT: Create a RACI matrix table with columns: ${columnStr || 'Activity, Responsible, Accountable, Consulted, Informed'}. Each row must have exactly ONE Accountable person (marked in bold).`;

    case 'priority-table':
      return `FORMAT: Create a priority table using emoji indicators for priority column: 🔴 Critical, 🟠 High, 🟡 Medium, 🟢 Low. Columns: ${columnStr}`;

    case 'risk-heat-map-and-register':
      return `FORMAT: First create a 5x5 risk heat map using emoji (likelihood vs impact):
|  | Negligible | Minor | Moderate | Major | Severe |
|--|------------|-------|----------|-------|--------|
| Almost Certain | 🟡 | 🟠 | 🔴 | 🔴 | 🔴 |
| Likely | 🟢 | 🟡 | 🟠 | 🔴 | 🔴 |
| Possible | 🟢 | 🟡 | 🟡 | 🟠 | 🔴 |
| Unlikely | 🟢 | 🟢 | 🟡 | 🟡 | 🟠 |
| Rare | 🟢 | 🟢 | 🟢 | 🟡 | 🟡 |

Then add a detailed risk register table with columns: Risk, Likelihood, Impact, Mitigation, Owner.`;

    case 'metrics-table':
      return `FORMAT: Create a metrics table with columns: ${columnStr || 'Metric, Current, Target, Measurement Method'}. Every metric MUST have quantified values - no TBD or vague descriptions.`;

    case 'slo-table':
      return `FORMAT: Create an SLO/SLI table with columns: ${columnStr || 'Metric (SLI), Current, Target SLO, Error Budget, Measurement'}. Use specific percentages and time values.`;

    case 'phase-table':
      return `FORMAT: Create a phase/timeline table with columns: ${columnStr}. Each phase should have clear deliverables and exit criteria.`;

    case 'task-list-and-table':
      return `FORMAT: Use GitLab task list checkboxes (- [ ] for incomplete, - [x] for complete) followed by a summary table with columns: ${columnStr || 'Item, Status, Owner'}`;

    case 'endpoint-blocks':
      return `FORMAT: Document each endpoint in a structured block:
### \`METHOD /path\`
**Description:** Brief description
**Request:**
\`\`\`json
{ request schema }
\`\`\`
**Response:**
\`\`\`json
{ response schema }
\`\`\``;

    case 'error-table':
      return `FORMAT: Create an error table with columns: ${columnStr || 'Code, Name, Description, Resolution'}. Include both HTTP status codes and application-specific error codes.`;

    case 'schema-table':
      return `FORMAT: Create a schema table with columns: ${columnStr || 'Field, Type, Required, Description'}. For nested objects, use indentation with "├─" prefix.`;

    case 'numbered-procedure':
      return `FORMAT: Use numbered steps (1., 2., 3.) with clear action verbs. Each step should be atomic and verifiable. Include checkpoints where appropriate.`;

    case 'mapping-table':
      return `FORMAT: Create a field mapping table with columns: ${columnStr || 'Source Field, Target Field, Transformation, Notes'}. Use code formatting for field names.`;

    case 'comparison-table-and-prose':
      return `FORMAT: First provide a comparison table with columns: ${columnStr || 'Option, Pros, Cons, Recommendation'}. Then follow with a brief prose explanation of the chosen approach.`;

    case 'code-blocks':
      return `FORMAT: Use fenced code blocks with language identifiers. Include examples in multiple languages where appropriate (JavaScript, Python, curl).`;

    case 'bullet-list':
      return `FORMAT: Use bullet points (- ) for each item. Keep items concise and parallel in structure.`;

    case 'table':
      return `FORMAT: Create a markdown table with columns: ${columnStr}. Use proper alignment for numerical data.`;

    case 'mermaid-sequence':
      return `FORMAT: Include a Mermaid sequence diagram showing the data/control flow:
\`\`\`mermaid
sequenceDiagram
    participant A
    participant B
    A->>B: Request
    B-->>A: Response
\`\`\``;

    default:
      return '';
  }
}

/**
 * Generate RACI table template
 */
export function generateRACITable(activities: string[]): string {
  let table = '| Activity | Responsible | Accountable | Consulted | Informed |\n';
  table += '|----------|-------------|-------------|-----------|----------|\n';
  for (const activity of activities) {
    table += `| ${activity} | TBD | **TBD** | TBD | TBD |\n`;
  }
  return table;
}

/**
 * Generate Risk Heat Map
 */
export function generateRiskHeatMap(): string {
  const header = '|  | Negligible | Minor | Moderate | Major | Severe |\n';
  const divider = '|--|------------|-------|----------|-------|--------|\n';
  const rows = [
    '| Almost Certain | 🟡 | 🟠 | 🔴 | 🔴 | 🔴 |',
    '| Likely | 🟢 | 🟡 | 🟠 | 🔴 | 🔴 |',
    '| Possible | 🟢 | 🟡 | 🟡 | 🟠 | 🔴 |',
    '| Unlikely | 🟢 | 🟢 | 🟡 | 🟡 | 🟠 |',
    '| Rare | 🟢 | 🟢 | 🟢 | 🟡 | 🟡 |'
  ];
  return header + divider + rows.join('\n');
}

/**
 * Generate Priority Table header
 */
export function generatePriorityTable(columns: string[]): string {
  let table = '| ' + columns.join(' | ') + ' |\n';
  table += '|' + columns.map(() => '---').join('|') + '|\n';
  return table;
}

/**
 * Generate SLA/SLO Table template
 */
export function generateSLOTable(): string {
  return `| Metric (SLI) | Current | Target SLO | Error Budget | Measurement |
|--------------|---------|------------|--------------|-------------|
| Availability | TBD | 99.9% | 0.1% | Uptime monitoring |
| P99 Latency | TBD | <200ms | N/A | APM |
| Error Rate | TBD | <0.1% | 0.1% | Log aggregation |`;
}

/**
 * Generate Metadata Header table
 */
export function generateMetadataHeader(
  fields: string[],
  projectName: string,
  defaults: GlobalTemplateDefaults
): string {
  let header = '| Field | Value |\n|-------|-------|\n';
  for (const field of fields) {
    const value = getDefaultFieldValue(field, projectName, defaults);
    header += `| ${field} | ${value} |\n`;
  }
  return header;
}

/**
 * Get default value for a metadata field
 */
function getDefaultFieldValue(
  field: string,
  _projectName: string,
  defaults: GlobalTemplateDefaults
): string {
  const lowerField = field.toLowerCase();

  if (lowerField.includes('status')) {
    return `${defaults.statusEmoji.draft} Draft`;
  }
  if (lowerField.includes('owner') || lowerField.includes('author')) {
    return 'TBD';
  }
  if (lowerField.includes('updated') || lowerField.includes('date')) {
    return new Date().toLocaleDateString();
  }
  if (lowerField.includes('version')) {
    return '1.0';
  }
  if (lowerField.includes('reviewer')) {
    return 'TBD';
  }
  return 'TBD';
}

// ===========================================
// STAGE 4: DYNAMIC CONTENT REFINEMENT
// ===========================================

/**
 * SKILL: Refine a single section (only if needed)
 * Skips sections with score >= 8 (keeps them as-is)
 * Enhanced with rich formatting hints
 */
async function refineSingleSectionDynamic(
  section: DiscoveredSection,
  score: SectionScore | undefined,
  transformation: TransformationAction | undefined,
  template: LoadedCategoryTemplate,
  projectName: string,      // Actual project title (e.g., "Mobile Payment System")
  projectEssence: string,   // Project description for context
  extractedRequirements: ExtractedRequirement[] = [],  // Step 1 requirements for 3A rules
  sectionFeedback?: string  // Layer 2: feedback from previous iteration
): Promise<PipelineRefinedSection> {
  // If score >= 8 on all dimensions, keep as-is
  if (score && score.completeness >= 8 && score.relevance >= 8 && score.placement >= 8) {
    return {
      sectionTitle: section.title,
      originalContent: section.content,
      refinedContent: `## ${section.title}\n\n${section.content}`,
      action: 'keep',
      changes: [],
      wasKept: true
    };
  }

  if (!currentConfig) {
    return {
      sectionTitle: section.title,
      originalContent: section.content,
      refinedContent: `## ${section.title}\n\n${section.content}`,
      action: 'keep',
      changes: ['AI not configured - kept original'],
      wasKept: true
    };
  }

  // Get word limits and format from template
  const { target, max } = getSectionWordLimits(section.title, template);
  const { format, columns, hint, collapsible } = getSectionFormat(section.title, template);
  const toneInstruction = TONE_INSTRUCTIONS[template.tone] || 'Write clearly';
  const action = transformation?.action || 'restructure';
  const formatInstruction = getFormatInstruction(format, columns);

  const systemPrompt = `You are an expert ${template.expertRole}. Refine this section for execution readiness.

SECTION: ${section.title}
WORD LIMIT: Target ${target} words, maximum ${max} words
TONE: ${template.tone} - ${toneInstruction}
${hint ? `GUIDANCE: ${hint}` : ''}
${formatInstruction ? `\n${formatInstruction}` : ''}

QUALITY RULES (non-negotiable):
1. Target ${target} words, never exceed ${max} words — be concise
2. NEVER invent information not present in the source content
3. NEVER expand scope beyond what the user wrote — if the source is thin, keep it thin
4. PRESERVE specific metrics, dates, numbers, and technical details from the source exactly
5. NO generic "textbook" content — every sentence must be specific to THIS project
6. Use correct terminology: SLO = internal reliability target, SLA = external customer commitment, SLI = what we measure
7. Start output with ## ${section.title}
8. Follow the specified format exactly if provided

REQUIREMENT PRESERVATION (critical):
- NEVER drop, remove, or omit any numbered items, bullet points, or specific requirements from the source
- If the source lists 7 requirements, ALL 7 must appear in the output — none may be silently removed
- Do NOT declare anything "out of scope" or "non-goal" unless the USER explicitly said it is out of scope
- Do NOT make design decisions that contradict the user's stated requirements
- Do NOT merge multiple distinct requirements into one vague paragraph
- If you cannot fully address a requirement within the word limit, keep it as a brief bullet rather than dropping it

ANTI-PATTERNS TO AVOID:
- Do NOT add motivational filler ("This is crucial for...", "This approach ensures...", "This setup ensures...", "This will be pivotal...")
- Do NOT repeat the project name or objective in every paragraph
- Do NOT add sections/topics the user did not mention (no scope creep)
- Do NOT convert specific bullet points into vague paragraphs — keep lists as lists
- Do NOT replace user-specified technologies with generic alternatives (if user says "Kafka trigger", do NOT replace with "scheduled polling")
- Do NOT use "**Decision**: ... **Tradeoff**: ..." formatting AT ALL — this is a banned pattern. Instead, explain design choices naturally within the prose. If a tradeoff exists, mention it briefly inline (e.g., "While X adds complexity, it provides Y")
- Do NOT pad each subsection with a "Decision" and "Tradeoff" line — this creates mechanical, template-like output
- Do NOT write "**Conclusion**" paragraphs that just restate what was already said
- Do NOT use "leverages", "facilitating", "streamlined", "robust" — use plain language
${extractedRequirements.length > 0 ? `
EXTRACTED REQUIREMENTS (THE CONTRACT — all relevant ones must be traceable):
${extractedRequirements.map(r => `[Req #${r.reqNum}] ${r.description}`).join('\n')}

STEP 3A — CONTENT INTEGRITY (mandatory):
- No requirement left behind: every Req # relevant to THIS section MUST appear
- No scope invention: do NOT add "non-goals" or "out of scope" unless the source explicitly states it
- No decision invention: do NOT change the source's approach (e.g., Kafka→polling, MD5→SHA256)
- No tech substitution: preserve exact algorithms, protocols, system names, field names
- Say it once: do NOT repeat the same info that belongs in another section
- 300-word ceiling: if this section exceeds ~300 words, it is either redundant or too broad
- Tag requirements inline: when addressing a requirement, include [Req #N] reference
- Replace [TBD] placeholders: if the source has [TBD], replace with a reasonable estimate or range based on industry standards (e.g., "[TBD] seconds" → "5 seconds" or "within 30 seconds"). NEVER output [TBD], [TODO], or [PLACEHOLDER]` : ''}

Return ONLY the refined section content (no JSON, just markdown).`;

  const userPrompt = `PROJECT NAME: ${projectName}
PROJECT CONTEXT: ${projectEssence.substring(0, 200)}

CURRENT CONTENT:
${section.content || '(empty)'}

Refine to target ${target} words (max ${max}). EVERY requirement, numbered item, and bullet point from the source MUST appear in the output. Improve clarity and structure but NEVER drop content. When referencing the project, use a short name:${sectionFeedback || ''}`;

  try {
    const response = await callAI(currentConfig, systemPrompt, userPrompt);
    let refinedContent = response.trim();

    // Ensure section has header
    if (!refinedContent.startsWith('##')) {
      refinedContent = `## ${section.title}\n\n${refinedContent}`;
    }

    // Wrap in collapsible if specified
    if (collapsible) {
      const headerMatch = refinedContent.match(/^(##\s+[^\n]+)\n+([\s\S]*)$/);
      if (headerMatch) {
        refinedContent = `<details>\n<summary>${headerMatch[1].replace(/^##\s+/, '')}</summary>\n\n${headerMatch[2]}\n\n</details>`;
      }
    }

    return {
      sectionTitle: section.title,
      originalContent: section.content,
      refinedContent,
      action: action as 'keep' | 'restructure' | 'merge' | 'split' | 'add',
      changes: ['Refined for clarity and tone', format ? `Applied ${format} format` : ''].filter(Boolean),
      wasKept: false
    };
  } catch (error) {
    console.error(`[Stage 4] Refine "${section.title}" failed:`, error);
    return {
      sectionTitle: section.title,
      originalContent: section.content,
      refinedContent: `## ${section.title}\n\n${section.content}`,
      action: 'keep',
      changes: ['Kept original due to error'],
      wasKept: true
    };
  }
}

/**
 * SKILL: Generate a missing required section
 * Enhanced with rich formatting hints
 */
async function generateMissingSectionDynamic(
  sectionTitle: string,
  comprehension: ComprehensionOutput,
  template: LoadedCategoryTemplate,
  projectName: string,  // Actual project title for AI prompts
  extractedRequirements: ExtractedRequirement[] = [],  // Step 1 requirements for 3A rules
  sectionFeedback?: string  // Layer 2: feedback from previous iteration
): Promise<PipelineRefinedSection> {
  if (!currentConfig) {
    return {
      sectionTitle,
      originalContent: '',
      refinedContent: `## ${sectionTitle}\n\n[TODO: Content needed]`,
      action: 'add',
      changes: ['Placeholder created'],
      wasKept: false
    };
  }

  // Get word limits and format from template
  const { target, max } = getSectionWordLimits(sectionTitle, template);
  const { format, columns, hint, collapsible } = getSectionFormat(sectionTitle, template);
  const toneInstruction = TONE_INSTRUCTIONS[template.tone] || 'Write clearly';
  const formatInstruction = getFormatInstruction(format, columns);

  const systemPrompt = `You are an expert ${template.expertRole}. Generate the "${sectionTitle}" section.

WORD LIMIT: Target ${target} words, maximum ${max} words
TONE: ${template.tone} - ${toneInstruction}
${hint ? `GUIDANCE: ${hint}` : ''}
${formatInstruction ? `\n${formatInstruction}` : ''}

QUALITY RULES (non-negotiable):
1. Target ${target} words, never exceed ${max} words
2. ONLY include content directly relevant to the project's stated scope and entities
3. Every statement must be specific to THIS project — no generic best-practice filler
4. Keep it short — if you don't have enough context to write substantively, write less (50-80 words) rather than padding
5. Start with ## ${sectionTitle}
6. Follow the specified format exactly if provided

CRITICAL RESTRICTIONS:
- Do NOT declare anything as "out of scope" or "non-goal" unless the user explicitly said it is out of scope
- Do NOT make design decisions that contradict the user's requirements (e.g., if user says "Kafka trigger", don't replace with "polling")
- Do NOT add technologies, services, or components the user did not mention (no "Web App", "Mobile App", "Stripe" if the user's project is a data pipeline)
- Do NOT invent specific numbers, dates, or metrics not inferable from the project context
- Derive ALL content from the project context provided — if the context doesn't mention a topic, write a brief placeholder (50 words max) rather than inventing content

ANTI-PATTERNS TO AVOID:
- Do NOT write generic paragraphs about industry best practices
- Do NOT repeat the project objective in every section
- Do NOT add motivational filler ("This is crucial...", "This ensures...", "This setup ensures...", "This will be pivotal...")
- Do NOT use "**Decision**: ... **Tradeoff**: ..." formatting AT ALL — this is a banned pattern. Explain design choices naturally within the prose
- Do NOT pad each subsection with a "Decision" and "Tradeoff" line — this creates mechanical, template-like output
- Do NOT write "**Conclusion**" paragraphs that just restate what was already said
- Do NOT use "leverages", "facilitating", "streamlined", "robust" — use plain language
- Be CONCISE — if the context only has 50 words of relevant information, write 50 words not 200
${extractedRequirements.length > 0 ? `
EXTRACTED REQUIREMENTS (THE CONTRACT):
${extractedRequirements.map(r => `[Req #${r.reqNum}] ${r.description}`).join('\n')}

STEP 3A — CONTENT INTEGRITY:
- Only address requirements relevant to "${sectionTitle}" — do NOT try to cover all requirements
- No scope invention: do NOT add "non-goals" unless the source explicitly states them
- No decision invention: preserve the source's stated approach
- No tech substitution: preserve exact algorithms, protocols, system names
- Tag requirements inline with [Req #N] when addressing them
- NEVER output [TBD], [TODO], or [PLACEHOLDER] — use concrete estimates or omit` : ''}`;

  const userPrompt = `PROJECT NAME: ${projectName}
PROJECT CONTEXT: ${comprehension.projectEssence.substring(0, 200)}

KEY INFO:
${comprehension.keyEntities.slice(0, 5).map(e => `- ${e.entity}: ${e.description}`).join('\n')}

Generate the section (target ${target} words, max ${max}). Stay within the project's stated scope. Do NOT add topics the user did not mention. If you lack context, keep it brief rather than adding filler:${sectionFeedback || ''}`;

  try {
    const response = await callAI(currentConfig, systemPrompt, userPrompt);
    let refinedContent = response.trim();

    // Ensure section has header
    if (!refinedContent.startsWith('##')) {
      refinedContent = `## ${sectionTitle}\n\n${refinedContent}`;
    }

    // Wrap in collapsible if specified
    if (collapsible) {
      const headerMatch = refinedContent.match(/^(##\s+[^\n]+)\n+([\s\S]*)$/);
      if (headerMatch) {
        refinedContent = `<details>\n<summary>${headerMatch[1].replace(/^##\s+/, '')}</summary>\n\n${headerMatch[2]}\n\n</details>`;
      }
    }

    return {
      sectionTitle,
      originalContent: '',
      refinedContent,
      action: 'add',
      changes: ['Generated from project context', format ? `Applied ${format} format` : ''].filter(Boolean),
      wasKept: false
    };
  } catch (error) {
    console.error(`[Stage 4] Generate "${sectionTitle}" failed:`, error);
    return {
      sectionTitle,
      originalContent: '',
      refinedContent: `## ${sectionTitle}\n\n[TODO: Content needed]`,
      action: 'add',
      changes: ['Placeholder due to error'],
      wasKept: false
    };
  }
}

/**
 * Stage 4: Dynamic refinement - only process sections that need work
 * Keeps sections with score >= 8, refines others
 */
export async function runStage4Refinement(
  epicContent: string,
  comprehension: ComprehensionOutput,
  classification: ClassificationOutput,
  structural: StructuralOutput,
  projectName: string,  // Original epic title - used in prompts for consistency
  onProgress?: (current: number, total: number, section: string) => void,
  iterationFeedback?: IterationFeedback  // Layer 2: feedback from previous iteration
): Promise<RefinementOutput> {
  // Load template with word limits
  const template = loadCategoryTemplate(classification.primaryCategory);

  // Discover sections dynamically
  const discovered = discoverSections(epicContent);
  const refinedSections: PipelineRefinedSection[] = [];

  // Count sections to process
  const sectionsToRefine = discovered.filter(d => {
    const score = structural.sectionScores.find(s => s.sectionTitle === d.title);
    return !score || score.overallScore < 8;
  });

  const total = sectionsToRefine.length + structural.missingSections.length;
  let processed = 0;
  let kept = 0;
  let refined = 0;
  let added = 0;

  // Process each discovered section with throttled concurrency
  // This prevents hitting API rate limits by limiting concurrent requests
  console.log(`[Stage 4] Processing ${discovered.length} sections with throttled concurrency...`);

  for (const section of discovered) {
    const score = structural.sectionScores.find(s =>
      s.sectionTitle.toLowerCase() === section.title.toLowerCase()
    );
    const transformation = structural.transformationPlan.find(t =>
      t.sectionTitle.toLowerCase() === section.title.toLowerCase()
    );

    // Layer 2: Build section-specific feedback if available
    const sectionFeedbackStr = iterationFeedback
      ? formatSectionFeedback(section.title, iterationFeedback.stage4Feedback, iterationFeedback.positiveAnchors)
      : undefined;

    // Use throttler to limit concurrent API calls
    // Pass projectName (actual title) for AI prompts, not projectEssence (description)
    const result = await apiThrottler.throttle(() =>
      refineSingleSectionDynamic(
        section,
        score,
        transformation,
        template,
        projectName,
        comprehension.projectEssence,
        comprehension.extractedRequirements || [],
        sectionFeedbackStr
      )
    );

    refinedSections.push(result);

    // Count result
    if (result.wasKept) {
      kept++;
    } else {
      refined++;
      processed++;
      if (onProgress) {
        onProgress(processed, total, result.sectionTitle || 'Processing...');
      }
    }
  }

  // Generate missing required sections with throttling
  // QUALITY SAFEGUARD: Cap auto-generated sections to prevent scope creep
  // If the user wrote 7 sections, don't auto-generate 10 more generic ones
  const MAX_AUTO_GENERATED = 5;
  const missingSectionsToGenerate = structural.missingSections.slice(0, MAX_AUTO_GENERATED);
  if (structural.missingSections.length > MAX_AUTO_GENERATED) {
    console.log(`[Stage 4] Capping auto-generated sections: ${structural.missingSections.length} missing → generating top ${MAX_AUTO_GENERATED}`);
  }

  for (const missingSectionTitle of missingSectionsToGenerate) {
    processed++;
    if (onProgress) {
      onProgress(processed, total, `Adding: ${missingSectionTitle}`);
    }

    // Layer 2: Build section-specific feedback for missing sections too
    const missingFeedbackStr = iterationFeedback
      ? formatSectionFeedback(missingSectionTitle, iterationFeedback.stage4Feedback, iterationFeedback.positiveAnchors)
      : undefined;

    // Use throttler to limit concurrent API calls
    // Pass projectName for consistent naming in generated content
    const generated = await apiThrottler.throttle(() =>
      generateMissingSectionDynamic(
        missingSectionTitle,
        comprehension,
        template,
        projectName,
        comprehension.extractedRequirements || [],
        missingFeedbackStr
      )
    );
    refinedSections.push(generated);
    added++;
  }

  return {
    refinedSections,
    sectionsKept: kept,
    sectionsRefined: refined,
    sectionsAdded: added,
    totalSections: refinedSections.length
  };
}

// ===========================================
// STAGE 5: MANDATORY SECTIONS
// ===========================================

/**
 * Convert RefinementOutput to RefinedData for blueprint generator
 */
function convertRefinementToRefinedData(refinement: RefinementOutput): RefinedData {
  const refinedData: RefinedData = {};

  // Map section titles to data keys
  const titleToKeyMap: Record<string, string[]> = {
    'Background': ['background'],
    'Background & Context': ['background'],
    'Objective': ['objective'],
    'Scope': ['inScope', 'outOfScope'],
    'Assumptions': ['assumptions'],
    'High-Level Architecture Overview': ['architectureOverview'],
    'Architecture': ['architectureOverview'],
    'Data Stores, Services & Interfaces': ['dataStores'],
    'Data Stores': ['dataStores'],
    'Key Features & User Stories': ['features', 'userStories'],
    'Features': ['features'],
    'Non-Functional Requirements (NFRs)': ['nfrs'],
    'NFRs': ['nfrs'],
    'Deliverables': ['deliverables'],
    'Team & Roles': ['teams'],
    'Environments & CI/CD Strategy': ['environments'],
    'Environments': ['environments'],
    'Data Security & Access Controls': ['security'],
    'Security': ['security'],
    'Dependencies & Risks': ['dependencies', 'risks'],
    'Dependencies': ['dependencies'],
    'Risks': ['risks'],
    'Next Steps': ['nextSteps'],
    'Definition of Done': ['dod'],
    'Definition of Done (DoD)': ['dod'],
    'Approvals & Sign-Offs': ['approvers'],
    'Approvers': ['approvers']
  };

  for (const section of refinement.refinedSections) {
    const keys = titleToKeyMap[section.sectionTitle] || [section.sectionTitle.toLowerCase().replace(/\s+/g, '')];

    for (const key of keys) {
      refinedData[key] = {
        original: section.originalContent || '',
        refined: section.refinedContent || '',
        diagramNode: `${key}["${section.sectionTitle}"]`
      };
    }
  }

  return refinedData;
}

/**
 * Stage 5A: Generate architecture diagram using existing Mermaid generator
 */
async function runStage5AArchitecture(
  refinement: RefinementOutput,
  _comprehension: ComprehensionOutput,  // Kept for potential future use
  projectName: string  // Use the original project title, not derived from comprehension
): Promise<{ diagram: string; type: string }> {
  // Convert to RefinedData format for existing generator
  const refinedData = convertRefinementToRefinedData(refinement);

  // Use the passed projectName (original epic title) - DO NOT derive from comprehension
  console.log('[Stage 5A] Using project name:', projectName);

  try {
    const result = await generateIntelligentBlueprint(refinedData, projectName);
    return {
      diagram: result.diagram,
      type: result.type
    };
  } catch (error) {
    console.error('[Stage 5A] Blueprint generation failed:', error);
    return {
      diagram: `flowchart LR
    A[Diagram Generation Failed] --> B[Please retry or use Blueprint tab]`,
      type: 'flowchart'
    };
  }
}

/**
 * Stage 5B: Generate user stories based on category
 */
async function runStage5BUserStories(
  refinement: RefinementOutput,
  classification: ClassificationOutput,
  extractedRequirements: ExtractedRequirement[] = [],
  storyFeedback?: string  // Layer 2: feedback from previous iteration
): Promise<{ stories: PipelineUserStory[]; coverage: CoverageReport }> {
  if (!currentConfig) {
    return {
      stories: [],
      coverage: {
        totalRequirements: 0,
        coveredByStories: 0,
        uncoveredRequirements: ['AI not configured']
      }
    };
  }

  const storyStyle = STORY_STYLE_PROMPTS[classification.categoryConfig.storyStyle] ||
    'As a [user]';

  // Combine BOTH original and refined content — original content is critical because
  // Stage 4 may have dropped or rephrased specific requirements. By including both,
  // the AI sees ALL user requirements even if Stage 4 missed some.
  const allContent = refinement.refinedSections
    .map(s => {
      const original = s.originalContent?.trim();
      const refined = s.refinedContent?.trim();
      // If original has substantially different content, include both
      if (original && refined && original.length > 50 && Math.abs(original.length - refined.length) > 100) {
        return `--- ORIGINAL USER CONTENT ---\n${original}\n\n--- REFINED CONTENT ---\n${refined}`;
      }
      return refined || original || '';
    })
    .join('\n\n');

  const systemPrompt = `You are an expert Agile coach creating a sprint-ready backlog from technical documentation.

STORY STYLE: ${storyStyle}

IMPORTANT — EXISTING STORIES:
If the content already contains user stories (US-XXX format with "As a [user], I want..." pattern):
- Do NOT include existing stories in your output — they are already handled separately
- Start numbering NEW stories AFTER the last existing story ID (e.g., if US-005 exists, start new stories at US-006)
- Do NOT regenerate, rephrase, or create new stories that cover the SAME topic as an existing story
- If an existing story covers "PostgreSQL upgrade", do NOT create another story about PostgreSQL upgrade
- Only create stories for requirements that are NOT already covered by existing stories

STORY SIZING (non-negotiable):
- Each story must be a SMALL SHIPPABLE SLICE — completable by one developer
- Use Fibonacci estimation: 1, 2, 3, or 5 story points (1 point = 1 developer-day)
- MAXIMUM story size: 5 points. If a requirement is larger, BREAK IT DOWN into multiple stories
- Total backlog should not exceed 30 story points
- "Implement microservices" is NOT a story — "Containerize the Auth Service with health checks" IS a story

YOUR TASK:
1. Read ALL content carefully — including the "ORIGINAL USER CONTENT" sections which contain the user's actual requirements
2. Identify EVERY numbered requirement, bullet point, and specific ask from the user
3. Create stories that cover EVERY requirement — if the user listed 7 things to do, there must be at least 7 stories (possibly more if items need to be broken down)
4. Do NOT skip requirements. Do NOT declare anything out of scope. Every item the user mentioned must have a corresponding story
5. Each story must be independently deployable and testable
6. Create a professional, action-oriented TITLE for each story (5-8 words max)
7. Format: "As a [specific persona], I want to [verb phrase], so that [measurable benefit]" — ALWAYS use "I want to [verb]", never "I want [verb]"
8. Add 2-4 MEASURABLE acceptance criteria per story (not vague — include numbers, thresholds, or verifiable conditions)
9. Assign priority (high/medium/low) and story points (1/2/3/5)
10. Note which section/requirement the story derives from

TITLE GUIDELINES:
- Start with action verb: Implement, Add, Create, Enable, Configure, Deploy, Migrate, Set up
- Be crisp and scannable (5-8 words maximum)
- Use technical terms appropriately
- Examples: "Deploy PgBouncer Connection Pooling", "Set up K8s CI/CD Pipeline", "Configure Istio mTLS"

QUALITY CHECKS:
- If a story is vague (e.g., "improve performance"), make it specific (e.g., "reduce p99 query latency to <100ms")
- Acceptance criteria must be binary (pass/fail) — not subjective. Banned phrases: "works as expected", "system performs correctly", "handles gracefully"
- Each story should specify what "done" looks like: tested, deployed, monitored
- No template stutter: verify no story contains "I want to I want to" or "so that so that"
${extractedRequirements.length > 0 ? `
REQUIREMENTS CONTRACT (from Step 1 — ${extractedRequirements.length} total):
${extractedRequirements.map(r => `[Req #${r.reqNum}] ${r.description}`).join('\n')}

STEP 3C — USER STORY RULES (mandatory):
- FULL COVERAGE: Every Req # above must map to at least one story. Tag each story with "reqTags" array.
- No orphan stories: every story must trace back to at least one Req #
- Match source framing: if source says "event-driven trigger", stories must say that — NOT polling
- If a requirement is too large for one story (>5 points), break it into multiple stories that share the same reqTags` : ''}

OUTPUT FORMAT:
Return ONLY valid JSON:
{
  "stories": [
    {
      "id": "US-001",
      "title": "<action-oriented title, 5-8 words>",
      "persona": "<specific role: platform engineer, backend engineer, etc.>",
      "goal": "<concrete deliverable>",
      "benefit": "<measurable benefit>",
      "acceptanceCriteria": ["<measurable AC1>", "<measurable AC2>", "<measurable AC3>"],
      "priority": "high|medium|low",
      "storyPoints": 1|2|3|5,
      "sourceSection": "<section title>",
      "reqTags": [1, 2]
    }
  ],
  "totalRequirements": <number>,
  "uncoveredRequirements": ["<requirement not covered>"]
}`;

  // Detect existing stories to tell AI what's already covered
  const existingStoryMatches = allContent.match(/US-\d+[:\s].+/g) || [];
  const existingStoryList = existingStoryMatches.length > 0
    ? `\n\nALREADY COVERED (do NOT create stories for these topics):\n${existingStoryMatches.map(s => `- ${s.substring(0, 100)}`).join('\n')}`
    : '';

  const lastStoryNum = existingStoryMatches.length;

  const userPrompt = `EPIC CONTENT:
${allContent.substring(0, 12000)}
${existingStoryList}

Create ONLY NEW stories (start at US-${String(lastStoryNum + 1).padStart(3, '0')}) for requirements NOT already covered above. Max 5 points each, total ~30 points. Break large requirements into multiple smaller stories:${storyFeedback || ''}`;

  try {
    const response = await callAI(currentConfig, systemPrompt, userPrompt);

    const parsed = parseJSONResponse<{
      stories?: PipelineUserStory[];
      totalRequirements?: number;
      uncoveredRequirements?: string[];
    }>(response, 'Stage 5B User Stories');

    return {
      stories: parsed.stories || [],
      coverage: {
        totalRequirements: parsed.totalRequirements || parsed.stories?.length || 0,
        coveredByStories: parsed.stories?.length || 0,
        uncoveredRequirements: parsed.uncoveredRequirements || []
      }
    };
  } catch (error) {
    console.error('[Stage 5B] User story extraction failed:', error);
    return {
      stories: [],
      coverage: {
        totalRequirements: 0,
        coveredByStories: 0,
        uncoveredRequirements: ['Story extraction failed']
      }
    };
  }
}

/**
 * Parse existing user stories from any markdown format.
 * Handles plain text, bold, blockquote, and checkbox formats.
 * Returns PipelineUserStory[] for consistent merging with Stage 5B output.
 */
function parseExistingStories(content: string): PipelineUserStory[] {
  const stories: PipelineUserStory[] = [];
  const lines = content.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Match any line containing US-XXX: pattern (bold, plain, or bullet)
    const storyMatch = line.match(/\*{0,2}(US-\d+)[:\s*]+(.+?)(?:\*{0,2}\s*[🔴🟠🟡🟢]*\s*)$/);
    if (!storyMatch) {
      i++;
      continue;
    }

    const id = storyMatch[1];
    let storyText = storyMatch[2].trim();
    // Remove trailing bold markers and emojis
    storyText = storyText.replace(/\*{1,2}$/, '').trim();

    // Parse "As a [persona], I want [goal] so that [benefit]" from this line or next lines
    let persona = 'user';
    let goal = storyText;
    let benefit = 'achieve the desired outcome';
    let title = '';

    // Check if this line or the next line has the "As a..." pattern
    const fullBlock = lines.slice(i, Math.min(i + 5, lines.length)).join(' ');
    const asAMatch = fullBlock.match(/As an?\s+(.+?),\s*I want\s+(.+?)\s+so that\s+(.+?)(?:\.|$)/i);
    if (asAMatch) {
      persona = asAMatch[1].trim();
      goal = asAMatch[2].trim();
      benefit = asAMatch[3].trim().replace(/\.$/, '');
    }

    // If the story line has a title before "As a...", extract it
    const titleMatch = storyText.match(/^(.+?)(?:\s*[-–—]\s*)?As an?\s/i);
    if (titleMatch) {
      title = titleMatch[1].trim();
    }
    if (!title) {
      // Generate a concise action-oriented title from the goal
      // Capitalize first letter and take first 6-8 meaningful words
      const words = goal.split(/\s+/);
      const titleWords = words.slice(0, 7);
      // Capitalize first word if it starts lowercase
      if (titleWords.length > 0) {
        titleWords[0] = titleWords[0].charAt(0).toUpperCase() + titleWords[0].slice(1);
      }
      title = titleWords.join(' ');
      // Remove trailing prepositions/conjunctions for clean titles
      title = title.replace(/\s+(by|and|or|to|for|with|in|on|at|the|a|an|so|that)$/i, '');
    }

    i++;

    // Collect acceptance criteria (look ahead for AC lines)
    const acceptanceCriteria: string[] = [];
    while (i < lines.length) {
      const acLine = lines[i].trim();
      // Stop at next story, section header, or empty line after ACs
      if (acLine.match(/^\*{0,2}US-\d+/)) break;
      if (acLine.match(/^#{1,3}\s/)) break;
      if (acLine === '' && acceptanceCriteria.length > 0) {
        // Check if next non-empty line is a new story or section
        const nextNonEmpty = lines.slice(i + 1).find(l => l.trim() !== '');
        if (!nextNonEmpty || nextNonEmpty.trim().match(/^(\*{0,2}US-\d+|#{1,3}\s)/)) break;
      }

      if (acLine.startsWith('Acceptance Criteria')) {
        // Header line — check if criteria are inline (after colon)
        const inlineAC = acLine.replace(/^Acceptance Criteria:?\s*/i, '').trim();
        if (inlineAC) {
          // Split inline ACs by comma or semicolon
          inlineAC.split(/[,;]/).forEach(ac => {
            const trimmed = ac.trim();
            if (trimmed) acceptanceCriteria.push(trimmed);
          });
        }
        i++;
        continue;
      }

      // Checkbox format: - [ ] AC text
      const checkboxMatch = acLine.match(/^[-*]\s*\[[ x]\]\s*(.+)/i);
      if (checkboxMatch) {
        acceptanceCriteria.push(checkboxMatch[1].trim());
        i++;
        continue;
      }

      // Bullet format: - AC text (only if we've seen "Acceptance Criteria" header or already have ACs)
      const bulletMatch = acLine.match(/^[-*]\s+(.+)/);
      if (bulletMatch && acceptanceCriteria.length >= 0 && acLine !== '' &&
          !bulletMatch[1].match(/^(As an?\s|US-\d+)/i)) {
        // Only treat as AC if it doesn't look like a story or section header
        if (lines.slice(Math.max(0, i - 3), i).some(l => l.trim().match(/Acceptance Criteria|US-\d+/i))) {
          acceptanceCriteria.push(bulletMatch[1].trim());
        }
      }

      i++;
    }

    stories.push({
      id,
      title,
      persona,
      goal,
      benefit,
      acceptanceCriteria,
      priority: 'medium', // Default — no priority in plain format
      sourceSection: 'User Input',
    });
  }

  return stories;
}

/**
 * Check if two user stories are similar enough to be considered duplicates.
 * Uses word overlap on the goal text (60%+ overlap = duplicate).
 */
function areStoriesSimilar(a: PipelineUserStory, b: PipelineUserStory): boolean {
  const stopWords = new Set(['want', 'that', 'with', 'from', 'this', 'will', 'have', 'been', 'their', 'using', 'into', 'than', 'them', 'each', 'which', 'about', 'when', 'make', 'like', 'should', 'could', 'would']);

  function getKeyWords(text: string): Set<string> {
    return new Set(
      text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/)
        .filter(w => w.length > 3 && !stopWords.has(w))
    );
  }

  function wordOverlap(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 || setB.size === 0) return 0;
    const overlap = [...setA].filter(w => setB.has(w)).length;
    return overlap / Math.min(setA.size, setB.size);
  }

  // Check goal similarity
  const goalSim = wordOverlap(getKeyWords(a.goal), getKeyWords(b.goal));
  if (goalSim >= 0.5) return true;

  // Check title similarity (titles often share key nouns even when goals are rephrased)
  if (a.title && b.title) {
    const titleSim = wordOverlap(getKeyWords(a.title), getKeyWords(b.title));
    if (titleSim >= 0.5) return true;
  }

  // Cross-check: title of one vs goal of other (AI often puts goal keywords in title)
  if (a.title) {
    const crossSim = wordOverlap(getKeyWords(a.title), getKeyWords(b.goal));
    if (crossSim >= 0.5) return true;
  }
  if (b.title) {
    const crossSim = wordOverlap(getKeyWords(a.goal), getKeyWords(b.title));
    if (crossSim >= 0.5) return true;
  }

  return false;
}

/**
 * SKILL: Assemble epic with embedded diagram and user stories
 * Embeds content INTO the epic markdown
 */
function assembleEpicWithEmbedding(
  refinement: RefinementOutput,
  diagram: string,
  stories: PipelineUserStory[],
  projectName: string
): AssembledEpic {
  // Load template for format hints (used for priority emoji in stories)
  const defaults = getGlobalDefaults();

  // Common action verbs for goal grammar normalization ("I want to [verb]")
  const ACTION_VERBS = new Set(['implement', 'deploy', 'create', 'configure', 'enable', 'set', 'build', 'add', 'integrate', 'migrate', 'upgrade', 'install', 'develop', 'design', 'establish', 'monitor', 'optimize', 'automate', 'ensure', 'track', 'containerize', 'introduce', 'define', 'provision', 'refactor', 'validate', 'parse', 'retain', 'move', 'apply', 'connect', 'trigger', 'enforce', 'disable', 'modify', 'transfer', 'enhance', 'support', 'maintain', 'generate', 'process', 'handle', 'manage', 'update', 'remove', 'send', 'receive', 'store', 'retrieve', 'transform', 'convert', 'verify', 'test', 'secure', 'expose', 'consume', 'publish', 'subscribe', 'schedule', 'execute', 'run', 'start', 'stop', 'restart', 'initialize', 'setup', 'teardown', 'clean', 'purge', 'archive', 'backup', 'restore', 'sync', 'replicate', 'partition', 'aggregate', 'filter', 'sort', 'index', 'cache', 'load', 'ingest', 'extract', 'emit', 'route', 'forward', 'redirect', 'map', 'reduce', 'merge', 'split', 'join', 'link', 'unlink', 'register', 'deregister', 'authenticate', 'authorize', 'encrypt', 'decrypt', 'compress', 'decompress', 'normalize', 'sanitize', 'throttle', 'limit', 'retry', 'poll', 'push', 'pull', 'fetch', 'post', 'patch', 'delete', 'list', 'query', 'search', 'scan', 'inspect', 'audit', 'log', 'notify', 'alert', 'report', 'measure', 'benchmark', 'profile', 'instrument', 'annotate', 'tag', 'label', 'classify', 'categorize', 'prioritize', 'allocate', 'assign', 'delegate', 'orchestrate', 'coordinate', 'mediate', 'negotiate', 'resolve', 'diagnose', 'troubleshoot', 'remediate', 'mitigate', 'prevent', 'protect', 'isolate', 'contain', 'quarantine', 'rollback', 'revert', 'undo', 'redo', 'replay', 'simulate', 'mock', 'stub', 'wrap', 'extend', 'override', 'intercept', 'inject', 'embed', 'attach', 'detach', 'bind', 'unbind', 'listen', 'watch', 'observe', 'detect', 'discover', 'enumerate', 'iterate', 'traverse', 'navigate', 'render', 'display', 'show', 'hide', 'toggle', 'expand', 'collapse', 'select', 'deselect', 'check', 'uncheck', 'submit', 'cancel', 'confirm', 'reject', 'approve', 'deny', 'grant', 'revoke', 'elevate', 'demote', 'promote', 'deprecate', 'sunset', 'decommission', 'onboard', 'offboard']);

  /** Normalize story goal/benefit grammar — ensure "I want to [verb]" */
  function normalizeGoal(goal: string): string {
    if (goal.toLowerCase().startsWith('to ')) return goal;
    const firstWord = goal.split(/\s+/)[0].toLowerCase();
    // Known action verb → prepend "to"
    if (ACTION_VERBS.has(firstWord)) {
      return 'to ' + goal.charAt(0).toLowerCase() + goal.slice(1);
    }
    // Heuristic: if first word looks like a verb (lowercase or Capitalized) followed by
    // an object (noun/article), it's likely a verb phrase the AI returned.
    // Pattern: "[verb] [noun/object]..." where the goal doesn't start with articles/prepositions/pronouns
    const nonVerbStarters = new Set(['the', 'a', 'an', 'my', 'our', 'this', 'that', 'these', 'those', 'all', 'each', 'every', 'some', 'any', 'no', 'not', 'when', 'if', 'for', 'with', 'by', 'from', 'in', 'on', 'at', 'of', 'about', 'between', 'through', 'during', 'before', 'after', 'above', 'below', 'under', 'over']);
    if (!nonVerbStarters.has(firstWord) && goal.split(/\s+/).length >= 2) {
      return 'to ' + goal.charAt(0).toLowerCase() + goal.slice(1);
    }
    return goal;
  }
  function normalizeBenefit(benefit: string): string {
    if (benefit && /^[A-Z]/.test(benefit) && !benefit.match(/^(I |We |The |A |An |Our |My |It |This |That )/)) {
      return benefit.charAt(0).toLowerCase() + benefit.slice(1);
    }
    return benefit;
  }

  // Sanitize project name for H1 title — prevent sentence-as-title and truncation
  const title = sanitizeProjectName(projectName);

  // Start with title and GitLab TOC
  let epic = `# ${title}\n\n`;
  epic += `[[_TOC_]]\n\n`; // GitLab Table of Contents

  // Add "Generated on" date after TOC (single instance, before all sections)
  epic += `*Generated on ${new Date().toLocaleDateString()}*\n\n---\n\n`;

  // Track if we've already embedded diagram/stories (only embed once)
  let diagramEmbedded = false;
  let storiesEmbedded = false;

  // Add all sections in their original order
  // Epic Status appears in natural position (not forced to top), so readers get context first
  for (const section of refinement.refinedSections) {
    let content = section.refinedContent.trim();
    // Bug #2 fix: Remove any existing "Generated on" date lines from refined content
    content = content.replace(/\*Generated on .+?\*\s*\n?/g, '').trim();

    // Section might already be wrapped in <details> from refinement
    const isAlreadyCollapsible = content.startsWith('<details>');

    if (!isAlreadyCollapsible && !content.startsWith('##')) {
      content = `## ${section.sectionTitle}\n\n${content}`;
    }

    // Check if this is architecture section - embed diagram (only once)
    const isArchSection = section.sectionTitle.toLowerCase().includes('architecture') ||
                          section.sectionTitle.toLowerCase().includes('diagram');
    if (isArchSection && diagram && !diagramEmbedded) {
      content += '\n\n### Architecture Diagram\n\n```mermaid\n' + diagram + '\n```\n';
      diagramEmbedded = true;
    }

    // Check if this is features/user stories section - embed stories (only once)
    const isStorySection = section.sectionTitle.toLowerCase().includes('feature') ||
                           section.sectionTitle.toLowerCase().includes('user stor');
    if (isStorySection && stories.length > 0 && !storiesEmbedded) {
      // 1. Parse existing user stories from the ORIGINAL content (before Stage 4 AI rewrite)
      //    Stage 4 may destroy "As a..., I want..., so that..." format, so we parse from original
      const existingStories = parseExistingStories(section.originalContent || content);

      // 2. Strip ALL user story content — keep only preamble (features, intro text)
      //    Find first US-XXX pattern and cut everything from there
      const firstStoryIdx = content.search(/(?:^|\n)\s*(?:\*{0,2})US-\d+/m);
      if (firstStoryIdx > 0) {
        content = content.substring(0, firstStoryIdx).trim();
      } else {
        // Also strip "### User Stories" subsection headers and everything after
        const storyHeaderIdx = content.search(/\n*###?\s*User Stories/i);
        if (storyHeaderIdx >= 0) {
          content = content.substring(0, storyHeaderIdx).trim();
        }
      }
      // Clean up any trailing "As a..." or "Acceptance Criteria:" orphan lines
      content = content.replace(/\n\s*As an?\s+.+,\s*I want\s+.+$/gim, '').trim();
      content = content.replace(/\n\s*Acceptance Criteria.*$/gim, '').trim();

      // 3. Merge existing stories + AI-generated stories (dedup by goal similarity)
      const merged: PipelineUserStory[] = [...existingStories];
      for (const newStory of stories) {
        const isDuplicate = merged.some(existing => areStoriesSimilar(existing, newStory));
        if (!isDuplicate) {
          merged.push(newStory);
        }
      }

      // 4. Re-number all stories sequentially and format consistently
      const priorityEmoji = defaults.priorityLevels;
      // Only add "### User Stories" sub-header if this is a Features section (not if already a User Stories section)
      const isFeaturesSection = section.sectionTitle.toLowerCase().includes('feature');
      content += isFeaturesSection ? '\n\n### User Stories\n\n' : '\n\n';
      merged.forEach((story, idx) => {
        const newId = `US-${String(idx + 1).padStart(3, '0')}`;
        const emoji = priorityEmoji[story.priority] || '';
        const storyTitle = story.title || story.goal;
        const pointsLabel = story.storyPoints ? ` [${story.storyPoints}pt]` : '';
        const reqTagStr = story.reqTags?.length
          ? ` [${story.reqTags.map(n => `Req #${n}`).join(', ')}]`
          : '';
        content += `**${newId}: ${storyTitle}**${pointsLabel}${reqTagStr} ${emoji}\n`;

        const goal = normalizeGoal(story.goal);
        const benefit = normalizeBenefit(story.benefit);

        content += `> As a ${story.persona}, I want ${goal}, so that ${benefit}.\n\n`;
        if (story.acceptanceCriteria && story.acceptanceCriteria.length > 0) {
          content += 'Acceptance Criteria:\n';
          story.acceptanceCriteria.forEach(ac => {
            content += `- [ ] ${ac}\n`;
          });
          content += '\n';
        }
      });
      storiesEmbedded = true;
    }

    epic += content + '\n\n';
  }

  // If diagram wasn't embedded in any section, add it at the end
  if (!diagramEmbedded && diagram) {
    epic += '## Architecture Diagram\n\n```mermaid\n' + diagram + '\n```\n\n';
  }

  // If stories weren't embedded in any section, add them at the end
  if (!storiesEmbedded && stories.length > 0) {
    const priorityEmoji = defaults.priorityLevels;
    epic += '## User Stories\n\n';
    stories.forEach((story, idx) => {
      const newId = `US-${String(idx + 1).padStart(3, '0')}`;
      const emoji = priorityEmoji[story.priority] || '';
      const storyTitle = story.title || story.goal;
      const pointsLabel = story.storyPoints ? ` [${story.storyPoints}pt]` : '';
      const reqTagStr = story.reqTags?.length
        ? ` [${story.reqTags.map(n => `Req #${n}`).join(', ')}]`
        : '';
      epic += `**${newId}: ${storyTitle}**${pointsLabel}${reqTagStr} ${emoji}\n`;
      const goal = normalizeGoal(story.goal);
      const benefit = normalizeBenefit(story.benefit);
      epic += `> As a ${story.persona}, I want ${goal}, so that ${benefit}.\n\n`;
      if (story.acceptanceCriteria && story.acceptanceCriteria.length > 0) {
        epic += 'Acceptance Criteria:\n';
        story.acceptanceCriteria.forEach(ac => {
          epic += `- [ ] ${ac}\n`;
        });
        epic += '\n';
      }
    });
  }

  const markdown = epic.trim();
  return {
    markdown,
    embeddedDiagram: !!diagram,
    embeddedStories: stories.length > 0,
    sectionCount: refinement.refinedSections.length,
    wordCount: markdown.split(/\s+/).filter(Boolean).length
  };
}

// Valid Fibonacci story point values
const VALID_STORY_POINTS = [1, 2, 3, 5] as const;
const MAX_STORY_POINTS = 5;
const TOTAL_STORY_POINTS_CAP = 30;

/**
 * Snap a number to the largest valid Fibonacci value that doesn't exceed it.
 * Floor of 1 for any positive value.
 */
function snapToFibonacci(value: number): number {
  if (value <= 0) return 1;
  if (value >= MAX_STORY_POINTS) return MAX_STORY_POINTS;
  // Find largest valid value <= input
  for (let i = VALID_STORY_POINTS.length - 1; i >= 0; i--) {
    if (VALID_STORY_POINTS[i] <= value) return VALID_STORY_POINTS[i];
  }
  return 1;
}

/**
 * Post-Stage 5B deterministic validation and auto-correction of story points.
 * Enforces: valid Fibonacci values {1,2,3,5}, max 5 per story, total cap ~30.
 * Returns corrections log for audit/gap report.
 */
export function validateAndCorrectStoryPoints(
  stories: PipelineUserStory[]
): StoryPointCorrection[] {
  const corrections: StoryPointCorrection[] = [];

  // Step 1 & 2: Clamp each story to valid Fibonacci, enforce per-story cap
  for (const story of stories) {
    if (story.storyPoints === undefined || story.storyPoints === null) continue;
    const original = story.storyPoints;
    if (!VALID_STORY_POINTS.includes(original as typeof VALID_STORY_POINTS[number])) {
      const corrected = snapToFibonacci(original);
      corrections.push({
        storyId: story.id,
        original,
        corrected,
        reason: original > MAX_STORY_POINTS ? 'exceeds_per_story_cap' : 'invalid_fibonacci'
      });
      story.storyPoints = corrected;
    }
  }

  // Step 3: Enforce total cap — reduce largest stories first
  let total = stories.reduce((sum, s) => sum + (s.storyPoints || 0), 0);
  if (total > TOTAL_STORY_POINTS_CAP) {
    // Sort indices by points descending (stable sort by original order for ties)
    const sortedIndices = stories
      .map((s, i) => ({ idx: i, pts: s.storyPoints || 0 }))
      .filter(x => x.pts > 1)
      .sort((a, b) => b.pts - a.pts);

    for (const { idx } of sortedIndices) {
      if (total <= TOTAL_STORY_POINTS_CAP) break;
      const story = stories[idx];
      const original = story.storyPoints || 0;
      // Reduce to next lower Fibonacci
      const fibIdx = VALID_STORY_POINTS.indexOf(original as typeof VALID_STORY_POINTS[number]);
      if (fibIdx > 0) {
        const corrected = VALID_STORY_POINTS[fibIdx - 1];
        const alreadyCorrected = corrections.find(c => c.storyId === story.id);
        if (alreadyCorrected) {
          // Update existing correction
          alreadyCorrected.corrected = corrected;
          alreadyCorrected.reason = 'total_cap_reduction';
        } else {
          corrections.push({
            storyId: story.id,
            original,
            corrected,
            reason: 'total_cap_reduction'
          });
        }
        total -= (original - corrected);
        story.storyPoints = corrected;
      }
    }
  }

  if (corrections.length > 0) {
    console.log(`[Stage 5B] Story point corrections: ${corrections.length} stories adjusted (total: ${total}/${TOTAL_STORY_POINTS_CAP})`);
  }

  return corrections;
}

/**
 * Stage 5: Generate blueprint, user stories, and assemble with embedding
 */
export async function runStage5Mandatory(
  refinement: RefinementOutput,
  comprehension: ComprehensionOutput,
  classification: ClassificationOutput,
  originalProjectTitle?: string,
  iterationFeedback?: IterationFeedback  // Layer 2: feedback from previous iteration
): Promise<MandatoryOutput> {
  // Use original title if provided, otherwise extract from comprehension (fallback)
  const projectName = originalProjectTitle || 'Epic';

  // Run 5A and 5B sequentially to avoid rate limiting
  // Blueprint generation is heavy on tokens, so we run it first
  // Pass projectName to ensure diagram uses correct title (not derived from comprehension)
  const architecture = await runStage5AArchitecture(refinement, comprehension, projectName);

  // Small delay between heavy operations
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Layer 2: Build story feedback if available
  const storyFeedbackStr = iterationFeedback
    ? formatStoryFeedback(iterationFeedback.stage5Feedback, iterationFeedback.positiveAnchors)
    : undefined;

  const userStoriesResult = await runStage5BUserStories(
    refinement,
    classification,
    comprehension.extractedRequirements || [],
    storyFeedbackStr
  );

  // Post-Stage 5B: Deterministic story point validation & auto-correction
  const storyPointCorrections = validateAndCorrectStoryPoints(userStoriesResult.stories);

  // Assemble epic with embedded content (uses corrected story points)
  const assembledEpic = assembleEpicWithEmbedding(
    refinement,
    architecture.diagram,
    userStoriesResult.stories,
    projectName
  );

  return {
    architectureDiagram: architecture.diagram,
    diagramType: architecture.type,
    userStories: userStoriesResult.stories,
    assembledEpic,
    storyPointCorrections: storyPointCorrections.length > 0 ? storyPointCorrections : undefined
  };
}

// ===========================================
// STAGE 6: VALIDATION GATE
// ===========================================

/**
 * Extract key terms from text for matching/scoring.
 * Filters stop words and short words, returns lowercase tokens.
 */
export function extractKeyTerms(text: string): string[] {
  const stopWords = new Set([
    'that', 'this', 'with', 'from', 'into', 'will', 'must', 'should',
    'have', 'been', 'being', 'each', 'which', 'their', 'they', 'than',
    'other', 'between', 'through', 'after', 'before', 'when', 'where', 'support'
  ]);
  return text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w));
}

/**
 * Deterministic failure pattern detection (no AI call).
 * Checks the 8 failure patterns from THE REFINEMENT PROCESS spec.
 */
function detectFailurePatterns(
  epic: string,
  requirements: ExtractedRequirement[],
  stories: PipelineUserStory[],
  _diagram: string,
  sourceEpic?: string
): DetectedFailure[] {
  const failures: DetectedFailure[] = [];

  // Pattern 1: Scope Smoothing — requirements absent from output
  let smoothedCount = 0;
  for (const req of requirements) {
    const keyTerms = extractKeyTerms(req.description);
    const epicLower = epic.toLowerCase();
    // Check if at least 30% of key terms appear in the output
    const matchCount = keyTerms.filter(t => epicLower.includes(t)).length;
    const matchRatio = keyTerms.length > 0 ? matchCount / keyTerms.length : 1;
    if (matchRatio < 0.3) {
      smoothedCount++;
    }
  }
  // Only hard-fail if >20% of requirements are completely smoothed out
  if (smoothedCount > 0 && requirements.length > 0) {
    const smoothedRatio = smoothedCount / requirements.length;
    failures.push({
      pattern: 'scope_smoothing',
      location: 'Requirements→Output',
      evidence: `${smoothedCount}/${requirements.length} requirements have <30% key term coverage in output`,
      severity: smoothedRatio > 0.2 ? 'hard_fail' : 'scored'
    });
  }

  // Pattern 2: Confident Exclusion — "out of scope"/"non-goal" not in source
  const exclusionMatches = epic.match(/(?:out of scope|non-goal|not included|excluded from|will not be|is not in scope)/gi) || [];
  if (exclusionMatches.length > 0) {
    failures.push({
      pattern: 'confident_exclusion',
      location: 'Document-wide',
      evidence: `Found ${exclusionMatches.length} scope exclusion phrases — verify each traces to source`,
      severity: 'scored'
    });
  }

  // Pattern 5: Repetition Bloat — sections exceeding 300 words
  const sections = epic.split(/\n##\s+/);
  for (const section of sections) {
    const firstLine = section.split('\n')[0].trim();
    const wordCount = section.split(/\s+/).filter(Boolean).length;
    if (wordCount > 350 && firstLine) {
      failures.push({
        pattern: 'repetition_bloat',
        location: `Section: ${firstLine.substring(0, 50)}`,
        evidence: `${wordCount} words (exceeds 300-word ceiling)`,
        severity: 'scored'
      });
    }
  }

  // Pattern 6: Template Contamination — filler phrases
  const fillerPatterns = [
    /This (?:ensures?|approach|setup|will be pivotal|is crucial)/gi,
    /(?:facilitating|leverages?|streamlined|robust)\b/gi,
  ];
  let fillerCount = 0;
  for (const pat of fillerPatterns) {
    const matches = epic.match(pat) || [];
    fillerCount += matches.length;
  }
  if (fillerCount > 3) {
    failures.push({
      pattern: 'template_contamination',
      location: 'Document-wide',
      evidence: `${fillerCount} filler/template phrases detected`,
      severity: 'scored'
    });
  }

  // Pattern 7: Partial Story Coverage — stories without reqTags
  const storiesWithoutTags = stories.filter(s => !s.reqTags || s.reqTags.length === 0);
  if (storiesWithoutTags.length > 0 && requirements.length > 0) {
    failures.push({
      pattern: 'partial_story_coverage',
      location: 'User Stories',
      evidence: `${storiesWithoutTags.length}/${stories.length} stories lack [Req #N] tags`,
      severity: 'scored'
    });
  }

  // Pattern 7b: Requirements without any story coverage
  if (requirements.length > 0 && stories.length > 0) {
    const coveredReqs = new Set(stories.flatMap(s => s.reqTags || []));
    const uncoveredReqs = requirements.filter(r => !coveredReqs.has(r.reqNum));
    // Only hard-fail if >50% of requirements are uncovered; otherwise scored
    // (story generation covers 5-10 top-priority stories, so 30-50% uncovered is normal for large req sets)
    const uncoveredRatio = uncoveredReqs.length / requirements.length;
    if (uncoveredReqs.length > 0) {
      failures.push({
        pattern: 'partial_story_coverage',
        location: 'Requirements→Stories',
        evidence: `${uncoveredReqs.length}/${requirements.length} requirements lack story coverage: ${uncoveredReqs.map(r => `Req #${r.reqNum}`).join(', ')}`,
        severity: uncoveredRatio > 0.5 ? 'hard_fail' : 'scored'
      });
    }
  }

  // Pattern 8: Template Artifacts — placeholders and stutters
  // Exclude "Open Questions" section from placeholder detection (TBD is valid there)
  const epicWithoutOpenQuestions = epic.replace(/##\s*(?:\d+\.\s*)?Open Questions[\s\S]*?(?=\n##\s|\n---|\n\*Generated on|$)/gi, '');
  const placeholderMatches = epicWithoutOpenQuestions.match(/\[TODO\]|\[TBD\]|\[Content needed\]|lorem ipsum/gi) || [];
  if (placeholderMatches.length > 0) {
    // Compare against source — if source also has [TBD], don't hard-fail (these are user-provided placeholders)
    const sourcePlaceholderCount = sourceEpic
      ? (sourceEpic.match(/\[TODO\]|\[TBD\]|\[Content needed\]|lorem ipsum/gi) || []).length
      : 0;
    const isFromSource = sourcePlaceholderCount > 0 && placeholderMatches.length <= sourcePlaceholderCount;
    failures.push({
      pattern: 'template_artifacts',
      location: 'Document-wide',
      evidence: `${placeholderMatches.length} placeholder(s) found: ${placeholderMatches.slice(0, 3).join(', ')}${isFromSource ? ' (from source)' : ''}`,
      severity: isFromSource ? 'scored' : 'hard_fail'
    });
  }

  // Pattern 8b: Template stutter — "I want to I want to", "so that so that"
  const stutterMatches = epic.match(/I want to I want to|so that so that/gi) || [];
  if (stutterMatches.length > 0) {
    failures.push({
      pattern: 'template_artifacts',
      location: 'User Stories',
      evidence: `Template stutter detected: "${stutterMatches[0]}"`,
      severity: 'hard_fail'
    });
  }

  return failures;
}

/**
 * Compute a deterministic 0-100 score for an epic across 5 weighted dimensions.
 * 100% reproducible — same inputs always produce same score.
 */
export function computeDeterministicScore(
  epic: string,
  requirements: ExtractedRequirement[],
  stories: PipelineUserStory[],
  diagram: string,
  entities: Array<{ entity: string; description: string }>,
  expectedSectionCount: number
): DeterministicScoreBreakdown {
  const epicLower = epic.toLowerCase();

  // === 1. Requirements dimension (30%) ===
  const perRequirement = requirements.map(req => {
    const keyTerms = extractKeyTerms(req.description);
    const matchCount = keyTerms.filter(t => epicLower.includes(t)).length;
    const keyTermMatchRatio = keyTerms.length > 0 ? matchCount / keyTerms.length : 1;
    return { reqNum: req.reqNum, keyTermMatchRatio, covered: keyTermMatchRatio >= 0.3 };
  });
  const coveredCount = perRequirement.filter(r => r.covered).length;
  const reqScore = requirements.length > 0
    ? Math.round((coveredCount / requirements.length) * 100)
    : 100;

  // === 2. Content Quality dimension (20%) ===
  const sections = epic.split(/\n##\s+/).filter(Boolean);
  // Section word compliance: % of sections within 50-350 word range
  const sectionWordCounts = sections.map(s => s.split(/\s+/).filter(Boolean).length);
  const compliantSections = sectionWordCounts.filter(wc => wc >= 30 && wc <= 350).length;
  const sectionWordCompliance = sections.length > 0 ? compliantSections / sections.length : 1;

  const fillerPatterns = [
    /This (?:ensures?|approach|setup|will be pivotal|is crucial)/gi,
    /(?:facilitating|leverages?|streamlined|robust)\b/gi,
  ];
  let fillerPhraseCount = 0;
  for (const pat of fillerPatterns) {
    fillerPhraseCount += (epic.match(pat) || []).length;
  }

  // Exclude "Open Questions" section from placeholder count
  const epicWithoutOQ = epic.replace(/##\s*(?:\d+\.\s*)?Open Questions[\s\S]*?(?=\n##\s|\n---|\n\*Generated on|$)/gi, '');
  const placeholderCount = (epicWithoutOQ.match(/\[TODO\]|\[TBD\]|\[Content needed\]|lorem ipsum/gi) || []).length;
  const stutterCount = (epic.match(/I want to I want to|so that so that/gi) || []).length;

  let contentScore = 100;
  contentScore -= (1 - sectionWordCompliance) * 40;
  contentScore -= Math.min(fillerPhraseCount * 5, 30);
  contentScore -= placeholderCount * 15;
  contentScore -= stutterCount * 20;
  contentScore = Math.max(0, Math.min(100, Math.round(contentScore)));

  // === 3. Stories dimension (20%) ===
  const storyCount = stories.length;
  const requirementCount = requirements.length;
  const storiesWithReqTags = stories.filter(s => s.reqTags && s.reqTags.length > 0).length;
  const coveredReqNums = new Set(stories.flatMap(s => s.reqTags || []));
  const requirementsCoveredByStories = requirements.filter(r => coveredReqNums.has(r.reqNum)).length;
  const storiesWithAcceptanceCriteria = stories.filter(s => s.acceptanceCriteria && s.acceptanceCriteria.length > 0).length;

  // 4 sub-scores each worth 25:
  const storySubScores = [
    requirementCount === 0 ? 25 : (storyCount >= requirementCount ? 25 : Math.round((storyCount / requirementCount) * 25)),
    storyCount === 0 ? 0 : Math.round((storiesWithReqTags / storyCount) * 25),
    requirementCount === 0 ? 25 : Math.round((requirementsCoveredByStories / requirementCount) * 25),
    storyCount === 0 ? 0 : Math.round((storiesWithAcceptanceCriteria / storyCount) * 25),
  ];
  const storiesScore = storySubScores.reduce((a, b) => a + b, 0);

  // === 4. Diagrams dimension (15%) ===
  const mermaidBlock = diagram.trim();
  // Basic syntax check: has a diagram type keyword and at least one arrow/connection
  const hasDiagramType = /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap)/m.test(mermaidBlock);
  const hasConnections = /-->|-->/m.test(mermaidBlock) || /->>/m.test(mermaidBlock) || /==/m.test(mermaidBlock);
  const syntaxValid = hasDiagramType && (hasConnections || /gantt|pie|mindmap/i.test(mermaidBlock));

  // Count nodes (text within brackets or quoted)
  const nodeMatches = mermaidBlock.match(/\[["']?[^\]]+["']?\]|\(["']?[^)]+["']?\)|{["']?[^}]+["']?}/g) || [];
  const nodeCount = nodeMatches.length;

  // Entity term matching: check how many entity names appear in diagram
  const diagramLower = mermaidBlock.toLowerCase();
  const entityTerms = entities.map(e => e.entity.toLowerCase());
  const totalEntityTerms = entityTerms.length;
  const nodeLabelsMatchingEntities = entityTerms.filter(e => diagramLower.includes(e)).length;

  let diagramScore = 0;
  diagramScore += syntaxValid ? 40 : 0;
  diagramScore += Math.min(nodeCount, 5) >= 5 ? 30 : Math.round((Math.min(nodeCount, 5) / 5) * 30);
  diagramScore += totalEntityTerms > 0
    ? Math.round((nodeLabelsMatchingEntities / totalEntityTerms) * 30)
    : 30; // No entities to match → full marks
  diagramScore = Math.min(100, diagramScore);

  // === 5. Structure dimension (15%) ===
  const sectionCount = sections.length;
  const emptySectionCount = sections.filter(s => {
    // A section is "empty" if it has fewer than 10 words of actual content (excluding the header)
    const lines = s.split('\n').slice(1); // skip header line
    const content = lines.join(' ').trim();
    return content.split(/\s+/).filter(Boolean).length < 10;
  }).length;
  const oversizedSectionCount = sectionWordCounts.filter(wc => wc > 350).length;

  let structureScore = 0;
  // No empty sections (40 pts)
  structureScore += sectionCount > 0
    ? Math.round(((sectionCount - emptySectionCount) / sectionCount) * 40)
    : 40;
  // Section count within ±30% of expected (30 pts)
  if (expectedSectionCount > 0) {
    const ratio = sectionCount / expectedSectionCount;
    if (ratio >= 0.7 && ratio <= 1.3) {
      structureScore += 30;
    } else {
      structureScore += Math.max(0, Math.round(30 - Math.abs(1 - ratio) * 30));
    }
  } else {
    structureScore += 30;
  }
  // No oversized sections (30 pts)
  structureScore += sectionCount > 0
    ? Math.round(((sectionCount - oversizedSectionCount) / sectionCount) * 30)
    : 30;
  structureScore = Math.min(100, structureScore);

  // === Overall weighted score ===
  const overallScore = Math.round(
    reqScore * 0.30 +
    contentScore * 0.20 +
    storiesScore * 0.20 +
    diagramScore * 0.15 +
    structureScore * 0.15
  );

  return {
    requirements: {
      score: reqScore, weight: 0.30,
      detail: `${coveredCount}/${requirements.length} requirements covered (>=30% key term match)`,
      perRequirement
    },
    contentQuality: {
      score: contentScore, weight: 0.20,
      detail: `Compliance: ${Math.round(sectionWordCompliance * 100)}%, filler: ${fillerPhraseCount}, placeholders: ${placeholderCount}, stutters: ${stutterCount}`,
      sectionWordCompliance, fillerPhraseCount, placeholderCount, stutterCount
    },
    stories: {
      score: storiesScore, weight: 0.20,
      detail: `${storyCount} stories, ${storiesWithReqTags} with reqTags, ${requirementsCoveredByStories}/${requirementCount} reqs covered, ${storiesWithAcceptanceCriteria} with AC`,
      storyCount, requirementCount, storiesWithReqTags, requirementsCoveredByStories, storiesWithAcceptanceCriteria
    },
    diagrams: {
      score: diagramScore, weight: 0.15,
      detail: `Valid: ${syntaxValid}, ${nodeCount} nodes, ${nodeLabelsMatchingEntities}/${totalEntityTerms} entity matches`,
      syntaxValid, nodeCount, nodeLabelsMatchingEntities, totalEntityTerms
    },
    structure: {
      score: structureScore, weight: 0.15,
      detail: `${emptySectionCount} empty, ${sectionCount}/${expectedSectionCount} sections, ${oversizedSectionCount} oversized`,
      emptySectionCount, sectionCount, expectedSectionCount, oversizedSectionCount
    },
    overallScore
  };
}

/**
 * Stage 6: Validation Gate
 * Performs traceability check (Step 4) and self-audit (Step 5) from The Refinement Process.
 * Part A: AI-powered traceability + binary checks (1 API call)
 * Part B: Deterministic failure pattern detection (no API call)
 * Part C: Deterministic scoring (no AI call)
 */
export async function runStage6Validation(
  assembledEpic: string,
  extractedRequirements: ExtractedRequirement[],
  userStories: PipelineUserStory[],
  diagram: string,
  iterationNumber: number,
  previousFailures?: string[],
  sourceEpic?: string,
  entities?: Array<{ entity: string; description: string }>,
  expectedSectionCount?: number
): Promise<ValidationOutput> {
  // Part C: Deterministic scoring (always runs, even without AI)
  const scoreBreakdown = computeDeterministicScore(
    assembledEpic,
    extractedRequirements,
    userStories,
    diagram,
    entities || [],
    expectedSectionCount || 10
  );

  // If no requirements were extracted (e.g., Stage 1 extraction failed), skip AI validation
  if (!currentConfig || extractedRequirements.length === 0) {
    const detectedFailures = detectFailurePatterns(assembledEpic, extractedRequirements, userStories, diagram, sourceEpic);
    const hardFailCount = detectedFailures.filter(f => f.severity === 'hard_fail').length;
    const detScore = scoreBreakdown.overallScore;
    return {
      traceabilityTable: [],
      traceabilityCoverage: 0,
      missingTraceability: [],
      auditChecklist: [],
      auditScore: extractedRequirements.length === 0 ? detScore : 0,
      auditPassed: false,
      detectedFailures,
      hardFailCount,
      passed: false,
      failureReasons: extractedRequirements.length === 0
        ? ['No requirements extracted — cannot validate traceability']
        : ['AI not configured'],
      iterationNumber,
      scoreBreakdown,
    };
  }

  // Part A: AI-powered traceability + binary checks
  const systemPrompt = `You are a quality gate for technical documents. Perform requirements traceability mapping.

REQUIREMENTS TRACEABILITY:
Build a traceability table mapping every requirement to document sections and user stories.
For each requirement, answer binary questions:
- Is the core intent addressed in a document section? (YES/NO)
- Is there a user story covering this requirement? (YES/NO)
- Are technical specifics preserved? (YES/NO)

Requirements contract (${extractedRequirements.length} total):
${extractedRequirements.map(r => `[Req #${r.reqNum}] ${r.description}`).join('\n')}

User stories in document:
${userStories.map(s => `${s.id}: ${s.title} ${s.reqTags ? `[${s.reqTags.map(n => `Req #${n}`).join(', ')}]` : '[no tags]'}`).join('\n')}

Rules:
- Every row must have at least one entry in documentSections or userStoryIds (both preferred)
- If any row is empty in both → it's a gap. Mark as "missing"
- Total rows must = ${extractedRequirements.length}
${previousFailures?.length ? `\nPREVIOUS ITERATION FAILURES (fix these specifically):\n${previousFailures.join('\n')}` : ''}

OUTPUT FORMAT (JSON only, no markdown):
{
  "traceabilityTable": [
    { "reqNum": 1, "description": "...", "documentSections": ["..."], "userStoryIds": ["US-001"], "status": "covered|partial|missing" }
  ],
  "binaryChecks": [
    { "reqNum": 1, "intentAddressed": true, "storyCoverage": true, "specificsPreserved": true }
  ]
}`;

  const userPrompt = `ASSEMBLED DOCUMENT (first 12000 chars):
${assembledEpic.substring(0, 12000)}

ARCHITECTURE DIAGRAM:
${diagram.substring(0, 2000)}

Map requirements to document sections and user stories. Answer binary checks per requirement:`;

  try {
    const response = await callAI(currentConfig, systemPrompt, userPrompt);
    const parsed = parseJSONResponse<{
      traceabilityTable?: TraceabilityRow[];
      binaryChecks?: Array<{ reqNum: number; intentAddressed: boolean; storyCoverage: boolean; specificsPreserved: boolean }>;
      // Backward compat: old format fields
      auditChecklist?: AuditCheckItem[];
      auditScore?: number;
      failureReasons?: string[];
    }>(response, 'Stage 6 Validation');

    // Part B: Deterministic failure detection
    const detectedFailures = detectFailurePatterns(assembledEpic, extractedRequirements, userStories, diagram, sourceEpic);

    const traceabilityTable = parsed.traceabilityTable || [];
    const missingTraceability = traceabilityTable
      .filter(r => r.status === 'missing')
      .map(r => r.reqNum);
    const coveredCount = traceabilityTable.filter(r => r.status === 'covered').length;
    const traceabilityCoverage = traceabilityTable.length > 0
      ? Math.round((coveredCount / traceabilityTable.length) * 100)
      : 0;

    const hardFailCount = detectedFailures.filter(f => f.severity === 'hard_fail').length;

    // Use deterministic score as the authoritative score (replaces AI auditScore)
    const auditScore = scoreBreakdown.overallScore;
    // Pass criteria: deterministic score >= 85 and no hard fails
    const auditPassed = auditScore >= 85 && hardFailCount === 0;

    // Convert binary checks to audit checklist for backward compat
    const auditChecklist: AuditCheckItem[] = (parsed.binaryChecks || []).flatMap(check => [
      { category: 'requirements' as const, rule: `Req #${check.reqNum} intent addressed`, passed: check.intentAddressed, detail: check.intentAddressed ? 'Core intent found in document' : 'Core intent NOT found' },
      { category: 'stories' as const, rule: `Req #${check.reqNum} story coverage`, passed: check.storyCoverage, detail: check.storyCoverage ? 'Covered by user story' : 'No story coverage' },
      { category: 'requirements' as const, rule: `Req #${check.reqNum} specifics preserved`, passed: check.specificsPreserved, detail: check.specificsPreserved ? 'Technical specifics intact' : 'Specifics may be lost' },
    ]);
    // Fall back to old auditChecklist if binary checks not present
    const finalChecklist = auditChecklist.length > 0 ? auditChecklist : (parsed.auditChecklist || []);

    const allFailureReasons = [
      ...(parsed.failureReasons || []),
      ...detectedFailures.filter(f => f.severity === 'hard_fail').map(f => `${f.pattern}: ${f.evidence}`),
      ...(missingTraceability.length > 0 ? [`Traceability gaps: Req #${missingTraceability.join(', #')}`] : []),
    ];

    console.log(`[Stage 6] Iteration ${iterationNumber}: deterministicScore=${auditScore}, hardFails=${hardFailCount}, traceability=${traceabilityCoverage}%, passed=${auditPassed}`);

    return {
      traceabilityTable,
      traceabilityCoverage,
      missingTraceability,
      auditChecklist: finalChecklist,
      auditScore,
      auditPassed,
      detectedFailures,
      hardFailCount,
      passed: auditPassed,
      failureReasons: allFailureReasons,
      iterationNumber,
      scoreBreakdown,
    };
  } catch (error) {
    console.error('[Stage 6] Validation failed:', error);
    const detectedFailures = detectFailurePatterns(assembledEpic, extractedRequirements, userStories, diagram, sourceEpic);
    const hardFailCount = detectedFailures.filter(f => f.severity === 'hard_fail').length;
    // Even on AI failure, return deterministic score
    const auditScore = scoreBreakdown.overallScore;
    return {
      traceabilityTable: [],
      traceabilityCoverage: 0,
      missingTraceability: [],
      auditChecklist: [],
      auditScore,
      auditPassed: false,
      detectedFailures,
      hardFailCount,
      passed: auditScore >= 85 && hardFailCount === 0,
      failureReasons: ['Validation AI call failed: ' + (error instanceof Error ? error.message : String(error))],
      iterationNumber,
      scoreBreakdown,
    };
  }
}

// ===========================================
// LAYER 2: TARGETED FEEDBACK FUNCTIONS
// ===========================================

/**
 * Format section-specific feedback for Stage 4 retry prompts.
 * Returns empty string if no feedback matches this section.
 */
export function formatSectionFeedback(
  sectionTitle: string,
  feedback: SectionFeedbackItem[],
  globalAnchors: string[]
): string {
  const matching = feedback.filter(f =>
    f.sectionTitle === '*' ||
    f.sectionTitle.toLowerCase() === sectionTitle.toLowerCase()
  );
  if (matching.length === 0) return '';

  let result = '\n\nFEEDBACK FROM PREVIOUS ITERATION:\n';
  for (const item of matching) {
    for (const issue of item.issues) {
      result += `- Issue: ${issue}\n`;
    }
    for (const action of item.actions) {
      result += `- Action: ${action}\n`;
    }
    for (const anchor of item.anchors) {
      result += `- Keep: ${anchor}\n`;
    }
  }
  if (globalAnchors.length > 0) {
    result += `- Preserve these strengths: ${globalAnchors.slice(0, 3).join('; ')}\n`;
  }
  return result;
}

/**
 * Format story-specific feedback for Stage 5 retry prompts.
 * Returns empty string if no feedback.
 */
export function formatStoryFeedback(
  feedback: StoryFeedbackItem[],
  globalAnchors: string[]
): string {
  if (feedback.length === 0) return '';

  let result = '\n\nFEEDBACK FROM PREVIOUS ITERATION:\n';
  for (const item of feedback) {
    result += `- Issue: ${item.issue}\n`;
    result += `- Action: ${item.action}\n`;
    if (item.missingReqNums && item.missingReqNums.length > 0) {
      result += `- Missing coverage for: ${item.missingReqNums.map(n => `Req #${n}`).join(', ')}\n`;
    }
  }
  if (globalAnchors.length > 0) {
    result += `- Preserve these strengths: ${globalAnchors.slice(0, 3).join('; ')}\n`;
  }
  return result;
}

/**
 * Build structured feedback from validation results to guide Stage 4/5 retries.
 * Routes each detected failure to the correct stage with actionable instructions.
 */
export function buildIterationFeedback(
  validation: ValidationOutput,
  requirements: ExtractedRequirement[],
  stories: PipelineUserStory[],
  refinedSections: PipelineRefinedSection[],
  iteration: number,
  storyPointCorrections?: StoryPointCorrection[]
): IterationFeedback {
  const stage4Feedback: SectionFeedbackItem[] = [];
  const stage5Feedback: StoryFeedbackItem[] = [];
  const positiveAnchors: string[] = [];

  // Story point correction feedback — tell Stage 5B to fix at source
  if (storyPointCorrections && storyPointCorrections.length > 0) {
    const details = storyPointCorrections.map(c =>
      `${c.storyId}: ${c.original}→${c.corrected} (${c.reason})`
    ).join(', ');
    stage5Feedback.push({
      issue: `${storyPointCorrections.length} stories had invalid story points (auto-corrected): ${details}`,
      action: 'USE ONLY Fibonacci values {1, 2, 3, 5} for story points. Max 5 per story. Total must not exceed 30.',
      sourcePattern: 'story_point_violation'
    });
  }

  for (const failure of validation.detectedFailures) {
    switch (failure.pattern) {
      case 'scope_smoothing': {
        // Identify which requirements are missing from which sections
        const epicLower = refinedSections.map(s => s.refinedContent.toLowerCase()).join(' ');
        const missingReqs = requirements.filter(req => {
          const terms = extractKeyTerms(req.description);
          const matchCount = terms.filter(t => epicLower.includes(t)).length;
          return terms.length > 0 && matchCount / terms.length < 0.3;
        });
        if (missingReqs.length > 0) {
          stage4Feedback.push({
            sectionTitle: '*',
            issues: [`${missingReqs.length} requirements have insufficient coverage`],
            actions: missingReqs.map(r => `Ensure Req #${r.reqNum} ("${r.description.substring(0, 60)}") is addressed with specific content`),
            anchors: [],
            sourcePattern: 'scope_smoothing'
          });
        }
        break;
      }

      case 'repetition_bloat': {
        const sectionName = failure.location.replace('Section: ', '');
        stage4Feedback.push({
          sectionTitle: sectionName,
          issues: [failure.evidence],
          actions: ['Reduce to under 300 words by removing redundant content'],
          anchors: [],
          sourcePattern: 'repetition_bloat'
        });
        break;
      }

      case 'template_contamination': {
        stage4Feedback.push({
          sectionTitle: '*',
          issues: [failure.evidence],
          actions: ['Remove filler phrases: "This ensures...", "This approach...", "facilitating", "leverages", "streamlined", "robust"'],
          anchors: [],
          sourcePattern: 'template_contamination'
        });
        break;
      }

      case 'template_artifacts': {
        stage4Feedback.push({
          sectionTitle: '*',
          issues: [failure.evidence],
          actions: ['Replace all [TBD]/[TODO] with concrete values or remove entirely'],
          anchors: [],
          sourcePattern: 'template_artifacts'
        });
        break;
      }

      case 'confident_exclusion': {
        stage4Feedback.push({
          sectionTitle: '*',
          issues: [failure.evidence],
          actions: ['Verify each scope exclusion traces to the source document. Remove invented exclusions.'],
          anchors: [],
          sourcePattern: 'confident_exclusion'
        });
        break;
      }

      case 'partial_story_coverage': {
        // Extract missing requirement numbers from evidence
        const reqNumMatches = failure.evidence.match(/Req #(\d+)/g) || [];
        const missingReqNums = reqNumMatches.map(m => parseInt(m.replace('Req #', '')));
        stage5Feedback.push({
          issue: failure.evidence,
          action: missingReqNums.length > 0
            ? `Create stories covering requirements: ${missingReqNums.map(n => `Req #${n}`).join(', ')}`
            : 'Ensure all stories have [Req #N] tags linking to requirements',
          missingReqNums: missingReqNums.length > 0 ? missingReqNums : undefined,
          sourcePattern: 'partial_story_coverage'
        });
        break;
      }
    }
  }

  // Build positive anchors from covered requirements and tagged stories
  const coveredRows = validation.traceabilityTable.filter(r => r.status === 'covered');
  if (coveredRows.length > 0) {
    positiveAnchors.push(`${coveredRows.length}/${validation.traceabilityTable.length} requirements fully traced`);
  }
  const taggedStories = stories.filter(s => s.reqTags && s.reqTags.length > 0);
  if (taggedStories.length > 0) {
    positiveAnchors.push(`${taggedStories.length}/${stories.length} stories properly tagged`);
  }
  const keptSections = refinedSections.filter(s => s.wasKept);
  if (keptSections.length > 0) {
    positiveAnchors.push(`${keptSections.length} sections kept as-is (high quality)`);
  }

  return { stage4Feedback, stage5Feedback, positiveAnchors, iteration };
}

// ===========================================
// PREMIUM PIPELINE: MAIN ORCHESTRATOR
// ===========================================

/**
 * Progress callback type for pipeline execution
 */
export type PipelineProgressCallback = (
  stage: number,
  status: 'running' | 'complete' | 'error',
  detail: string
) => void;

/**
 * Run the complete Premium 5-Stage Pipeline
 * This is the main entry point that orchestrates all stages
 */
/** Retry an async function with exponential backoff */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries: number = 3,
  baseDelayMs: number = 2000
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isRetryable = lastError.message.includes('empty response')
        || lastError.message.includes('Failed to parse')
        || lastError.message.includes('Rate limit')
        || lastError.message.includes('transient')
        || lastError.message.includes('fetch failed')
        || lastError.message.includes('network')
        || lastError.message.includes('ECONNRESET')
        || lastError.message.includes('timeout');

      if (!isRetryable || attempt === maxRetries) {
        throw lastError;
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(`[${label}] Attempt ${attempt}/${maxRetries} failed: ${lastError.message}. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError!;
}

// Layer 3: Smart retry constants and helpers
const MAX_ITERATIONS = 3;
const SCORE_PASS = 85;
const SCORE_TARGETED_HIGH = 75;
const CONVERGENCE_THRESHOLD = 3;

function getIterationScore(v: ValidationOutput): number {
  return v.scoreBreakdown?.overallScore ?? v.auditScore;
}

function getMaxRetriesForScore(score: number, hardFailCount: number): number {
  if (hardFailCount > 0) return Math.max(1, score < 60 ? 2 : 1);
  if (score >= SCORE_PASS) return 0;
  if (score >= SCORE_TARGETED_HIGH) return 1;
  return 2;
}

export async function runPremiumPipeline(
  epicContent: string,
  onProgress?: PipelineProgressCallback
): Promise<PipelineResult> {
  const startTime = Date.now();
  const stagesCompleted: PipelineStage[] = [];

  // Extract original project title from epic content BEFORE any processing
  const originalProjectTitle = extractProjectTitle(epicContent);

  try {
    // ===== STAGES 1-3: Run once (stable output) =====

    // Stage 1: Deep Comprehension + Requirement Extraction
    onProgress?.(1, 'running', 'Building mental model of the epic...');
    const comprehension = await withRetry(
      () => runStage1Comprehension(epicContent),
      'Stage 1 Comprehension'
    );
    stagesCompleted.push(1);
    const reqCount = comprehension.extractedRequirements?.length ?? 0;
    onProgress?.(1, 'complete', `Identified ${comprehension.keyEntities.length} entities, ${reqCount} requirements extracted`);

    // Stage 2: Category Classification
    onProgress?.(2, 'running', 'Classifying document type...');
    const classification = await withRetry(
      () => runStage2Classification(epicContent, comprehension),
      'Stage 2 Classification'
    );
    stagesCompleted.push(2);
    onProgress?.(2, 'complete', `Classified as ${classification.primaryCategory.replace(/_/g, ' ')} (${Math.round(classification.confidence * 100)}% confidence)`);

    // Stage 3: Structural Assessment
    onProgress?.(3, 'running', 'Assessing document structure...');
    const structural = await withRetry(
      () => runStage3Structural(epicContent, comprehension, classification),
      'Stage 3 Structural'
    );
    stagesCompleted.push(3);
    onProgress?.(3, 'complete', `${structural.transformationPlan.length} transformations planned, ${structural.missingSections.length} missing sections`);

    // Compute expected section count for deterministic scoring
    const template = loadCategoryTemplate(classification.primaryCategory);
    const expectedSectionCount = Object.keys(template.requiredSections).length +
      Math.min(Object.keys(template.optionalSections).length, 3);

    // ===== STAGES 4→5→6: Iterative refinement loop with smart retry =====
    let refinement: RefinementOutput | undefined;
    let mandatory: MandatoryOutput | undefined;
    let validation: ValidationOutput | undefined;
    let previousFailures: string[] = [];
    let iterationsRun = 0;
    let iterationFeedback: IterationFeedback | undefined;

    // Layer 3: Best-of-N tracking
    interface IterationSnapshot {
      refinement: RefinementOutput;
      mandatory: MandatoryOutput;
      validation: ValidationOutput;
      score: number;
      iteration: number;
    }
    let bestResult: IterationSnapshot | null = null;
    const allIterationScores: number[] = [];
    let previousScore: number | null = null;

    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      iterationsRun = iteration;

      // Layer 3: Tiered gate — check if this iteration is allowed
      if (iteration > 1 && bestResult) {
        const maxRetries = getMaxRetriesForScore(bestResult.score, bestResult.validation.hardFailCount);
        if (iteration - 1 > maxRetries) {
          console.log(`[Pipeline] Tiered gate: score=${bestResult.score}, maxRetries=${maxRetries}, stopping at iteration ${iteration}`);
          break;
        }
      }

      // Stage 4: Content Refinement
      const iterLabel = iteration > 1 ? ` (iteration ${iteration})` : '';
      onProgress?.(4, 'running', `Refining content${iterLabel}...`);

      // Pass original epicContent always — do NOT append failure context to epicContent
      // (appending confuses Stage 4 section parsing and causes iteration degradation)
      // Layer 2: Pass iterationFeedback (undefined on iteration 1)
      refinement = await withRetry(
        () => runStage4Refinement(
          epicContent,
          comprehension,
          classification,
          structural,
          originalProjectTitle,
          (current, total, section) => {
            onProgress?.(4, 'running', `Refining section ${current}/${total}: ${section}${iterLabel}`);
          },
          iterationFeedback
        ),
        'Stage 4 Refinement'
      );

      if (!stagesCompleted.includes(4)) stagesCompleted.push(4);
      onProgress?.(4, 'complete', `${refinement.refinedSections.length} sections refined${iterLabel}`);

      // Stage 5: Mandatory Sections (Architecture + User Stories)
      onProgress?.(5, 'running', `Generating architecture diagram and user stories${iterLabel}...`);
      // Layer 2: Pass iterationFeedback to Stage 5
      mandatory = await withRetry(
        () => runStage5Mandatory(refinement!, comprehension, classification, originalProjectTitle, iterationFeedback),
        'Stage 5 Mandatory'
      );

      if (!stagesCompleted.includes(5)) stagesCompleted.push(5);
      onProgress?.(5, 'complete', `Generated diagram + ${mandatory.userStories.length} user stories${iterLabel}`);

      // Stage 6: Validation Gate
      onProgress?.(6, 'running', `Running validation gate${iterLabel}...`);

      try {
        validation = await runStage6Validation(
          mandatory.assembledEpic.markdown,
          comprehension.extractedRequirements || [],
          mandatory.userStories,
          mandatory.architectureDiagram,
          iteration,
          previousFailures.length > 0 ? previousFailures : undefined,
          epicContent, // Pass source epic for [TBD] comparison in failure detection
          comprehension.keyEntities, // Pass entities for diagram scoring
          expectedSectionCount
        );

        if (!stagesCompleted.includes(6)) stagesCompleted.push(6);

        const currentScore = getIterationScore(validation);
        allIterationScores.push(currentScore);

        // Layer 3: Update best result if improved
        if (!bestResult || currentScore > bestResult.score) {
          bestResult = {
            refinement: refinement!,
            mandatory: mandatory!,
            validation,
            score: currentScore,
            iteration
          };
        }

        if (validation.passed) {
          onProgress?.(6, 'complete', `Validation PASSED (score: ${currentScore}, iteration ${iteration})`);
          break; // Success — exit loop
        }

        // Layer 3: Convergence check — if improvement < CONVERGENCE_THRESHOLD and no hard fails fixed, stop
        if (previousScore !== null) {
          const improvement = currentScore - previousScore;
          if (improvement < CONVERGENCE_THRESHOLD && validation.hardFailCount === 0) {
            console.log(`[Pipeline] Convergence: improvement=${improvement} < ${CONVERGENCE_THRESHOLD}, stopping`);
            onProgress?.(6, 'complete', `Validation converged (score: ${currentScore}, improvement: +${improvement}, ${iteration} iterations)`);
            break;
          }
        }

        previousScore = currentScore;

        // Validation failed — collect failures for next iteration
        previousFailures = validation.failureReasons.slice(0, 10);
        const hardFails = validation.hardFailCount;

        // Layer 2: Build structured feedback for next iteration
        iterationFeedback = buildIterationFeedback(
          validation,
          comprehension.extractedRequirements || [],
          mandatory.userStories,
          refinement.refinedSections,
          iteration,
          mandatory.storyPointCorrections
        );

        if (iteration < MAX_ITERATIONS) {
          onProgress?.(6, 'running', `Validation failed (score: ${currentScore}, ${hardFails} hard fails) — retrying with feedback (${iteration}/${MAX_ITERATIONS})...`);
        } else {
          onProgress?.(6, 'complete', `Validation completed (score: ${currentScore}, ${hardFails} hard fails, ${iteration} iterations — best effort)`);
        }
      } catch (validationError) {
        // Validation errors should not break the pipeline — log and continue with best effort
        console.warn('Stage 6 validation error:', validationError);
        if (!stagesCompleted.includes(6)) stagesCompleted.push(6);
        onProgress?.(6, 'complete', `Validation skipped due to error${iterLabel}`);
        break; // Don't retry if validation itself is broken
      }
    }

    const totalDuration = Date.now() - startTime;

    // Layer 3: Best-result return — use best iteration if latest regressed
    const useBest = bestResult && validation
      && getIterationScore(validation) < bestResult.score;
    const finalRefinement = useBest ? bestResult!.refinement : refinement!;
    const finalMandatory = useBest ? bestResult!.mandatory : mandatory!;
    const finalValidation = useBest ? bestResult!.validation : validation;
    const bestIterationUsed = useBest ? bestResult!.iteration : iterationsRun;

    return {
      comprehension,
      classification,
      structural,
      refinement: finalRefinement,
      mandatory: finalMandatory,
      totalDuration,
      stagesCompleted,
      validation: finalValidation,
      iterationsRun,
      bestIterationUsed,
      allIterationScores
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const failedStage = stagesCompleted.length + 1;
    onProgress?.(failedStage as PipelineStage, 'error', errorMessage);
    throw new Error(`Pipeline failed at stage ${failedStage}: ${errorMessage}`);
  }
}

// ===========================================
// BACKWARD COMPATIBILITY WRAPPER
// ===========================================

/**
 * Legacy wrapper: Runs pipeline stages 1-3 and converts to EpicQualityReport
 * This maintains backward compatibility with existing critique functionality
 *
 * @deprecated For new code, use runPremiumPipeline() instead for full results
 */
export async function runPipelineAsCritique(
  epicContent: string
): Promise<EpicQualityReport> {
  // Run stages 1-3 to get structural assessment
  const comprehension = await runStage1Comprehension(epicContent);
  const classification = await runStage2Classification(epicContent, comprehension);
  const structural = await runStage3Structural(epicContent, comprehension, classification);

  // Convert structural scores to SectionFeedback format (using title-based matching)
  const sections: SectionFeedback[] = structural.sectionScores.map((score, index) => {
    const transformation = structural.transformationPlan.find(t =>
      t.sectionTitle.toLowerCase() === score.sectionTitle.toLowerCase()
    );

    return {
      sectionNum: index + 1,  // Generate sequential number for legacy compatibility
      sectionTitle: score.sectionTitle,
      score: score.overallScore,
      status: getStatusFromScore(score.overallScore),
      issues: transformation ? [transformation.rationale] : [],
      suggestions: transformation ? [`Recommended action: ${transformation.action}`] : []
    };
  });

  // Calculate overall score
  const overallScore = sections.length > 0
    ? sections.reduce((sum, s) => sum + s.score, 0) / sections.length
    : 5;

  // Build the quality report
  const categoryLabel = classification.primaryCategory.replace(/_/g, ' ');

  return {
    overallScore: Math.round(overallScore * 10) / 10,
    summary: `${categoryLabel} document (${Math.round(classification.confidence * 100)}% confidence): ${comprehension.projectEssence}`,
    sections,
    criticalIssues: comprehension.implicitRisks,
    strengthAreas: comprehension.keyEntities.slice(0, 3).map(e => `${e.entity}: ${e.description}`),
    missingRequired: structural.missingSections
  };
}

