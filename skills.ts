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

  // Build the epic document - use project name as title
  let epic = `# ${projectName}\n\n`;
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
| Flow quantities, conversions, budget allocation | flow, conversion, funnel, allocation, transfer, from/to | Sankey Diagram | sankey-beta |
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
6. If content describes HIERARCHICAL CONCEPTS → block-beta (structured block diagram)
7. If content describes FLOW QUANTITIES between sources → sankey-beta
8. If content describes PRIORITY/COMPARISON on two axes → quadrantChart
9. If content describes SYSTEM COMPONENTS and their connections → flowchart LR (architecture)
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

## PHASE 9: ARCHITECTURAL LAYERS (for Architecture Diagrams)

Organize left-to-right (LR) or top-to-bottom (TB):

### Layer 1: Client Layer
- Web apps, SPAs, mobile apps
- CLI tools, desktop apps

### Layer 2: Gateway Layer
- Load balancers, API gateways
- Auth, rate limiting

### Layer 3: Service Layer
- Microservices, business logic
- Background workers

### Layer 4: Data Layer
- Databases (PostgreSQL, MySQL, MongoDB)
- Caches (Redis, Memcached)
- Queues (Kafka, RabbitMQ)
- Search (Elasticsearch)
- Storage (S3)

### Layer 5: External Layer
- Payment (Stripe, PayPal)
- Email (SendGrid)
- Third-party APIs

---

## PHASE 10: COMPLETE ARCHITECTURE EXAMPLE (UBS Brand)

\`\`\`
%%{init: {
  'theme': 'base',
  'themeVariables': {
    'primaryColor': '#E60000',
    'primaryTextColor': '#FFFFFF',
    'primaryBorderColor': '#BD000C',
    'secondaryColor': '#5A5D5C',
    'lineColor': '#5A5D5C',
    'clusterBkg': '#ECEBE4',
    'clusterBorder': '#E5E5E5'
  }
}}%%
flowchart LR
    subgraph CL["Clients"]
        WEB[Web App]
        MOB[Mobile App]
    end
    
    subgraph GW["Gateway"]
        LB[Load Balancer]
        AG[API Gateway]
        AUTH[Auth Service]
    end
    
    subgraph SVC["Services"]
        USER[User Service]
        ORD[Order Service]
        PAY[Payment Service]
    end
    
    subgraph DATA["Data Layer"]
        PG[(PostgreSQL)]
        REDIS[(Redis)]
        KAFKA([Kafka])
    end
    
    subgraph EXT["External"]
        STRIPE{{Stripe}}
    end
    
    WEB --> LB
    MOB --> LB
    LB --> AG
    AG --> AUTH
    AUTH --> USER
    AG --> ORD
    ORD --> PAY
    PAY --> STRIPE
    ORD -.-> KAFKA
    USER --> PG
    ORD --> PG
    USER --> REDIS

    linkStyle 0,1 stroke:#BD000C,stroke-width:2.5px
    linkStyle 2 stroke:#5A5D5C,stroke-width:2px
    linkStyle 3 stroke:#BD000C,stroke-width:2px
    linkStyle 4 stroke:#BD000C,stroke-width:2px
    linkStyle 5,6 stroke:#8E8D83,stroke-width:2px
    linkStyle 7 stroke:#E60000,stroke-width:2px
    linkStyle 8 stroke:#5A5D5C,stroke-width:2px,stroke-dasharray:5
    linkStyle 9,10 stroke:#CCCABC,stroke-width:2px
    linkStyle 11 stroke:#CCCABC,stroke-width:2px

    style WEB fill:#E60000,stroke:#BD000C,color:#fff
    style MOB fill:#E60000,stroke:#BD000C,color:#fff
    style LB fill:#5A5D5C,stroke:#000000,color:#fff
    style AG fill:#5A5D5C,stroke:#000000,color:#fff
    style AUTH fill:#BD000C,stroke:#000000,color:#fff
    style USER fill:#8E8D83,stroke:#5A5D5C,color:#fff
    style ORD fill:#8E8D83,stroke:#5A5D5C,color:#fff
    style PAY fill:#8E8D83,stroke:#5A5D5C,color:#fff
    style PG fill:#CCCABC,stroke:#8E8D83,color:#000
    style REDIS fill:#CCCABC,stroke:#8E8D83,color:#000
    style KAFKA fill:#5A5D5C,stroke:#000000,color:#fff
    style STRIPE fill:#E60000,stroke:#BD000C,color:#fff
\`\`\`

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

  return mermaid;
}

// Build a summary of the epic for AI consumption
function buildEpicSummary(data: RefinedData, projectName: string): string {
  let summary = `Project: ${projectName}\n\n`;

  if (data['objective']?.original) {
    summary += `OBJECTIVE:\n${data['objective'].original}\n\n`;
  }
  if (data['architectureOverview']?.original) {
    summary += `ARCHITECTURE:\n${data['architectureOverview'].original}\n\n`;
  }
  if (data['features']?.original) {
    summary += `FEATURES:\n${data['features'].original}\n\n`;
  }
  if (data['userStories']?.original) {
    summary += `USER STORIES:\n${data['userStories'].original}\n\n`;
  }
  if (data['dataStores']?.original) {
    summary += `DATA STORES:\n${data['dataStores'].original}\n\n`;
  }
  if (data['teams']?.original) {
    summary += `TEAMS:\n${data['teams'].original}\n\n`;
  }
  if (data['environments']?.original) {
    summary += `ENVIRONMENTS:\n${data['environments'].original}\n\n`;
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
8. Do NOT include markdown code fences like \`\`\`mermaid or \`\`\``;

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

  // Find the User Stories section (Section 11 or ### User Stories subsection)
  const section11Match = epicContent.match(/##\s*11\.\s*Key Features\s*&?\s*User Stories[\s\S]*?(?=##\s*\d+\.|$)/i);
  const userStoriesMatch = epicContent.match(/###?\s*User Stories[\s\S]*?(?=###?\s*[A-Z]|##\s*\d+\.|$)/i);

  if (!section11Match && !userStoriesMatch) {
    console.log('[parseUserStories] No user stories section found');
    return stories;
  }

  const sectionContent = userStoriesMatch ? userStoriesMatch[0] : (section11Match ? section11Match[0] : epicContent);

  // Pattern 1 (NEW FORMAT): **US-XXX: Professional Title** with blockquote story
  // Matches: **US-001: Implement MFA Authentication** 🔴
  //          > As a user, I want to enable multi-factor authentication, so that my account is secure.
  const newFormatPattern = /\*\*([A-Z]{2,3}-\d+):\s*([^*]+)\*\*[^\n]*\n>\s*As an?\s+([^,]+),?\s*I\s+want\s+([^,]+?)(?:,?\s*so\s+that\s+([^.\n]+))?/gi;

  let match;
  while ((match = newFormatPattern.exec(sectionContent)) !== null) {
    const storyId = match[1]?.trim();           // US-001
    const title = match[2]?.trim();              // Implement MFA Authentication
    const persona = match[3]?.trim();            // user
    const goal = match[4]?.trim();               // enable multi-factor authentication
    const benefit = match[5]?.trim();            // my account is secure

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

  // Pattern 2 (LEGACY FORMAT): "As a [persona], I want [goal] so that [benefit]"
  const asAPattern = /[-*]\s*(?:As an?\s+)([^,]+),?\s*I\s+want\s+([^,]+?)(?:,?\s*so\s+that\s+([^.\n]+))?[.\n]/gi;

  while ((match = asAPattern.exec(sectionContent)) !== null) {
    const persona = match[1]?.trim();
    const goal = match[2]?.trim();
    const benefit = match[3]?.trim();

    const rawText = match[0].trim();
    // Legacy fallback: capitalize goal as title (not ideal, but backward compatible)
    const title = goal ? `${goal.charAt(0).toUpperCase()}${goal.slice(1)}` : rawText;

    stories.push({
      id: `story-${stories.length + 1}-${Date.now()}`,
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
          id: `story-${stories.length + 1}-${Date.now()}`,
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
    console.error(`[${context}] Raw response:`, response.substring(0, 500));
    throw new Error(`Failed to parse ${context} response. Please try again.`);
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

  return {
    projectEssence: parsed.projectEssence || 'Project analysis pending',
    keyEntities: parsed.keyEntities || [],
    detectedGaps: parsed.detectedGaps || [],
    implicitRisks: parsed.implicitRisks || [],
    semanticSections: parsed.semanticSections || [],
    timestamp: Date.now()
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
  projectEssence: string    // Project description for context
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

  const systemPrompt = `You are an expert ${template.expertRole}. Refine this section.

SECTION: ${section.title}
WORD LIMIT: Target ${target} words, maximum ${max} words
TONE: ${template.tone} - ${toneInstruction}
${hint ? `GUIDANCE: ${hint}` : ''}
${formatInstruction ? `\n${formatInstruction}` : ''}

RULES:
1. Target ${target} words, never exceed ${max} words - be concise
2. Be direct - no filler or padding
3. Only essential information
4. Start output with ## ${section.title}
5. Follow the specified format exactly if provided

Return ONLY the refined section content (no JSON, just markdown).`;

  const userPrompt = `PROJECT NAME: ${projectName}
PROJECT CONTEXT: ${projectEssence.substring(0, 200)}

CURRENT CONTENT:
${section.content || '(empty)'}

Refine to target ${target} words (max ${max}). Use the exact project name "${projectName}" when referencing the project:`;

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
  projectName: string  // Actual project title for AI prompts
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

RULES:
1. Target ${target} words, never exceed ${max} words
2. Be specific and actionable
3. No filler content
4. Start with ## ${sectionTitle}
5. Follow the specified format exactly if provided`;

  const userPrompt = `PROJECT NAME: ${projectName}
PROJECT CONTEXT: ${comprehension.projectEssence.substring(0, 200)}

KEY INFO:
${comprehension.keyEntities.slice(0, 5).map(e => `- ${e.entity}: ${e.description}`).join('\n')}

Generate the section (target ${target} words, max ${max}). Use the exact project name "${projectName}" when referencing the project:`;

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
  onProgress?: (current: number, total: number, section: string) => void
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

    // Use throttler to limit concurrent API calls
    // Pass projectName (actual title) for AI prompts, not projectEssence (description)
    const result = await apiThrottler.throttle(() =>
      refineSingleSectionDynamic(
        section,
        score,
        transformation,
        template,
        projectName,
        comprehension.projectEssence
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
  for (const missingSectionTitle of structural.missingSections) {
    processed++;
    if (onProgress) {
      onProgress(processed, total, `Adding: ${missingSectionTitle}`);
    }

    // Use throttler to limit concurrent API calls
    // Pass projectName for consistent naming in generated content
    const generated = await apiThrottler.throttle(() =>
      generateMissingSectionDynamic(
        missingSectionTitle,
        comprehension,
        template,
        projectName
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
  classification: ClassificationOutput
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

  // Combine all refined content
  const allContent = refinement.refinedSections
    .map(s => s.refinedContent)
    .join('\n\n');

  const systemPrompt = `You are an expert Agile coach extracting user stories from technical documentation.

STORY STYLE: ${storyStyle}

YOUR TASK:
1. Extract ALL user needs from the refined content
2. Create a professional, action-oriented TITLE for each story (5-8 words max)
3. Format the story as: "As a [persona], I want [goal], so that [benefit]"
4. Add 2-3 acceptance criteria per story
5. Assign priority (high/medium/low)
6. Note which section the story derives from

TITLE GUIDELINES:
- Start with action verb: Implement, Add, Create, Enable, Configure, Integrate
- Be crisp and scannable (5-8 words maximum)
- Use technical terms appropriately (MFA, API, OAuth, SSO)
- Avoid verbose phrases like "the ability to" or "functionality for"
- Examples: "Implement MFA Authentication", "Add Transaction History Export", "Configure Role-Based Access"

OUTPUT FORMAT:
Return ONLY valid JSON:
{
  "stories": [
    {
      "id": "US-001",
      "title": "<professional action-oriented title, 5-8 words>",
      "persona": "<specific role>",
      "goal": "<what they want>",
      "benefit": "<why they want it>",
      "acceptanceCriteria": ["<AC1>", "<AC2>"],
      "priority": "high|medium|low",
      "sourceSection": "<section title>"
    }
  ],
  "totalRequirements": <number of requirements identified>,
  "uncoveredRequirements": ["<requirement not covered by stories>"]
}`;

  const userPrompt = `EPIC CONTENT:
${allContent.substring(0, 12000)}

Extract comprehensive user stories:`;

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

  // Start with title and GitLab TOC
  let epic = `# ${projectName}\n\n`;
  epic += `[[_TOC_]]\n\n`; // GitLab Table of Contents

  // Separate priority sections (Epic Status) from regular sections
  // Note: TL;DR is now merged into Objective per template v2.1.0
  const prioritySections: typeof refinement.refinedSections = [];
  const regularSections: typeof refinement.refinedSections = [];

  for (const section of refinement.refinedSections) {
    const titleLower = section.sectionTitle.toLowerCase();
    // Epic Status (formerly Metadata Header) goes first
    if (titleLower === 'epic status' || titleLower === 'metadata header') {
      prioritySections.push(section);
    } else {
      regularSections.push(section);
    }
  }

  // Add priority sections first
  for (const section of prioritySections) {
    let content = section.refinedContent.trim();
    if (!content.startsWith('##')) {
      content = `## ${section.sectionTitle}\n\n${content}`;
    }
    epic += content + '\n\n';
  }

  // Add separator after priority sections if any were added
  if (prioritySections.length > 0) {
    epic += `*Generated on ${new Date().toLocaleDateString()}*\n\n---\n\n`;
  } else {
    epic += `*Generated on ${new Date().toLocaleDateString()}*\n\n---\n\n`;
  }

  // Track if we've already embedded diagram/stories (only embed once)
  let diagramEmbedded = false;
  let storiesEmbedded = false;

  // Add all regular sections in their original order
  for (const section of regularSections) {
    let content = section.refinedContent.trim();

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
      const priorityEmoji = defaults.priorityLevels;
      content += '\n\n### User Stories\n\n';
      for (const story of stories) {
        const emoji = priorityEmoji[story.priority] || '';
        // Use title if available, fallback to goal for backward compatibility
        const storyTitle = story.title || story.goal;
        content += `**${story.id}: ${storyTitle}** ${emoji}\n`;
        content += `> As a ${story.persona}, I want ${story.goal}, so that ${story.benefit}.\n\n`;
        if (story.acceptanceCriteria && story.acceptanceCriteria.length > 0) {
          content += 'Acceptance Criteria:\n';
          story.acceptanceCriteria.forEach(ac => {
            content += `- [ ] ${ac}\n`;
          });
          content += '\n';
        }
      }
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
    for (const story of stories) {
      const emoji = priorityEmoji[story.priority] || '';
      epic += `**${story.id}** ${emoji} ${story.priority.toUpperCase()}\n`;
      epic += `As a ${story.persona}, I want ${story.goal}, so that ${story.benefit}.\n\n`;
    }
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

/**
 * Stage 5: Generate blueprint, user stories, and assemble with embedding
 */
export async function runStage5Mandatory(
  refinement: RefinementOutput,
  comprehension: ComprehensionOutput,
  classification: ClassificationOutput,
  originalProjectTitle?: string
): Promise<MandatoryOutput> {
  // Use original title if provided, otherwise extract from comprehension (fallback)
  const projectName = originalProjectTitle || 'Epic';

  // Run 5A and 5B sequentially to avoid rate limiting
  // Blueprint generation is heavy on tokens, so we run it first
  // Pass projectName to ensure diagram uses correct title (not derived from comprehension)
  const architecture = await runStage5AArchitecture(refinement, comprehension, projectName);

  // Small delay between heavy operations
  await new Promise(resolve => setTimeout(resolve, 1000));

  const userStoriesResult = await runStage5BUserStories(refinement, classification);

  // Assemble epic with embedded content
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
    assembledEpic
  };
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
export async function runPremiumPipeline(
  epicContent: string,
  onProgress?: PipelineProgressCallback
): Promise<PipelineResult> {
  const startTime = Date.now();
  const stagesCompleted: (1 | 2 | 3 | 4 | 5)[] = [];

  // Extract original project title from epic content BEFORE any processing
  const originalProjectTitle = extractProjectTitle(epicContent);

  try {
    // Stage 1: Deep Comprehension
    onProgress?.(1, 'running', 'Building mental model of the epic...');
    const comprehension = await runStage1Comprehension(epicContent);
    stagesCompleted.push(1);
    onProgress?.(1, 'complete', `Identified ${comprehension.keyEntities.length} entities, ${comprehension.detectedGaps.length} gaps`);

    // Stage 2: Category Classification
    onProgress?.(2, 'running', 'Classifying document type...');
    const classification = await runStage2Classification(epicContent, comprehension);
    stagesCompleted.push(2);
    onProgress?.(2, 'complete', `Classified as ${classification.primaryCategory.replace(/_/g, ' ')} (${Math.round(classification.confidence * 100)}% confidence)`);

    // Stage 3: Structural Assessment
    onProgress?.(3, 'running', 'Assessing document structure...');
    const structural = await runStage3Structural(epicContent, comprehension, classification);
    stagesCompleted.push(3);
    onProgress?.(3, 'complete', `${structural.transformationPlan.length} transformations planned, ${structural.missingSections.length} missing sections`);

    // Stage 4: Content Refinement (with progress updates)
    // Pass originalProjectTitle so AI uses correct project name in prompts
    onProgress?.(4, 'running', 'Refining content...');
    const refinement = await runStage4Refinement(
      epicContent,
      comprehension,
      classification,
      structural,
      originalProjectTitle,
      (current, total, section) => {
        onProgress?.(4, 'running', `Refining section ${current}/${total}: ${section}`);
      }
    );
    stagesCompleted.push(4);
    onProgress?.(4, 'complete', `${refinement.refinedSections.length} sections refined`);

    // Stage 5: Mandatory Sections
    onProgress?.(5, 'running', 'Generating architecture diagram and user stories...');
    const mandatory = await runStage5Mandatory(refinement, comprehension, classification, originalProjectTitle);
    stagesCompleted.push(5);
    onProgress?.(5, 'complete', `Generated diagram + ${mandatory.userStories.length} user stories`);

    const totalDuration = Date.now() - startTime;

    return {
      comprehension,
      classification,
      structural,
      refinement,
      mandatory,
      totalDuration,
      stagesCompleted
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const failedStage = stagesCompleted.length + 1;
    onProgress?.(failedStage as 1 | 2 | 3 | 4 | 5, 'error', errorMessage);
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

