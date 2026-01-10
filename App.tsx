// Epic Generator - Main Application with AI Assistance

import { useState, useCallback, useEffect, useRef } from 'react';
import { STAGES, EPIC_SECTIONS, type EpicState, type ChatMessage, type ChatState } from './types';
import { runSkill, getSuggestion, generatePlantUMLBlueprint, generateIntelligentBlueprint, fixMermaidDiagram, analyzeUserFeedback, processFeedback, setConfig as setSkillsConfig, type RefineResult, type GenerateResult } from './skills';
import MarkdownPreview from './MarkdownPreview';
import mermaid from 'mermaid';

// Initialize Mermaid for blueprint rendering
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: 'Frutiger, Helvetica Neue, Arial, sans-serif',
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
    curve: 'basis',
  },
});
import {
  type AppConfig,
  type ModelFamily,
  type AIProvider,
  type GitLabBranch,
  type GitLabFile,
  DEFAULT_CONFIG,
  AZURE_API_VERSIONS,
  OPENAI_MODELS,
  MODEL_LIMITS,
  detectModelFamily,
  getOpenAIModelFamily,
  loadConfig,
  saveConfig,
  publishToGitLab,
  testGitLabConnection,
  testAzureOpenAI,
  testOpenAI,
  fetchGitLabSubgroups,
  fetchGitLabEpics,
  fetchGitLabBranches,
  fetchGitLabRepositoryTree,
  fetchGitLabFileContent,
  publishWithMergeRequest,
  isAIEnabled,
  getActiveAIProvider,
} from './config';

// ============================================
// TOAST NOTIFICATION SYSTEM
// ============================================
type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  exiting?: boolean;
}

const ToastIcon = ({ type }: { type: ToastType }) => {
  switch (type) {
    case 'success':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      );
    case 'error':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      );
    case 'warning':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
      );
    default:
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      );
  }
};

// ============================================
// CONFETTI COMPONENT
// ============================================
const Confetti = ({ active }: { active: boolean }) => {
  const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
  const pieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: 8 + Math.random() * 8,
  }));

  if (!active) return null;

  return (
    <div className="confetti-container">
      {pieces.map(piece => (
        <div
          key={piece.id}
          className="confetti-piece"
          style={{
            left: `${piece.left}%`,
            width: piece.size,
            height: piece.size,
            backgroundColor: piece.color,
            animationDelay: `${piece.delay}s`,
          }}
        />
      ))}
    </div>
  );
};

// Initial state
const initialState: EpicState = {
  currentStage: 0,
  data: {},
  diagramNodes: [],
  generatedEpic: null,
};

// Styles with Glass Morphism + Gradients + Micro-animations
const styles = {
  // Main container with subtle background
  container: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '24px 32px',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    minHeight: '100vh',
  },
  // Modern header with UBS FRAME branding
  header: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginBottom: '32px',
    paddingBottom: '24px',
    borderBottom: '1px solid #e5e7eb',
  },
  headerIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
  },
  headerContent: {
    textAlign: 'left' as const,
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#1a1a2e',
    letterSpacing: '-0.5px',
    margin: 0,
  },
  subtitle: {
    color: '#6b7280',
    marginTop: '4px',
    fontSize: '14px',
  },
  // Enhanced progress indicator with labels
  progressContainer: {
    marginBottom: '28px',
    padding: '16px 24px',
    background: 'rgba(255, 255, 255, 0.7)',
    backdropFilter: 'blur(8px)',
    borderRadius: '12px',
    border: '1px solid #e5e7eb',
  },
  progress: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '0',
  },
  progressStep: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '8px',
    flex: 1,
    position: 'relative' as const,
  },
  progressDot: (active: boolean, completed: boolean) => ({
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: completed ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : active ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : '#f3f4f6',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: active ? '0 4px 12px rgba(59, 130, 246, 0.3)' : completed ? '0 2px 8px rgba(16, 185, 129, 0.2)' : 'none',
    transform: active ? 'scale(1.1)' : 'scale(1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: completed || active ? 'white' : '#9ca3af',
    fontSize: '14px',
    fontWeight: '600',
    border: active ? 'none' : completed ? 'none' : '2px solid #e5e7eb',
    zIndex: 1,
  }),
  progressLabel: (active: boolean, completed: boolean) => ({
    fontSize: '11px',
    fontWeight: active ? '600' : '500',
    color: active ? '#3b82f6' : completed ? '#10b981' : '#9ca3af',
    textAlign: 'center' as const,
    maxWidth: '80px',
    lineHeight: '1.3',
  }),
  progressLine: (completed: boolean) => ({
    position: 'absolute' as const,
    top: '18px',
    left: '50%',
    width: '100%',
    height: '2px',
    background: completed ? 'linear-gradient(90deg, #10b981, #10b981)' : '#e5e7eb',
    zIndex: 0,
  }),
  card: {
    background: 'rgba(255, 255, 255, 0.9)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    marginBottom: '20px',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  stageTitle: { fontSize: '20px', fontWeight: '600', marginBottom: '8px', color: '#1a1a2e' },
  stageDesc: { color: '#666', marginBottom: '20px' },
  fieldGroup: { marginBottom: '20px' },
  labelRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
  label: { fontWeight: '500', color: '#374151' },
  input: { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' as const },
  textarea: { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', minHeight: '100px', resize: 'vertical' as const, boxSizing: 'border-box' as const },
  buttonRow: { display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' },
  button: (primary: boolean) => ({
    padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '500',
    background: primary ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : '#e5e7eb',
    color: primary ? 'white' : '#374151',
    boxShadow: primary ? '0 2px 4px rgba(59, 130, 246, 0.3)' : 'none',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  }),
  suggestButton: {
    padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
    background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
    color: 'white', fontSize: '12px', fontWeight: '500',
    display: 'flex', alignItems: 'center', gap: '4px',
    boxShadow: '0 2px 4px rgba(139, 92, 246, 0.3)',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  suggestButtonAuto: {
    padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    color: 'white', fontSize: '12px', fontWeight: '500',
    display: 'flex', alignItems: 'center', gap: '4px',
    boxShadow: '0 2px 4px rgba(16, 185, 129, 0.3)',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  suggestButtonLoading: {
    padding: '4px 10px', borderRadius: '6px', border: '1px solid #d1d5db', cursor: 'not-allowed',
    background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s ease-in-out infinite',
    color: '#9ca3af', fontSize: '12px', fontWeight: '500',
  },
  suggestButtonGroup: {
    display: 'flex', gap: '6px', alignItems: 'center',
  },
  refinedSection: {
    marginTop: '12px', padding: '12px', backgroundColor: '#f0fdf4', borderRadius: '8px',
    border: '1px solid #bbf7d0',
  },
  refinedHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px',
  },
  refinedBadge: {
    display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px',
    backgroundColor: '#dcfce7', color: '#166534', borderRadius: '4px', fontSize: '12px', fontWeight: '500',
  },
  editButton: {
    padding: '2px 8px', borderRadius: '4px', border: '1px solid #22c55e', cursor: 'pointer',
    backgroundColor: 'white', color: '#22c55e', fontSize: '11px',
  },
  refinedTextarea: {
    width: '100%', padding: '8px', border: '1px solid #bbf7d0', borderRadius: '6px',
    fontSize: '13px', backgroundColor: 'white', minHeight: '80px', resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
  },
  refinedPreview: {
    fontSize: '13px', color: '#374151', whiteSpace: 'pre-wrap' as const, lineHeight: '1.5',
  },
  alternativesSection: {
    marginTop: '8px', padding: '8px', backgroundColor: '#faf5ff', borderRadius: '6px',
    border: '1px dashed #c4b5fd',
  },
  alternativeChip: {
    display: 'inline-block', padding: '4px 8px', margin: '2px', borderRadius: '4px',
    backgroundColor: 'white', border: '1px solid #c4b5fd', cursor: 'pointer', fontSize: '12px',
    color: '#7c3aed',
  },
  // Modern tab navigation
  tabsContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    padding: '6px',
    background: '#f3f4f6',
    borderRadius: '12px',
  },
  tabsGroup: {
    display: 'flex',
    gap: '4px',
  },
  tabs: { display: 'flex', gap: '4px', marginBottom: '16px' },
  tab: (active: boolean) => ({
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    background: active ? 'white' : 'transparent',
    color: active ? '#1a1a2e' : '#6b7280',
    fontWeight: '500',
    fontSize: '14px',
    boxShadow: active ? '0 2px 8px rgba(0, 0, 0, 0.08)' : 'none',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  }),
  tabIcon: {
    width: '16px',
    height: '16px',
    opacity: 0.7,
  },
  sectionPreview: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '6px',
    marginTop: '12px'
  },
  sectionChip: (populated: boolean) => ({
    padding: '6px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    lineHeight: '1.3',
    backgroundColor: populated ? '#dcfce7' : '#f3f4f6',
    color: populated ? '#166534' : '#6b7280',
    border: populated ? '1px solid #bbf7d0' : '1px solid #e5e7eb',
    minHeight: '36px',
    display: 'flex',
    alignItems: 'center',
  }),
  helpBanner: {
    padding: '12px 16px',
    background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
    borderRadius: '8px',
    marginBottom: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    border: '1px solid #bfdbfe',
  },
  helpIcon: { fontSize: '18px', display: 'flex', alignItems: 'center', color: '#3b82f6' },
  helpText: { fontSize: '13px', color: '#1e40af', lineHeight: '1.4' },
  // Split screen styles
  splitContainer: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    height: 'calc(100vh - 200px)',
    minHeight: '600px',
  },
  splitPane: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    overflow: 'hidden',
  },
  paneHeader: {
    padding: '12px 16px',
    background: 'linear-gradient(135deg, #f6f8fa 0%, #eef2f6 100%)',
    borderBottom: '1px solid #d0d7de',
    fontWeight: '600',
    fontSize: '14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: '8px 8px 0 0',
  },
  editorPane: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    border: '1px solid #d0d7de',
    borderRadius: '8px',
    overflow: 'hidden',
    backgroundColor: 'white',
  },
  previewPane: {
    flex: 1,
    border: '1px solid #d0d7de',
    borderRadius: '8px',
    overflow: 'auto',
    backgroundColor: 'white',
  },
  editor: {
    flex: 1,
    width: '100%',
    padding: '16px',
    border: 'none',
    outline: 'none',
    resize: 'none' as const,
    fontSize: '14px',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    lineHeight: '1.6',
    boxSizing: 'border-box' as const,
  },
  actionBar: {
    padding: '12px 16px',
    backgroundColor: '#f6f8fa',
    borderTop: '1px solid #d0d7de',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
};

export default function App() {
  const [state, setState] = useState<EpicState>(initialState);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [editingRefined, setEditingRefined] = useState<Record<string, boolean>>({});
  const [loadingSuggestion, setLoadingSuggestion] = useState<Record<string, boolean>>({});
  const [alternatives, setAlternatives] = useState<Record<string, string[]>>({});
  const [isRefining, setIsRefining] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'wizard' | 'epic' | 'blueprint' | 'settings'>('wizard');
  const [editableEpic, setEditableEpic] = useState<string>('');
  const [blueprintCode, setBlueprintCode] = useState<string>('');
  const [blueprintType, setBlueprintType] = useState<string>('');
  const [blueprintReasoning, setBlueprintReasoning] = useState<string>('');
  const [isGeneratingBlueprint, setIsGeneratingBlueprint] = useState(false);
  const [blueprintZoom, setBlueprintZoom] = useState<number>(100); // Zoom percentage
  const [blueprintFullscreen, setBlueprintFullscreen] = useState(false); // Fullscreen mode
  const [blueprintSvg, setBlueprintSvg] = useState<string>(''); // SVG content for export

  // Config state
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [gitlabTestStatus, setGitlabTestStatus] = useState<{ testing: boolean; result?: string } | null>(null);
  const [azureTestStatus, setAzureTestStatus] = useState<{ testing: boolean; result?: string } | null>(null);
  const [openaiTestStatus, setOpenaiTestStatus] = useState<{ testing: boolean; result?: string } | null>(null);

  // GitLab Pods/Epics dropdown state
  const [pods, setPods] = useState<Array<{ id: number; name: string; path: string }>>([]);
  const [epics, setEpics] = useState<Array<{ id: number; name: string; path: string; type: 'subgroup' | 'project' }>>([]);
  const [loadingPods, setLoadingPods] = useState(false);
  const [loadingEpics, setLoadingEpics] = useState(false);

  // Direct project selection from group
  const [groupProjects, setGroupProjects] = useState<Array<{ id: number; name: string; path: string }>>([]);
  const [loadingGroupProjects, setLoadingGroupProjects] = useState(false);

  // Phase 8-10: New GitLab states
  const [branches, setBranches] = useState<GitLabBranch[]>([]);
  const [navigationStack, setNavigationStack] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [publishMode, setPublishMode] = useState<'direct' | 'mr'>('direct');
  const [repositoryFiles, setRepositoryFiles] = useState<GitLabFile[]>([]);
  const [currentRepoPath, setCurrentRepoPath] = useState<string>('');
  const [loadingRepoFiles, setLoadingRepoFiles] = useState(false);
  const [selectedProjectName, setSelectedProjectName] = useState<string>('');

  // Toast notifications state
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  // Confetti state
  const [showConfetti, setShowConfetti] = useState(false);

  // Generation progress state
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 17, section: '' });

  // Chat/Feedback state
  const [chatState, setChatState] = useState<ChatState>({
    messages: [],
    isOpen: false,
    isProcessing: false,
  });
  const [chatInput, setChatInput] = useState('');
  const chatMessagesRef = useRef<HTMLDivElement>(null);

  // Toast helper function
  const showToast = useCallback((type: ToastType, title: string, message?: string, duration = 3000) => {
    const id = `toast-${++toastIdRef.current}`;
    setToasts(prev => [...prev, { id, type, title, message, duration }]);

    // Auto dismiss
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 300);
    }, duration);
  }, []);

  // Trigger confetti
  const triggerConfetti = useCallback(() => {
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 3000);
  }, []);

  // ============================================
  // CHAT/FEEDBACK FUNCTIONS
  // ============================================

  // Toggle chat panel
  const toggleChat = useCallback(() => {
    setChatState(prev => ({ ...prev, isOpen: !prev.isOpen }));
  }, []);

  // Add message to chat
  const addChatMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    setChatState(prev => ({
      ...prev,
      messages: [...prev.messages, {
        ...message,
        id: `msg-${Date.now()}`,
        timestamp: new Date(),
      }],
    }));
    // Scroll to bottom
    setTimeout(() => {
      chatMessagesRef.current?.scrollTo({ top: chatMessagesRef.current.scrollHeight, behavior: 'smooth' });
    }, 100);
  }, []);

  // Replace section in epic markdown
  const replaceSection = useCallback((epic: string, sectionNum: number, newContent: string): string => {
    const sectionInfo = EPIC_SECTIONS[sectionNum - 1];
    if (!sectionInfo) return epic;

    // Escape special regex characters in section title
    const escapedTitle = sectionInfo.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Match the section header and its content until the next section or end
    const sectionRegex = new RegExp(
      `(## ${sectionNum}\\. ${escapedTitle}[\\s\\S]*?)(?=## \\d+\\.|$)`,
      'i'
    );

    return epic.replace(sectionRegex, newContent + '\n\n');
  }, []);

  // Handle section selection from chat dropdown
  const handleSectionSelect = useCallback(async (sectionNum: number, messageId: string) => {
    if (!chatState.pendingFeedback) return;

    // Mark the question as answered
    setChatState(prev => ({
      ...prev,
      messages: prev.messages.map(m =>
        m.id === messageId ? { ...m, isAnswered: true, selectedValue: `${sectionNum}` } : m
      ),
      isProcessing: true,
      pendingSection: sectionNum,
    }));

    try {
      const result = await processFeedback(chatState.pendingFeedback, editableEpic, sectionNum);

      // Update the epic with the new section
      const updatedEpic = replaceSection(editableEpic, sectionNum, result.updatedSection);
      setEditableEpic(updatedEpic);

      addChatMessage({
        role: 'assistant',
        content: `Done! ${result.explanation}`,
      });

      showToast('success', 'Section Updated', `Updated: ${EPIC_SECTIONS[sectionNum - 1].title}`);
    } catch (err) {
      console.error('Failed to process feedback:', err);
      addChatMessage({
        role: 'assistant',
        content: 'Sorry, I failed to update the section. Please try again.',
      });
      showToast('error', 'Update Failed', 'Could not update the section');
    } finally {
      setChatState(prev => ({
        ...prev,
        isProcessing: false,
        pendingSection: undefined,
        pendingFeedback: undefined,
      }));
    }
  }, [chatState.pendingFeedback, editableEpic, replaceSection, addChatMessage, showToast]);

  // Handle confirm button (when AI suggests a section)
  const handleConfirmSection = useCallback(async (confirmed: boolean, messageId: string) => {
    // Mark the question as answered
    setChatState(prev => ({
      ...prev,
      messages: prev.messages.map(m =>
        m.id === messageId ? { ...m, isAnswered: true, selectedValue: confirmed ? 'yes' : 'no' } : m
      ),
    }));

    if (confirmed && chatState.pendingSection) {
      await handleSectionSelect(chatState.pendingSection, messageId);
    } else {
      // User said no, ask which section they want
      addChatMessage({
        role: 'assistant',
        content: 'Which section would you like me to update instead?',
        questionType: 'section-select',
        options: EPIC_SECTIONS.map(s => `${s.num}. ${s.title}`),
      });
    }
  }, [chatState.pendingSection, handleSectionSelect, addChatMessage]);

  // Handle sending a chat message
  const handleSendChatMessage = useCallback(async () => {
    if (!chatInput.trim() || chatState.isProcessing) return;

    const feedback = chatInput.trim();
    setChatInput('');

    // Add user message
    addChatMessage({ role: 'user', content: feedback });

    // Store the feedback for later use
    setChatState(prev => ({
      ...prev,
      isProcessing: true,
      pendingFeedback: feedback,
    }));

    try {
      // Analyze feedback to determine section
      const analysis = await analyzeUserFeedback(
        feedback,
        EPIC_SECTIONS.map(s => s.title)
      );

      if (analysis.needsClarification || !analysis.suggestedSection) {
        // Ask which section to update
        addChatMessage({
          role: 'assistant',
          content: analysis.followUpQuestion || 'Which section would you like me to update?',
          questionType: 'section-select',
          options: EPIC_SECTIONS.map(s => `${s.num}. ${s.title}`),
        });
        setChatState(prev => ({ ...prev, isProcessing: false }));
      } else {
        // AI detected a section - confirm with user
        const sectionTitle = EPIC_SECTIONS[analysis.suggestedSection - 1]?.title || 'Unknown';
        addChatMessage({
          role: 'assistant',
          content: `I'll update section ${analysis.suggestedSection} "${sectionTitle}". Is that correct?`,
          questionType: 'confirm',
        });
        setChatState(prev => ({
          ...prev,
          isProcessing: false,
          pendingSection: analysis.suggestedSection,
        }));
      }
    } catch (err) {
      console.error('Failed to analyze feedback:', err);
      addChatMessage({
        role: 'assistant',
        content: 'Sorry, I encountered an error. Which section would you like me to update?',
        questionType: 'section-select',
        options: EPIC_SECTIONS.map(s => `${s.num}. ${s.title}`),
      });
      setChatState(prev => ({ ...prev, isProcessing: false }));
    }
  }, [chatInput, chatState.isProcessing, addChatMessage]);

  // Load config on mount
  useEffect(() => {
    const loaded = loadConfig();
    setConfig(loaded);
    setSkillsConfig(loaded); // Pass config to skills module for AI calls
  }, []);

  // Save config when it changes
  const updateConfig = (newConfig: AppConfig) => {
    setConfig(newConfig);
    saveConfig(newConfig);
    setSkillsConfig(newConfig); // Update skills module config for AI calls
  };

  const currentStage = STAGES[state.currentStage];
  const isLastStage = state.currentStage === STAGES.length - 1;
  const hasEpic = state.generatedEpic !== null;

  // Build context from all data
  const getContext = useCallback(() => {
    const context: Record<string, string> = {};
    Object.entries(formData).forEach(([key, value]) => {
      context[key] = value;
    });
    Object.entries(state.data).forEach(([key, value]) => {
      context[key] = value.original;
    });
    return context;
  }, [formData, state.data]);

  // Handle field input
  const handleFieldChange = (fieldName: string, value: string) => {
    setFormData(prev => ({ ...prev, [fieldName]: value }));
  };

  // Handle refined content edit
  const handleRefinedChange = (fieldName: string, value: string) => {
    setState(prev => ({
      ...prev,
      data: {
        ...prev.data,
        [fieldName]: {
          ...prev.data[fieldName],
          refined: value,
        },
      },
    }));
  };

  // Get AI suggestion for a field
  // mode: 'with-context' uses user's input as keywords, 'auto' generates from scratch
  // Typewriter state
  const [typingField, setTypingField] = useState<string | null>(null);

  // Typewriter effect function
  const typewriterEffect = useCallback((fieldName: string, text: string, speed = 15) => {
    setTypingField(fieldName);
    let index = 0;
    setFormData(prev => ({ ...prev, [fieldName]: '' }));

    const typeInterval = setInterval(() => {
      if (index < text.length) {
        setFormData(prev => ({
          ...prev,
          [fieldName]: text.slice(0, index + 1),
        }));
        index++;
      } else {
        clearInterval(typeInterval);
        setTypingField(null);
      }
    }, speed);

    return () => clearInterval(typeInterval);
  }, []);

  const handleGetSuggestion = async (fieldName: string, mode: 'with-context' | 'auto') => {
    setLoadingSuggestion(prev => ({ ...prev, [fieldName]: true }));

    const context = getContext();

    // If 'with-context' mode and user has typed something, include it as hint
    if (mode === 'with-context' && formData[fieldName]?.trim()) {
      context['_userHint'] = formData[fieldName].trim();
    }

    const result = await getSuggestion(currentStage.id, fieldName, context, mode);

    // Use typewriter effect for the suggestion
    typewriterEffect(fieldName, result.suggestion);

    if (result.alternatives) {
      setAlternatives(prev => ({ ...prev, [fieldName]: result.alternatives! }));
    }

    setLoadingSuggestion(prev => ({ ...prev, [fieldName]: false }));
  };

  // Use an alternative suggestion
  const handleUseAlternative = (fieldName: string, alt: string) => {
    setFormData(prev => ({ ...prev, [fieldName]: alt }));
  };

  // Refine current stage inputs
  const refineStage = useCallback(async () => {
    setIsRefining(true);
    const newData = { ...state.data };
    const newDiagramNodes = [...state.diagramNodes];

    const context = getContext();

    // Refine each field in the current stage
    for (const field of currentStage.fields) {
      const input = formData[field.name] || '';
      if (input.trim()) {
        const result = await runSkill('refine', {
          stageId: currentStage.id,
          fieldName: field.name,
          input,
          context,
        }) as RefineResult;

        newData[field.name] = {
          original: input,
          refined: result.refined,
          diagramNode: result.diagramNode,
        };

        // Only add diagram node if not already present
        if (!newDiagramNodes.includes(result.diagramNode)) {
          newDiagramNodes.push(result.diagramNode);
        }
      }
    }

    setState(prev => ({
      ...prev,
      data: newData,
      diagramNodes: newDiagramNodes,
    }));
    setIsRefining(false);
  }, [currentStage, formData, state.data, state.diagramNodes, getContext]);

  // Navigate to next stage
  const nextStage = async () => {
    await refineStage();
    if (isLastStage) {
      generateEpic();
    } else {
      setState(prev => ({ ...prev, currentStage: prev.currentStage + 1 }));
      setFormData({});
      setAlternatives({});
      setEditingRefined({});
    }
  };

  // Navigate to previous stage
  const prevStage = () => {
    if (state.currentStage > 0) {
      setState(prev => ({ ...prev, currentStage: prev.currentStage - 1 }));
      // Restore form data for previous stage
      const prevStageFields = STAGES[state.currentStage - 1].fields;
      const restoredData: Record<string, string> = {};
      prevStageFields.forEach(field => {
        if (state.data[field.name]) {
          restoredData[field.name] = state.data[field.name].original;
        }
      });
      setFormData(restoredData);
      setAlternatives({});
      setEditingRefined({});
    }
  };

  // Generate final epic with progress tracking
  const generateEpic = async () => {
    setIsGenerating(true);
    const projectName = state.data['projectName']?.original || 'Untitled Project';

    // Simulate progress through sections
    const sections = [
      'Objective', 'Background & Context', 'Scope', 'Assumptions',
      'Architecture Overview', 'Architecture Diagrams', 'Team & Roles',
      'Environments & CI/CD', 'Data Security', 'Data Stores & Services',
      'Key Features', 'Non-Functional Requirements', 'Dependencies & Risks',
      'Deliverables', 'Next Steps', 'Definition of Done', 'Approvals'
    ];

    // Animate progress
    for (let i = 0; i < sections.length; i++) {
      setGenerationProgress({ current: i + 1, total: 17, section: sections[i] });
      await new Promise(resolve => setTimeout(resolve, 100)); // Brief delay for visual effect
    }

    const result = await runSkill('generate', {
      data: state.data,
      projectName,
    }) as GenerateResult;

    setState(prev => ({ ...prev, generatedEpic: result.epic }));
    setEditableEpic(result.epic);

    // Generate PlantUML blueprint - use intelligent generation
    setIsGeneratingBlueprint(true);
    setGenerationProgress({ current: 17, total: 17, section: 'Generating Blueprint...' });
    try {
      const blueprintResult = await generateIntelligentBlueprint(state.data, projectName);
      setBlueprintCode(blueprintResult.diagram);
      setBlueprintType(blueprintResult.type);
      setBlueprintReasoning(blueprintResult.reasoning);
    } catch (error) {
      // Fallback to legacy blueprint if intelligent generation fails
      console.error('Intelligent blueprint failed, using legacy:', error);
      const blueprint = generatePlantUMLBlueprint(state.data, projectName);
      setBlueprintCode(blueprint);
      setBlueprintType('multilayer');
      setBlueprintReasoning('Using comprehensive 7-layer epic blueprint.');
    }
    setIsGeneratingBlueprint(false);

    setActiveTab('epic');
    setIsGenerating(false);

    // Trigger confetti celebration!
    triggerConfetti();
    showToast('success', 'Epic Generated!', 'Your 17-section epic document is ready.');
  };

  // Reset and start over
  const resetWizard = () => {
    setState(initialState);
    setFormData({});
    setAlternatives({});
    setEditingRefined({});
    setEditableEpic('');
    setBlueprintCode('');
    setBlueprintType('');
    setBlueprintReasoning('');
    setActiveTab('wizard');
  };

  // Check which sections will be populated
  const getPopulatedSections = () => {
    const populated = new Set<number>();
    STAGES.slice(0, state.currentStage + 1).forEach(stage => {
      const hasData = stage.fields.some(f => state.data[f.name]?.refined);
      if (hasData) {
        stage.populatesSections.forEach(s => populated.add(s));
      }
    });
    return populated;
  };

  const populatedSections = getPopulatedSections();

  // Render wizard stage
  const renderWizard = () => (
    <div style={styles.card}>
      {/* Help banner */}
      <div style={styles.helpBanner}>
        <span style={styles.helpIcon}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm6.5-.25A.75.75 0 017.25 7h1a.75.75 0 01.75.75v2.75h.25a.75.75 0 010 1.5h-2a.75.75 0 010-1.5h.25v-2h-.25a.75.75 0 01-.75-.75zM8 6a1 1 0 100-2 1 1 0 000 2z"/>
          </svg>
        </span>
        <span style={styles.helpText}>
          <span style={{ fontWeight: '500', color: '#1a1a1a' }}>Two ways to get suggestions</span> — Type keywords then click <span style={{ background: '#1a1a1a', color: '#ffffff', padding: '3px 10px', fontSize: '9px', fontWeight: 400, textTransform: 'uppercase' as const, letterSpacing: '1px', marginLeft: '4px', marginRight: '4px' }}>Refine</span> for tailored content, or click <span style={{ background: '#E60000', color: '#ffffff', padding: '3px 10px', fontSize: '9px', fontWeight: 400, textTransform: 'uppercase' as const, letterSpacing: '1px', marginLeft: '4px' }}>Auto</span> for AI-generated suggestions.
        </span>
      </div>

      <div style={styles.stageTitle}>
        Stage {state.currentStage + 1}: {currentStage.title}
      </div>
      <div style={styles.stageDesc}>{currentStage.description}</div>

      {currentStage.fields.map(field => {
        const hasRefined = state.data[field.name]?.refined;
        const isEditing = editingRefined[field.name];
        const isLoadingSuggestion = loadingSuggestion[field.name];
        const fieldAlternatives = alternatives[field.name];

        return (
          <div key={field.name} style={styles.fieldGroup}>
            {/* Label row with dual-mode suggest buttons */}
            <div style={styles.labelRow}>
              <label style={styles.label}>
                {field.label}
                {field.required && <span style={{ color: '#ef4444' }}> *</span>}
              </label>
              <div style={styles.suggestButtonGroup}>
                {/* With Context button - uses user's keywords */}
                <button
                  style={isLoadingSuggestion ? styles.suggestButtonLoading : styles.suggestButton}
                  onClick={() => handleGetSuggestion(field.name, 'with-context')}
                  disabled={isLoadingSuggestion || !formData[field.name]?.trim()}
                  title={formData[field.name]?.trim() ? 'Generate suggestion based on your keywords' : 'Type some keywords first'}
                >
                  {isLoadingSuggestion ? (
                    '...'
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: 4 }}>
                        <path d="M8 4a.5.5 0 01.5.5v3h3a.5.5 0 010 1h-3v3a.5.5 0 01-1 0v-3h-3a.5.5 0 010-1h3v-3A.5.5 0 018 4z"/>
                        <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1 8a7 7 0 1114 0A7 7 0 011 8z"/>
                      </svg>
                      Refine
                    </>
                  )}
                </button>
                {/* Auto suggest button - generates from scratch */}
                <button
                  style={isLoadingSuggestion ? styles.suggestButtonLoading : styles.suggestButtonAuto}
                  onClick={() => handleGetSuggestion(field.name, 'auto')}
                  disabled={isLoadingSuggestion}
                  title="Generate suggestion automatically from project context"
                >
                  {isLoadingSuggestion ? (
                    '...'
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: 4 }}>
                        <path d="M5.433 2.304A4.492 4.492 0 003.5 6c0 1.598.832 3.002 2.09 3.802.518.329.91.765 1.128 1.26H6.75a.75.75 0 000 1.5h2.5a.75.75 0 000-1.5h-.032c.218-.495.61-.931 1.128-1.26A4.492 4.492 0 0012.5 6a4.492 4.492 0 00-1.933-3.696.75.75 0 00-.838 1.243A2.993 2.993 0 0111 6c0 1.06-.55 1.993-1.38 2.527-.614.396-1.07.894-1.37 1.473h-.5c-.3-.579-.756-1.077-1.37-1.473A2.993 2.993 0 015 6c0-1.033.522-1.945 1.271-2.453a.75.75 0 00-.838-1.243z"/>
                        <path d="M7.25 13a.75.75 0 01.75-.75h.5a.75.75 0 010 1.5H8a.75.75 0 01-.75-.75zM7.25 15a.75.75 0 01.75-.75h.5a.75.75 0 010 1.5H8a.75.75 0 01-.75-.75z"/>
                      </svg>
                      Auto
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Input field */}
            {field.type === 'textarea' ? (
              <div style={{ position: 'relative' }}>
                <textarea
                  style={styles.textarea}
                  placeholder={field.placeholder}
                  value={formData[field.name] || ''}
                  onChange={(e) => handleFieldChange(field.name, e.target.value)}
                  className={typingField === field.name ? 'typewriter-text' : ''}
                />
                {typingField === field.name && (
                  <span className="typewriter-cursor" style={{ position: 'absolute', bottom: '12px', marginLeft: '-4px' }} />
                )}
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  style={styles.input}
                  placeholder={field.placeholder}
                  value={formData[field.name] || ''}
                  onChange={(e) => handleFieldChange(field.name, e.target.value)}
                  className={typingField === field.name ? 'typewriter-text' : ''}
                />
                {typingField === field.name && (
                  <span className="typewriter-cursor" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                )}
              </div>
            )}

            {/* Alternative suggestions */}
            {fieldAlternatives && fieldAlternatives.length > 0 && (
              <div style={styles.alternativesSection}>
                <span style={{ fontSize: '11px', color: '#7c3aed', marginRight: '8px' }}>
                  Other ideas:
                </span>
                {fieldAlternatives.map((alt, idx) => (
                  <span
                    key={idx}
                    style={styles.alternativeChip}
                    onClick={() => handleUseAlternative(field.name, alt)}
                  >
                    {alt.length > 40 ? alt.slice(0, 40) + '...' : alt}
                  </span>
                ))}
              </div>
            )}

            {/* Refined content (editable) */}
            {hasRefined && (
              <div style={styles.refinedSection}>
                <div style={styles.refinedHeader}>
                  <span style={styles.refinedBadge}>
                    <span style={{ fontWeight: 'bold' }}>✓</span> AI Refined
                  </span>
                  <button
                    style={styles.editButton}
                    onClick={() => setEditingRefined(prev => ({ ...prev, [field.name]: !prev[field.name] }))}
                  >
                    {isEditing ? 'Done' : 'Edit'}
                  </button>
                </div>
                {isEditing ? (
                  <textarea
                    style={styles.refinedTextarea}
                    value={state.data[field.name].refined}
                    onChange={(e) => handleRefinedChange(field.name, e.target.value)}
                  />
                ) : (
                  <div style={styles.refinedPreview}>
                    {state.data[field.name].refined}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div style={styles.buttonRow}>
        {state.currentStage > 0 && (
          <button style={styles.button(false)} onClick={prevStage}>
            ← Previous
          </button>
        )}
        <button
          style={{
            ...styles.button(true),
            background: isRefining
              ? 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)'
              : '#ffffff',
            backgroundSize: isRefining ? '200% 100%' : '100% 100%',
            animation: isRefining ? 'shimmer 1.5s ease-in-out infinite' : 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
          onClick={nextStage}
          disabled={isRefining}
        >
          {isRefining ? 'Refining...' : isLastStage ? 'Generate Epic' : 'Next'}
        </button>
      </div>

      {/* Sections preview */}
      <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #e0e0e0' }}>
        <div style={{ fontSize: '11px', fontWeight: '600', marginBottom: '6px', color: '#666', textTransform: 'uppercase' }}>
          Epic Sections:
        </div>
        <div style={styles.sectionPreview}>
          {EPIC_SECTIONS.map(section => (
            <div key={section.num} style={styles.sectionChip(populatedSections.has(section.num))}>
              {section.num}. {section.title}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // Mermaid Blueprint Renderer Component with Zoom Support and Auto-Fix
  const MermaidBlueprint = ({
    code,
    zoom = 100,
    onRequestFix,
    onSvgReady
  }: {
    code: string;
    zoom?: number;
    onRequestFix?: (failedCode: string, errorMessage: string) => Promise<string | null>;
    onSvgReady?: (svg: string) => void;
  }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [svg, setSvg] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [isFixing, setIsFixing] = useState(false);
    const [hasAttemptedFix, setHasAttemptedFix] = useState(false);

    useEffect(() => {
      // Reset fix attempt when code changes from parent
      setHasAttemptedFix(false);
    }, [code]);

    useEffect(() => {
      if (!code || !containerRef.current) return;

      const renderDiagram = async () => {
        try {
          setError(null);
          setIsFixing(false);
          const id = `mermaid-blueprint-${Date.now()}`;
          const { svg: renderedSvg } = await mermaid.render(id, code);
          setSvg(renderedSvg);
          if (onSvgReady) onSvgReady(renderedSvg);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to render diagram';
          console.error('Mermaid render error:', errorMsg);

          // Attempt AI fix if available and not already attempted
          if (onRequestFix && !hasAttemptedFix) {
            setIsFixing(true);
            setHasAttemptedFix(true);
            try {
              const fixedCode = await onRequestFix(code, errorMsg);
              if (fixedCode && fixedCode !== code) {
                // Parent will update blueprintCode, triggering re-render
                setIsFixing(false);
                return;
              }
            } catch (fixErr) {
              console.error('AI fix failed:', fixErr);
            }
            setIsFixing(false);
          }

          setError(errorMsg);
        }
      };

      renderDiagram();
    }, [code, onRequestFix, hasAttemptedFix]);

    // Show fixing state
    if (isFixing) {
      return (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <div className="skeleton" style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            margin: '0 auto 16px',
          }} />
          <p style={{ fontSize: '16px', marginBottom: '8px', color: '#3b82f6' }}>
            AI is fixing the diagram...
          </p>
          <p style={{ fontSize: '13px', color: '#999' }}>
            Correcting syntax errors automatically
          </p>
        </div>
      );
    }

    if (error) {
      return (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <p style={{ fontSize: '16px', marginBottom: '12px' }}>Unable to render diagram</p>
          <p style={{ fontSize: '13px', color: '#999' }}>{error}</p>
          <p style={{ fontSize: '13px', marginTop: '12px' }}>
            Try editing the Mermaid code below or click Regenerate
          </p>
        </div>
      );
    }

    return (
      <div
        ref={containerRef}
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          transform: `scale(${zoom / 100})`,
          transformOrigin: 'top center',
          transition: 'transform 0.2s ease',
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  };

  // Regenerate blueprint with intelligent selection
  const regenerateBlueprint = async () => {
    const projectName = state.data['projectName']?.original || 'Untitled Project';
    setIsGeneratingBlueprint(true);
    setBlueprintReasoning('Analyzing epic content...');
    try {
      const blueprintResult = await generateIntelligentBlueprint(state.data, projectName);
      setBlueprintCode(blueprintResult.diagram);
      setBlueprintType(blueprintResult.type);
      setBlueprintReasoning(blueprintResult.reasoning);
    } catch (error) {
      console.error('Blueprint regeneration failed:', error);
      setBlueprintReasoning('Failed to regenerate. Using previous diagram.');
    } finally {
      setIsGeneratingBlueprint(false);
    }
  };

  // Handler for AI-assisted diagram fix when Mermaid rendering fails
  const handleRequestDiagramFix = async (failedCode: string, errorMessage: string): Promise<string | null> => {
    if (!isAIEnabled(config)) {
      return null;
    }

    try {
      const fixedCode = await fixMermaidDiagram(failedCode, errorMessage);
      if (fixedCode && fixedCode !== failedCode) {
        setBlueprintCode(fixedCode);
        showToast('success', 'Diagram Fixed', 'AI corrected the diagram syntax');
        return fixedCode;
      }
    } catch (err) {
      console.error('Failed to fix diagram with AI:', err);
      showToast('error', 'Fix Failed', 'AI could not fix the diagram');
    }
    return null;
  };

  // Export diagram as SVG file
  const exportAsSVG = () => {
    if (!blueprintSvg) {
      showToast('warning', 'No Diagram', 'Please generate a blueprint first');
      return;
    }
    const blob = new Blob([blueprintSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `epic-blueprint-${Date.now()}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('success', 'SVG Exported', 'Blueprint saved as SVG file');
  };

  // Export diagram as PNG file
  const exportAsPNG = async () => {
    if (!blueprintSvg) {
      showToast('warning', 'No Diagram', 'Please generate a blueprint first');
      return;
    }

    try {
      // Create a canvas element
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Canvas context not available');
      }

      // Create an image from the SVG
      const img = new Image();
      const svgBlob = new Blob([blueprintSvg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          // Scale up for better quality
          const scale = 2;
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;

          // Fill with white background
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Draw the image scaled up
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0);

          // Convert to PNG and download
          canvas.toBlob((blob) => {
            if (blob) {
              const pngUrl = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = pngUrl;
              a.download = `epic-blueprint-${Date.now()}.png`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(pngUrl);
              showToast('success', 'PNG Exported', 'Blueprint saved as PNG file');
              resolve();
            } else {
              reject(new Error('Failed to create PNG blob'));
            }
          }, 'image/png');

          URL.revokeObjectURL(url);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('Failed to load SVG image'));
        };
        img.src = url;
      });
    } catch (err) {
      console.error('PNG export error:', err);
      showToast('error', 'Export Failed', 'Could not export as PNG');
    }
  };

  // Render Mermaid Blueprint view
  const renderBlueprint = () => (
    <div>
      {/* Action bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={styles.stageTitle}>Epic Blueprint</div>
            {blueprintType && (
              <span style={{
                padding: '4px 10px',
                backgroundColor: '#dbeafe',
                color: '#1e40af',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: '600',
                textTransform: 'uppercase',
              }}>
                {blueprintType.replace('-', ' ')}
              </span>
            )}
          </div>
          <div style={{ color: '#666', fontSize: '13px', marginTop: '4px' }}>
            {blueprintReasoning || 'Intelligent Mermaid diagram based on your epic content'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            style={{
              ...styles.button(true),
              background: isGeneratingBlueprint
                ? 'linear-gradient(90deg, #a78bfa 25%, #8b5cf6 50%, #a78bfa 75%)'
                : 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
              backgroundSize: isGeneratingBlueprint ? '200% 100%' : '100% 100%',
              animation: isGeneratingBlueprint ? 'shimmer 1.5s ease-in-out infinite' : 'none',
            }}
            onClick={regenerateBlueprint}
            disabled={isGeneratingBlueprint}
            title="Re-analyze the epic and generate the best diagram type"
          >
            {isGeneratingBlueprint ? 'Analyzing...' : 'Regenerate'}
          </button>
          <button
            style={styles.button(false)}
            onClick={() => {
              navigator.clipboard.writeText(blueprintCode);
              showToast('success', 'Copied!', 'Mermaid code copied to clipboard');
            }}
          >
            Copy Mermaid
          </button>
          <button
            style={styles.button(false)}
            onClick={() => {
              const blob = new Blob([blueprintCode], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'epic-blueprint.mmd';
              a.click();
              URL.revokeObjectURL(url);
              showToast('success', 'Downloaded!', 'Blueprint saved as epic-blueprint.mmd');
            }}
          >
            Download .mmd
          </button>
          <button
            style={{ ...styles.button(true), background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)' }}
            onClick={() => {
              // Open Mermaid Live Editor with the code
              const encoded = btoa(blueprintCode);
              window.open(`https://mermaid.live/edit#base64:${encoded}`, '_blank');
            }}
          >
            Open Mermaid Editor
          </button>
          <div style={{ width: '1px', height: '24px', backgroundColor: '#d1d5db' }} />
          <button
            style={{ ...styles.button(false), display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={exportAsSVG}
            disabled={!blueprintSvg}
            title="Export diagram as SVG"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
            SVG
          </button>
          <button
            style={{ ...styles.button(false), display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={exportAsPNG}
            disabled={!blueprintSvg}
            title="Export diagram as PNG"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
            PNG
          </button>
        </div>
      </div>

      {/* Blueprint content - Full width diagram view */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Live Diagram Preview */}
        <div style={{
          border: '1px solid #d0d7de',
          borderRadius: '8px',
          backgroundColor: 'white',
          overflow: 'hidden',
        }}>
          <div style={{
            ...styles.paneHeader,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              <span>Live Blueprint Diagram</span>
              <span style={{ fontSize: '12px', color: '#666', marginLeft: '8px' }}>Rendered locally with Mermaid.js</span>
            </div>
            {/* Zoom Controls - Free Slider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>2.5%</span>
              <input
                type="range"
                min={25}
                max={1000}
                value={blueprintZoom}
                onChange={(e) => setBlueprintZoom(parseInt(e.target.value))}
                style={{
                  width: '140px',
                  cursor: 'pointer',
                  accentColor: '#3b82f6',
                }}
                title={`Zoom: ${blueprintZoom / 10}%`}
              />
              <span style={{ fontSize: '12px', color: '#6b7280' }}>100%</span>
              <div style={{
                minWidth: '50px',
                textAlign: 'center',
                fontSize: '13px',
                fontWeight: '500',
                color: '#374151',
                padding: '4px 8px',
                backgroundColor: '#f3f4f6',
                borderRadius: '4px',
              }}>
                {blueprintZoom / 10}%
              </div>
              <button
                onClick={() => setBlueprintZoom(100)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  background: blueprintZoom === 100 ? '#e5e7eb' : 'white',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: '#374151',
                }}
                title="Reset to 10%"
              >
                Reset
              </button>
              <div style={{ width: '1px', height: '20px', backgroundColor: '#d1d5db', margin: '0 4px' }} />
              <button
                onClick={() => setBlueprintFullscreen(true)}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  background: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#374151',
                }}
                title="Fullscreen"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                </svg>
              </button>
            </div>
          </div>
          <div style={{
            padding: '20px',
            backgroundColor: '#fafafa',
            minHeight: '500px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            overflow: 'auto',
          }}>
            <MermaidBlueprint code={blueprintCode} zoom={blueprintZoom} onRequestFix={isAIEnabled(config) ? handleRequestDiagramFix : undefined} onSvgReady={setBlueprintSvg} />
          </div>
        </div>

        {/* Fullscreen Overlay */}
        {blueprintFullscreen && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.98)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Fullscreen Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 24px',
              borderBottom: '1px solid #e5e7eb',
              backgroundColor: 'white',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontWeight: '600', fontSize: '16px' }}>Blueprint Diagram</span>
                {blueprintType && (
                  <span style={{
                    padding: '4px 10px',
                    backgroundColor: '#dbeafe',
                    color: '#1e40af',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                  }}>
                    {blueprintType.replace('-', ' ')}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* Zoom Controls in Fullscreen - Free Slider */}
                <span style={{ fontSize: '13px', color: '#6b7280' }}>2.5%</span>
                <input
                  type="range"
                  min={25}
                  max={1000}
                  value={blueprintZoom}
                  onChange={(e) => setBlueprintZoom(parseInt(e.target.value))}
                  style={{
                    width: '160px',
                    cursor: 'pointer',
                    accentColor: '#3b82f6',
                  }}
                  title={`Zoom: ${blueprintZoom / 10}%`}
                />
                <span style={{ fontSize: '13px', color: '#6b7280' }}>100%</span>
                <div style={{
                  minWidth: '60px',
                  textAlign: 'center',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  padding: '6px 12px',
                  backgroundColor: '#f3f4f6',
                  borderRadius: '6px',
                }}>
                  {blueprintZoom / 10}%
                </div>
                <button
                  onClick={() => setBlueprintZoom(100)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    background: blueprintZoom === 100 ? '#e5e7eb' : 'white',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: '#374151',
                  }}
                  title="Reset to 10%"
                >
                  Reset
                </button>
                <div style={{ width: '1px', height: '24px', backgroundColor: '#d1d5db', margin: '0 8px' }} />
                <button
                  onClick={() => setBlueprintFullscreen(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  title="Exit Fullscreen"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                  </svg>
                  Exit Fullscreen
                </button>
              </div>
            </div>
            {/* Fullscreen Diagram Area */}
            <div style={{
              flex: 1,
              overflow: 'auto',
              padding: '40px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'flex-start',
              backgroundColor: '#fafafa',
            }}>
              <MermaidBlueprint code={blueprintCode} zoom={blueprintZoom} onRequestFix={isAIEnabled(config) ? handleRequestDiagramFix : undefined} onSvgReady={setBlueprintSvg} />
            </div>
          </div>
        )}

        {/* Split: Code editor and Legend */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* Code pane */}
          <div style={styles.editorPane}>
            <div style={styles.paneHeader}>
              <span>Mermaid Code (Editable)</span>
              <span style={{ fontSize: '12px', color: '#666' }}>
                {blueprintCode.split('\n').length} lines
              </span>
            </div>
            <textarea
              style={{ ...styles.editor, height: '400px' }}
              value={blueprintCode}
              onChange={(e) => setBlueprintCode(e.target.value)}
              spellCheck={false}
            />
          </div>

          {/* Legend pane */}
          <div style={styles.previewPane}>
            <div style={styles.paneHeader}>
              <span>Diagram Guide</span>
            </div>
            <div style={{ padding: '16px', overflow: 'auto', height: '355px' }}>
              {/* Dynamic info based on diagram type */}
              <div style={{ marginBottom: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px' }}>
                  {blueprintType === 'c4-container' ? 'C4 Container Diagram' :
                   blueprintType === 'sequence' ? 'Sequence Diagram' :
                   blueprintType === 'deployment' ? 'Deployment Diagram' :
                   blueprintType === 'component' ? 'Component Diagram' :
                   '7-Layer Epic Architecture'}
                </h3>

                {blueprintType === 'c4-container' && (
                  <div style={{ display: 'grid', gap: '6px' }}>
                    {[
                      { color: '#438DD5', name: 'Person', desc: 'Users of the system' },
                      { color: '#85BBF0', name: 'Container', desc: 'Deployable units (apps, services)' },
                      { color: '#438DD5', name: 'Database', desc: 'Data storage systems' },
                      { color: '#999999', name: 'External', desc: 'Third-party systems' },
                    ].map((item, i) => (
                      <div key={i} style={{
                        padding: '8px 10px', backgroundColor: `${item.color}20`,
                        borderRadius: '6px', border: `1px solid ${item.color}40`,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <div style={{ fontWeight: '600', fontSize: '12px' }}>{item.name}</div>
                        <div style={{ fontSize: '11px', color: '#666' }}>{item.desc}</div>
                      </div>
                    ))}
                  </div>
                )}

                {blueprintType === 'sequence' && (
                  <div style={{ display: 'grid', gap: '6px' }}>
                    {[
                      { color: '#10b981', name: 'Actor', desc: 'User initiating actions' },
                      { color: '#3b82f6', name: 'Participant', desc: 'System components' },
                      { color: '#8b5cf6', name: 'Activate/Deactivate', desc: 'Processing time' },
                      { color: '#f59e0b', name: 'Messages', desc: 'Requests and responses' },
                    ].map((item, i) => (
                      <div key={i} style={{
                        padding: '8px 10px', backgroundColor: `${item.color}20`,
                        borderRadius: '6px', border: `1px solid ${item.color}40`,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <div style={{ fontWeight: '600', fontSize: '12px' }}>{item.name}</div>
                        <div style={{ fontSize: '11px', color: '#666' }}>{item.desc}</div>
                      </div>
                    ))}
                  </div>
                )}

                {blueprintType === 'deployment' && (
                  <div style={{ display: 'grid', gap: '6px' }}>
                    {[
                      { color: '#E3F2FD', name: 'Node', desc: 'Physical/virtual machines' },
                      { color: '#E8F5E9', name: 'Component', desc: 'Deployed applications' },
                      { color: '#FFF3E0', name: 'Database', desc: 'Data storage' },
                      { color: '#F3E5F5', name: 'CI/CD', desc: 'Build and deploy pipeline' },
                    ].map((item, i) => (
                      <div key={i} style={{
                        padding: '8px 10px', backgroundColor: item.color,
                        borderRadius: '6px', border: '1px solid rgba(0,0,0,0.1)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <div style={{ fontWeight: '600', fontSize: '12px' }}>{item.name}</div>
                        <div style={{ fontSize: '11px', color: '#666' }}>{item.desc}</div>
                      </div>
                    ))}
                  </div>
                )}

                {blueprintType === 'component' && (
                  <div style={{ display: 'grid', gap: '6px' }}>
                    {[
                      { color: '#dbeafe', name: 'Package', desc: 'Logical grouping of components' },
                      { color: '#dcfce7', name: 'Component', desc: 'Functional unit' },
                      { color: '#fef3c7', name: 'Interface', desc: 'Connection points' },
                      { color: '#f3e8ff', name: 'Database', desc: 'Data persistence' },
                    ].map((item, i) => (
                      <div key={i} style={{
                        padding: '8px 10px', backgroundColor: item.color,
                        borderRadius: '6px', border: '1px solid rgba(0,0,0,0.1)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <div style={{ fontWeight: '600', fontSize: '12px' }}>{item.name}</div>
                        <div style={{ fontSize: '11px', color: '#666' }}>{item.desc}</div>
                      </div>
                    ))}
                  </div>
                )}

                {(!blueprintType || blueprintType === 'multilayer') && (
                  <div style={{ display: 'grid', gap: '6px' }}>
                    {[
                      { color: '#E3F2FD', name: '1. Stakeholders', desc: 'Who is involved' },
                      { color: '#E8F5E9', name: '2. Requirements', desc: 'What we\'re building' },
                      { color: '#FFF3E0', name: '3. Architecture', desc: 'How it\'s structured' },
                      { color: '#F3E5F5', name: '4. Team', desc: 'Who builds it' },
                      { color: '#FFEBEE', name: '5. Quality', desc: 'Standards & security' },
                      { color: '#FBE9E7', name: '6. Risks', desc: 'What could go wrong' },
                      { color: '#E8EAF6', name: '7. Deliverables', desc: 'What we produce' },
                    ].map((layer, i) => (
                      <div key={i} style={{
                        padding: '8px 10px', backgroundColor: layer.color,
                        borderRadius: '6px', border: '1px solid rgba(0,0,0,0.1)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <div style={{ fontWeight: '600', fontSize: '12px' }}>{layer.name}</div>
                        <div style={{ fontSize: '11px', color: '#666' }}>{layer.desc}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AI Reasoning */}
              {blueprintReasoning && (
                <div style={{
                  padding: '12px',
                  backgroundColor: '#f0f9ff',
                  borderRadius: '8px',
                  border: '1px solid #bae6fd',
                  marginBottom: '12px',
                }}>
                  <h4 style={{ fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: '#0369a1' }}>
                    AI Selection Reasoning
                  </h4>
                  <div style={{ fontSize: '11px', color: '#475569', lineHeight: '1.6' }}>
                    {blueprintReasoning}
                  </div>
                </div>
              )}

              {/* Mermaid Syntax Quick Reference */}
              <div style={{
                padding: '12px',
                backgroundColor: '#fefce8',
                borderRadius: '8px',
                border: '1px solid #fef08a',
              }}>
                <h4 style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: '#854d0e' }}>
                  Mermaid Syntax Tips
                </h4>
                <div style={{ fontSize: '11px', color: '#713f12', lineHeight: '1.6' }}>
                  <code style={{ display: 'block', marginBottom: '4px' }}>A[Box] B((Circle)) C[(Database)]</code>
                  <code style={{ display: 'block', marginBottom: '4px' }}>A --&gt; B (arrow) A -..-&gt; B (dotted)</code>
                  <code style={{ display: 'block' }}>subgraph Name ... end</code>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Render Settings Panel
  const renderSettings = () => {
    const handleTestGitLab = async () => {
      setGitlabTestStatus({ testing: true });
      const result = await testGitLabConnection(config.gitlab);
      if (result.success) {
        setGitlabTestStatus({ testing: false, result: `Connected to: ${result.projectName}` });
      } else {
        setGitlabTestStatus({ testing: false, result: `Error: ${result.error}` });
      }
    };

    const handleTestAzure = async () => {
      setAzureTestStatus({ testing: true });
      const result = await testAzureOpenAI(config.azureOpenAI);
      if (result.success) {
        setAzureTestStatus({ testing: false, result: 'Connection successful!' });
      } else {
        setAzureTestStatus({ testing: false, result: `Error: ${result.error}` });
      }
    };

    const handleTestOpenAI = async () => {
      setOpenaiTestStatus({ testing: true });
      const result = await testOpenAI(config.openAI);
      if (result.success) {
        setOpenaiTestStatus({ testing: false, result: `Connected! Model: ${result.model}` });
      } else {
        setOpenaiTestStatus({ testing: false, result: `Error: ${result.error}` });
      }
    };

    // ========== FILE BROWSER HANDLERS ==========
    // Browse repository files/folders
    const handleBrowseFiles = async (path: string = '') => {
      if (!config.gitlab.projectId) {
        showToast('error', 'No Project Selected', 'Select a project first');
        return;
      }

      setLoadingRepoFiles(true);
      console.log('[File Browser] Browsing path:', path || '(root)');

      const result = await fetchGitLabRepositoryTree(
        { ...config.gitlab, projectId: config.gitlab.projectId },
        path
      );

      setLoadingRepoFiles(false);

      if (result.success && result.data) {
        setRepositoryFiles(result.data);
        setCurrentRepoPath(path);
        console.log('[File Browser] Found', result.data.length, 'items');
      } else {
        showToast('error', 'Browse Failed', result.error || 'Could not fetch files');
        setRepositoryFiles([]);
      }
    };

    // Load file content into editor
    const handleLoadFile = async (filePath: string) => {
      if (!config.gitlab.projectId) {
        showToast('error', 'No Project Selected', 'Select a project first');
        return;
      }

      console.log('[File Browser] Loading file:', filePath);
      setLoadingRepoFiles(true);

      const result = await fetchGitLabFileContent(
        { ...config.gitlab, projectId: config.gitlab.projectId },
        filePath
      );

      setLoadingRepoFiles(false);

      if (result.success && result.content) {
        // Load content into editor
        setEditableEpic(result.content);
        showToast('success', 'File Loaded', `Loaded: ${result.fileName}`);
        console.log('[File Browser] File loaded:', result.fileName, result.size, 'bytes');
      } else {
        showToast('error', 'Load Failed', result.error || 'Could not load file');
      }
    };

    // Navigate to parent folder
    const handleBrowseParent = () => {
      if (!currentRepoPath) return;
      const parentPath = currentRepoPath.split('/').slice(0, -1).join('/');
      handleBrowseFiles(parentPath);
    };

    // Handle AI provider change
    const handleAIProviderChange = (provider: AIProvider) => {
      const newConfig = { ...config, aiProvider: provider };

      // Update enabled flags based on provider selection
      if (provider === 'openai') {
        newConfig.openAI = { ...newConfig.openAI, enabled: true };
        newConfig.azureOpenAI = { ...newConfig.azureOpenAI, enabled: false };
      } else if (provider === 'azure') {
        newConfig.openAI = { ...newConfig.openAI, enabled: false };
        newConfig.azureOpenAI = { ...newConfig.azureOpenAI, enabled: true };
      } else {
        newConfig.openAI = { ...newConfig.openAI, enabled: false };
        newConfig.azureOpenAI = { ...newConfig.azureOpenAI, enabled: false };
      }

      updateConfig(newConfig);
    };

    // Fetch Projects directly from the group (simpler approach)
    const handleFetchGroupProjects = async () => {
      if (!config.gitlab.accessToken || !config.gitlab.rootGroupId) {
        showToast('warning', 'Missing Info', 'Please enter Access Token and Group ID');
        return;
      }

      setLoadingGroupProjects(true);
      setGroupProjects([]);

      const result = await fetchGitLabEpics(config.gitlab, config.gitlab.rootGroupId);

      if (result.success && result.data) {
        // Filter only projects (not subgroups)
        const projects = result.data
          .filter(item => item.type === 'project')
          .map(p => ({ id: p.id, name: p.name.replace(/^📄\s*/, ''), path: p.path }));

        setGroupProjects(projects);
        if (projects.length > 0) {
          showToast('success', 'Projects Loaded', `Found ${projects.length} projects`);
        } else {
          showToast('info', 'No Projects', 'No projects found in this group. Try using "Load Pods" to browse subgroups.');
        }
      } else {
        showToast('error', 'Failed to Load Projects', result.error || 'Unknown error');
      }
      setLoadingGroupProjects(false);
    };

    // Handle direct project selection from group
    const handleGroupProjectSelect = async (projectId: string) => {
      if (!projectId) {
        updateConfig({
          ...config,
          gitlab: { ...config.gitlab, projectId: '' }
        });
        setSelectedProjectName('');
        setBranches([]);
        return;
      }

      const selected = groupProjects.find(p => p.id.toString() === projectId);
      if (!selected) return;

      // Update config with selected project
      updateConfig({
        ...config,
        gitlab: { ...config.gitlab, projectId: projectId }
      });

      setSelectedProjectName(selected.name);

      // Fetch branches for this project
      const branchResult = await fetchGitLabBranches({
        ...config.gitlab,
        projectId: projectId
      });

      if (branchResult.success && branchResult.data) {
        setBranches(branchResult.data);
        if (branchResult.defaultBranch) {
          updateConfig({
            ...config,
            gitlab: {
              ...config.gitlab,
              projectId: projectId,
              branch: config.gitlab.branch || branchResult.defaultBranch
            }
          });
        }
        showToast('success', 'Project Selected', `${branchResult.data.length} branches available`);
      }
    };

    // Fetch Pods (subgroups) from root group
    const handleFetchPods = async () => {
      if (!config.gitlab.accessToken || !config.gitlab.rootGroupId) {
        showToast('warning', 'Missing Info', 'Please enter Access Token and Root Group ID');
        return;
      }

      setLoadingPods(true);
      setPods([]);
      setEpics([]);
      const result = await fetchGitLabSubgroups(config.gitlab, config.gitlab.rootGroupId);

      if (result.success && result.data) {
        setPods(result.data);
        showToast('success', 'Pods Loaded', `Found ${result.data.length} pods`);
      } else {
        showToast('error', 'Failed to Load Pods', result.error || 'Unknown error');
      }
      setLoadingPods(false);
    };

    // Handle Pod selection - fetch child epics
    const handlePodSelect = async (podId: string) => {
      // Update config with selected pod
      updateConfig({
        ...config,
        gitlab: { ...config.gitlab, selectedPodId: podId, selectedEpicId: '', projectId: '' }
      });

      if (!podId) {
        setEpics([]);
        return;
      }

      // Fetch child subgroups + projects (combined as "Epics")
      setLoadingEpics(true);
      setEpics([]);
      const result = await fetchGitLabEpics(config.gitlab, podId);

      if (result.success && result.data) {
        setEpics(result.data);
        showToast('success', 'Epics Loaded', `Found ${result.data.length} items`);
      } else {
        showToast('error', 'Failed to Load Epics', result.error || 'Unknown error');
      }
      setLoadingEpics(false);
    };

    // Handle Epic selection - distinguish between subgroups and projects
    // Subgroups: Drill down to show their contents
    // Projects: Set as projectId and enable file operations
    const handleEpicSelect = async (epicId: string) => {
      const selected = epics.find(e => e.id.toString() === epicId);

      if (!selected) return;

      if (selected.type === 'subgroup') {
        // Subgroup selected - drill down into it
        console.log('[Navigation] Drilling into subgroup:', selected.name);

        // Add to navigation stack (strip emoji icon from name)
        setNavigationStack(prev => [...prev, {
          id: epicId,
          name: selected.name.replace(/^📁\s*/, ''),
          type: 'subgroup'
        }]);

        // Fetch children of this subgroup
        setLoadingEpics(true);
        const result = await fetchGitLabEpics(config.gitlab, epicId);
        setLoadingEpics(false);

        if (result.success && result.data) {
          setEpics(result.data);
          showToast('info', 'Subgroup Opened', `Found ${result.data.length} items`);
        } else {
          showToast('error', 'Failed to Load Contents', result.error || 'Unknown error');
        }

        // Update selectedEpicId but DO NOT set projectId (this is a group, not a project)
        updateConfig({
          ...config,
          gitlab: { ...config.gitlab, selectedEpicId: epicId }
          // Note: projectId is NOT set for subgroups
        });

      } else if (selected.type === 'project') {
        // Project selected - this is what we want!
        console.log('[Navigation] Project selected:', selected.name);

        // Set both selectedEpicId and projectId
        updateConfig({
          ...config,
          gitlab: {
            ...config.gitlab,
            selectedEpicId: epicId,
            projectId: epicId
          }
        });

        // Store project name (strip emoji icon)
        setSelectedProjectName(selected.name.replace(/^📄\s*/, ''));

        // Fetch branches for this project
        const branchResult = await fetchGitLabBranches({
          ...config.gitlab,
          projectId: epicId
        });

        if (branchResult.success && branchResult.data) {
          setBranches(branchResult.data);

          // Set default branch if not already configured
          if (branchResult.defaultBranch) {
            updateConfig({
              ...config,
              gitlab: {
                ...config.gitlab,
                selectedEpicId: epicId,
                projectId: epicId,
                branch: config.gitlab.branch || branchResult.defaultBranch
              }
            });
          }

          showToast('success', 'Project Selected', `${branchResult.data.length} branches available`);
        }

        // Clear navigation stack - we've reached a project
        // (user can still go back via Pod selection)
      }
    };

    // Navigate back in subgroup hierarchy
    const handleNavigateBack = async () => {
      if (navigationStack.length === 0) return;

      const newStack = [...navigationStack];
      newStack.pop();
      setNavigationStack(newStack);

      // Fetch parent's children
      const parentId = newStack.length > 0
        ? newStack[newStack.length - 1].id
        : config.gitlab.selectedPodId;

      if (parentId) {
        setLoadingEpics(true);
        const result = await fetchGitLabEpics(config.gitlab, parentId);
        setLoadingEpics(false);

        if (result.success && result.data) {
          setEpics(result.data);
        }
      }

      // Clear projectId since we're navigating back
      updateConfig({
        ...config,
        gitlab: { ...config.gitlab, projectId: '' }
      });
    };

    const openaiEnabled = config.aiProvider === 'openai' && config.openAI.enabled;
    const azureEnabled = config.aiProvider === 'azure' && config.azureOpenAI.enabled;
    const aiEnabled = openaiEnabled || azureEnabled;
    const gitlabEnabled = config.gitlab.enabled;

    // Reusable toggle switch component
    const ToggleSwitch = ({ checked, onChange, label }: { checked: boolean; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; label: string }) => (
      <label style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        cursor: 'pointer',
        padding: '4px 8px',
        borderRadius: '6px',
        backgroundColor: checked ? '#dcfce7' : '#f3f4f6',
        border: `1px solid ${checked ? '#86efac' : '#e5e7eb'}`,
        transition: 'all 0.2s ease',
      }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          style={{ display: 'none' }}
        />
        <div style={{
          width: '36px',
          height: '20px',
          borderRadius: '10px',
          backgroundColor: checked ? '#22c55e' : '#d1d5db',
          position: 'relative',
          transition: 'background-color 0.2s ease',
        }}>
          <div style={{
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            backgroundColor: 'white',
            position: 'absolute',
            top: '2px',
            left: checked ? '18px' : '2px',
            transition: 'left 0.2s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
        </div>
        <span style={{ fontSize: '13px', fontWeight: 500, color: checked ? '#166534' : '#6b7280' }}>{label}</span>
      </label>
    );

    // Test button component
    const TestButton = ({ testing, onClick, color }: { testing: boolean; onClick: () => void; color: string }) => (
      <button
        style={{
          padding: '8px 16px',
          borderRadius: '6px',
          border: 'none',
          color: 'white',
          fontSize: '13px',
          fontWeight: 500,
          cursor: testing ? 'wait' : 'pointer',
          background: testing
            ? `linear-gradient(90deg, ${color}80 25%, ${color} 50%, ${color}80 75%)`
            : color,
          backgroundSize: testing ? '200% 100%' : '100% 100%',
          animation: testing ? 'shimmer 1.5s ease-in-out infinite' : 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
        onClick={onClick}
        disabled={testing}
      >
        {testing ? (
          <>
            <span style={{ width: '14px', height: '14px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            Testing...
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
            Test Connection
          </>
        )}
      </button>
    );

    // Status result component
    const StatusResult = ({ result }: { result: string }) => (
      <div style={{
        marginTop: '8px',
        padding: '8px 12px',
        borderRadius: '6px',
        fontSize: '13px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        backgroundColor: result.startsWith('Error') ? '#fee2e2' : '#dcfce7',
        color: result.startsWith('Error') ? '#991b1b' : '#166534',
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {result.startsWith('Error') ? (
            <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          ) : (
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          )}
        </svg>
        {result}
      </div>
    );

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* AI Provider Selector */}
        <div style={{
          ...styles.card,
          background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
          border: '1px solid #bae6fd',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>
              </svg>
            </div>
            <div>
              <div style={{ ...styles.stageTitle, margin: 0 }}>AI Provider</div>
              <div style={{ color: '#0369a1', fontSize: '13px' }}>
                Select which AI service to use for suggestions and refinements
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            {/* No AI Option */}
            <button
              onClick={() => handleAIProviderChange('none')}
              style={{
                flex: 1,
                padding: '14px 16px',
                borderRadius: '10px',
                border: config.aiProvider === 'none' ? '2px solid #64748b' : '1px solid #cbd5e1',
                background: config.aiProvider === 'none' ? '#f1f5f9' : 'white',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '14px', color: '#374151', marginBottom: '4px' }}>
                None (Mock Mode)
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                No AI - returns input as-is
              </div>
            </button>

            {/* OpenAI Option */}
            <button
              onClick={() => handleAIProviderChange('openai')}
              style={{
                flex: 1,
                padding: '14px 16px',
                borderRadius: '10px',
                border: config.aiProvider === 'openai' ? '2px solid #10b981' : '1px solid #cbd5e1',
                background: config.aiProvider === 'openai' ? '#ecfdf5' : 'white',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#10b981">
                  <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.5963 3.8558L13.1038 8.364l2.0201-1.1638a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/>
                </svg>
                <span style={{ fontWeight: 600, fontSize: '14px', color: '#374151' }}>OpenAI</span>
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                Direct API (GPT-4o, GPT-4, etc.)
              </div>
            </button>

            {/* Azure OpenAI Option */}
            <button
              onClick={() => handleAIProviderChange('azure')}
              style={{
                flex: 1,
                padding: '14px 16px',
                borderRadius: '10px',
                border: config.aiProvider === 'azure' ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                background: config.aiProvider === 'azure' ? '#eff6ff' : 'white',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#3b82f6">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                </svg>
                <span style={{ fontWeight: 600, fontSize: '14px', color: '#374151' }}>Azure OpenAI</span>
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                Enterprise deployment
              </div>
            </button>
          </div>
        </div>

        {/* AI Configuration Panels - show based on selected provider */}
        <div style={{ display: 'grid', gridTemplateColumns: config.aiProvider === 'none' ? '1fr' : '1fr 1fr', gap: '24px' }}>

          {/* OpenAI Configuration - Show when OpenAI is selected */}
          {config.aiProvider === 'openai' && (
            <div style={{
              ...styles.card,
              border: openaiEnabled ? '2px solid #10b981' : '1px solid #e5e7eb',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {/* Header with gradient accent */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '4px',
                background: 'linear-gradient(90deg, #10b981, #34d399)',
                opacity: openaiEnabled ? 1 : 0.3,
              }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', paddingTop: '8px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #10b981, #34d399)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                        <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729z"/>
                      </svg>
                    </div>
                    <div style={{ ...styles.stageTitle, margin: 0 }}>OpenAI</div>
                  </div>
                  <div style={{ color: '#666', fontSize: '12px', marginLeft: '42px' }}>
                    Direct API access
                  </div>
                </div>
              </div>

              <div style={{ opacity: 1, transition: 'opacity 0.2s ease' }}>
                {/* API Key */}
                <div style={{ ...styles.fieldGroup, marginBottom: '12px' }}>
                  <label style={{ ...styles.label, fontSize: '12px' }}>API Key</label>
                  <input
                    type="password"
                    style={{ ...styles.input, fontSize: '13px', padding: '8px 10px' }}
                    placeholder="sk-..."
                    value={config.openAI.apiKey}
                    onChange={(e) => updateConfig({ ...config, openAI: { ...config.openAI, apiKey: e.target.value } })}
                  />
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                    Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" style={{ color: '#10b981' }}>platform.openai.com</a>
                  </div>
                </div>

                {/* Model Selection */}
                <div style={{ ...styles.fieldGroup, marginBottom: '12px' }}>
                  <label style={{ ...styles.label, fontSize: '12px' }}>Model</label>
                  <select
                    style={{ ...styles.input, fontSize: '13px', padding: '8px 10px', cursor: 'pointer' }}
                    value={config.openAI.model}
                    onChange={(e) => updateConfig({ ...config, openAI: { ...config.openAI, model: e.target.value } })}
                  >
                    {OPENAI_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>

                {/* Organization ID (optional) */}
                <div style={{ ...styles.fieldGroup, marginBottom: '12px' }}>
                  <label style={{ ...styles.label, fontSize: '12px' }}>Organization ID (Optional)</label>
                  <input
                    type="text"
                    style={{ ...styles.input, fontSize: '13px', padding: '8px 10px' }}
                    placeholder="org-..."
                    value={config.openAI.organizationId || ''}
                    onChange={(e) => updateConfig({ ...config, openAI: { ...config.openAI, organizationId: e.target.value } })}
                  />
                </div>

                {/* Model Parameters */}
                <div style={{
                  marginBottom: '12px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: '#475569' }}>Model Family</span>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: getOpenAIModelFamily(config.openAI.model) === 'gpt-4' ? '#dcfce7' : '#fef3c7',
                      color: getOpenAIModelFamily(config.openAI.model) === 'gpt-4' ? '#166534' : '#92400e',
                    }}>
                      {getOpenAIModelFamily(config.openAI.model).toUpperCase()}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div style={styles.fieldGroup}>
                      <label style={{ fontSize: '11px', color: '#64748b' }}>
                        Max Tokens (limit: {MODEL_LIMITS[getOpenAIModelFamily(config.openAI.model)].maxTokens.toLocaleString()})
                      </label>
                      <input
                        type="number"
                        style={{ ...styles.input, fontSize: '12px', padding: '6px 8px' }}
                        value={config.openAI.maxTokens}
                        onChange={(e) => {
                          const family = getOpenAIModelFamily(config.openAI.model);
                          const maxAllowed = MODEL_LIMITS[family].maxTokens;
                          const value = Math.min(parseInt(e.target.value) || 2048, maxAllowed);
                          updateConfig({ ...config, openAI: { ...config.openAI, maxTokens: value } });
                        }}
                        min={100}
                        max={MODEL_LIMITS[getOpenAIModelFamily(config.openAI.model)].maxTokens}
                      />
                    </div>
                    <div style={styles.fieldGroup}>
                      <label style={{ fontSize: '11px', color: '#64748b' }}>
                        Temperature (max: {MODEL_LIMITS[getOpenAIModelFamily(config.openAI.model)].maxTemperature})
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        style={{ ...styles.input, fontSize: '12px', padding: '6px 8px' }}
                        value={config.openAI.temperature}
                        onChange={(e) => {
                          const family = getOpenAIModelFamily(config.openAI.model);
                          const maxAllowed = MODEL_LIMITS[family].maxTemperature;
                          const value = Math.min(parseFloat(e.target.value) || 0.7, maxAllowed);
                          updateConfig({ ...config, openAI: { ...config.openAI, temperature: value } });
                        }}
                        min={0}
                        max={MODEL_LIMITS[getOpenAIModelFamily(config.openAI.model)].maxTemperature}
                      />
                    </div>
                  </div>
                </div>

                {/* Test connection */}
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
                  <TestButton testing={openaiTestStatus?.testing || false} onClick={handleTestOpenAI} color="#10b981" />
                  {openaiTestStatus?.result && <StatusResult result={openaiTestStatus.result} />}
                </div>
              </div>
            </div>
          )}

          {/* Azure OpenAI Configuration - Show when Azure is selected */}
          {config.aiProvider === 'azure' && (
            <div style={{
              ...styles.card,
              border: azureEnabled ? '2px solid #3b82f6' : '1px solid #e5e7eb',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {/* Header with gradient accent */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '4px',
                background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                opacity: azureEnabled ? 1 : 0.3,
              }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', paddingTop: '8px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                      </svg>
                    </div>
                    <div style={{ ...styles.stageTitle, margin: 0 }}>Azure OpenAI</div>
                  </div>
                  <div style={{ color: '#666', fontSize: '12px', marginLeft: '42px' }}>
                    Enterprise AI deployment
                  </div>
                </div>
              </div>

              <div style={{ opacity: 1, transition: 'opacity 0.2s ease' }}>
              {/* Endpoint & Deployment in 2 columns */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div style={styles.fieldGroup}>
                  <label style={{ ...styles.label, fontSize: '12px' }}>Endpoint</label>
                  <input
                    type="text"
                    style={{ ...styles.input, fontSize: '13px', padding: '8px 10px' }}
                    placeholder="https://your-resource.openai.azure.com"
                    value={config.azureOpenAI.endpoint}
                    onChange={(e) => updateConfig({ ...config, azureOpenAI: { ...config.azureOpenAI, endpoint: e.target.value } })}
                  />
                </div>
                <div style={styles.fieldGroup}>
                  <label style={{ ...styles.label, fontSize: '12px' }}>Deployment</label>
                  <input
                    type="text"
                    style={{ ...styles.input, fontSize: '13px', padding: '8px 10px' }}
                    placeholder="gpt-4o-deployment"
                    value={config.azureOpenAI.deploymentName}
                    onChange={(e) => updateConfig({ ...config, azureOpenAI: { ...config.azureOpenAI, deploymentName: e.target.value } })}
                  />
                </div>
              </div>

              {/* API Key & Version in 2 columns */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div style={styles.fieldGroup}>
                  <label style={{ ...styles.label, fontSize: '12px' }}>API Key</label>
                  <input
                    type="password"
                    style={{ ...styles.input, fontSize: '13px', padding: '8px 10px' }}
                    placeholder="Your Azure OpenAI API key"
                    value={config.azureOpenAI.apiKey}
                    onChange={(e) => updateConfig({ ...config, azureOpenAI: { ...config.azureOpenAI, apiKey: e.target.value } })}
                  />
                </div>
                <div style={styles.fieldGroup}>
                  <label style={{ ...styles.label, fontSize: '12px' }}>API Version</label>
                  <select
                    style={{ ...styles.input, fontSize: '13px', padding: '8px 10px', cursor: 'pointer' }}
                    value={config.azureOpenAI.apiVersion}
                    onChange={(e) => updateConfig({ ...config, azureOpenAI: { ...config.azureOpenAI, apiVersion: e.target.value } })}
                  >
                    {AZURE_API_VERSIONS.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Model Family Detection & Parameters */}
              {config.azureOpenAI.deploymentName && (
                <div style={{
                  marginBottom: '12px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: '#475569' }}>Detected Model Family</span>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: (config.azureOpenAI.modelFamily || detectModelFamily(config.azureOpenAI.deploymentName)) === 'gpt-5'
                        ? '#fef3c7'
                        : (config.azureOpenAI.modelFamily || detectModelFamily(config.azureOpenAI.deploymentName)) === 'gpt-4'
                          ? '#dbeafe'
                          : '#f3f4f6',
                      color: (config.azureOpenAI.modelFamily || detectModelFamily(config.azureOpenAI.deploymentName)) === 'gpt-5'
                        ? '#92400e'
                        : (config.azureOpenAI.modelFamily || detectModelFamily(config.azureOpenAI.deploymentName)) === 'gpt-4'
                          ? '#1e40af'
                          : '#4b5563',
                    }}>
                      {(config.azureOpenAI.modelFamily || detectModelFamily(config.azureOpenAI.deploymentName)).toUpperCase()}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div style={styles.fieldGroup}>
                      <label style={{ fontSize: '11px', color: '#64748b' }}>
                        Max Tokens (limit: {MODEL_LIMITS[config.azureOpenAI.modelFamily || detectModelFamily(config.azureOpenAI.deploymentName)].maxTokens.toLocaleString()})
                      </label>
                      <input
                        type="number"
                        style={{ ...styles.input, fontSize: '12px', padding: '6px 8px' }}
                        value={config.azureOpenAI.maxTokens}
                        onChange={(e) => {
                          const family = config.azureOpenAI.modelFamily || detectModelFamily(config.azureOpenAI.deploymentName);
                          const maxAllowed = MODEL_LIMITS[family].maxTokens;
                          const value = Math.min(parseInt(e.target.value) || 2048, maxAllowed);
                          updateConfig({ ...config, azureOpenAI: { ...config.azureOpenAI, maxTokens: value } });
                        }}
                        min={100}
                        max={MODEL_LIMITS[config.azureOpenAI.modelFamily || detectModelFamily(config.azureOpenAI.deploymentName)].maxTokens}
                      />
                    </div>
                    <div style={styles.fieldGroup}>
                      <label style={{ fontSize: '11px', color: '#64748b' }}>
                        Temperature (max: {MODEL_LIMITS[config.azureOpenAI.modelFamily || detectModelFamily(config.azureOpenAI.deploymentName)].maxTemperature})
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        style={{ ...styles.input, fontSize: '12px', padding: '6px 8px' }}
                        value={config.azureOpenAI.temperature}
                        onChange={(e) => {
                          const family = config.azureOpenAI.modelFamily || detectModelFamily(config.azureOpenAI.deploymentName);
                          const maxAllowed = MODEL_LIMITS[family].maxTemperature;
                          const value = Math.min(parseFloat(e.target.value) || 0.7, maxAllowed);
                          updateConfig({ ...config, azureOpenAI: { ...config.azureOpenAI, temperature: value } });
                        }}
                        min={0}
                        max={MODEL_LIMITS[config.azureOpenAI.modelFamily || detectModelFamily(config.azureOpenAI.deploymentName)].maxTemperature}
                      />
                    </div>
                  </div>
                  <div style={{ marginTop: '8px' }}>
                    <label style={{ fontSize: '11px', color: '#64748b' }}>Override Model Family (if auto-detect is wrong)</label>
                    <select
                      style={{ ...styles.input, fontSize: '12px', padding: '6px 8px', marginTop: '4px' }}
                      value={config.azureOpenAI.modelFamily || 'auto'}
                      onChange={(e) => {
                        const value = e.target.value === 'auto' ? undefined : e.target.value as ModelFamily;
                        updateConfig({ ...config, azureOpenAI: { ...config.azureOpenAI, modelFamily: value } });
                      }}
                    >
                      <option value="auto">Auto-detect</option>
                      <option value="gpt-4">GPT-4 Series</option>
                      <option value="gpt-5">GPT-5 / o1 / o3 Series</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Test connection */}
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
                <TestButton testing={azureTestStatus?.testing || false} onClick={handleTestAzure} color="#3b82f6" />
                {azureTestStatus?.result && <StatusResult result={azureTestStatus.result} />}
              </div>
              </div>
            </div>
          )}

          {/* GitLab Configuration */}
          <div style={{
            ...styles.card,
            border: gitlabEnabled ? '2px solid #fc6d26' : '1px solid #e5e7eb',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Header with gradient accent */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '4px',
              background: 'linear-gradient(90deg, #fc6d26, #fca326)',
              opacity: gitlabEnabled ? 1 : 0.3,
            }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', paddingTop: '8px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #fc6d26, #fca326)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                      <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 014.82 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0118.6 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.51L23 13.45a.84.84 0 01-.35.94z"/>
                    </svg>
                  </div>
                  <div style={{ ...styles.stageTitle, margin: 0 }}>GitLab</div>
                </div>
                <div style={{ color: '#666', fontSize: '12px', marginLeft: '42px' }}>
                  Push epics to repository
                </div>
              </div>
              <ToggleSwitch
                checked={config.gitlab.enabled}
                onChange={(e) => updateConfig({ ...config, gitlab: { ...config.gitlab, enabled: e.target.checked } })}
                label={gitlabEnabled ? 'On' : 'Off'}
              />
            </div>

            <div style={{ opacity: gitlabEnabled ? 1 : 0.5, transition: 'opacity 0.2s ease' }}>
              {/* URL & Project in 2 columns */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div style={styles.fieldGroup}>
                  <label style={{ ...styles.label, fontSize: '12px' }}>GitLab URL</label>
                  <input
                    type="text"
                    style={{ ...styles.input, fontSize: '13px', padding: '8px 10px' }}
                    placeholder="https://gitlab.com"
                    value={config.gitlab.baseUrl}
                    onChange={(e) => updateConfig({ ...config, gitlab: { ...config.gitlab, baseUrl: e.target.value } })}
                    disabled={!gitlabEnabled}
                  />
                </div>
                <div style={styles.fieldGroup}>
                  <label style={{ ...styles.label, fontSize: '12px' }}>Project ID/Path</label>
                  <input
                    type="text"
                    style={{ ...styles.input, fontSize: '13px', padding: '8px 10px' }}
                    placeholder="group/project"
                    value={config.gitlab.projectId}
                    onChange={(e) => updateConfig({ ...config, gitlab: { ...config.gitlab, projectId: e.target.value } })}
                    disabled={!gitlabEnabled}
                  />
                </div>
              </div>

              {/* Access Token - full width */}
              <div style={{ ...styles.fieldGroup, marginBottom: '12px' }}>
                <label style={{ ...styles.label, fontSize: '12px' }}>Personal Access Token</label>
                <input
                  type="password"
                  style={{ ...styles.input, fontSize: '13px', padding: '8px 10px' }}
                  placeholder="glpat-..."
                  value={config.gitlab.accessToken}
                  onChange={(e) => updateConfig({ ...config, gitlab: { ...config.gitlab, accessToken: e.target.value } })}
                  disabled={!gitlabEnabled}
                />
                <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                  Needs <code style={{ background: '#f3f4f6', padding: '1px 4px', borderRadius: '3px' }}>api</code> scope
                </div>
              </div>

              {/* Group ID and Load buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', marginBottom: '12px', alignItems: 'end' }}>
                <div style={styles.fieldGroup}>
                  <label style={{ ...styles.label, fontSize: '12px' }}>Group ID</label>
                  <input
                    type="text"
                    style={{ ...styles.input, fontSize: '13px', padding: '8px 10px' }}
                    placeholder="484540"
                    value={config.gitlab.rootGroupId}
                    onChange={(e) => updateConfig({ ...config, gitlab: { ...config.gitlab, rootGroupId: e.target.value } })}
                    disabled={!gitlabEnabled}
                  />
                </div>
                <button
                  onClick={handleFetchGroupProjects}
                  disabled={!gitlabEnabled || loadingGroupProjects || !config.gitlab.accessToken || !config.gitlab.rootGroupId}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    background: loadingGroupProjects ? '#d1d5db' : 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                    color: 'white',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: gitlabEnabled && !loadingGroupProjects ? 'pointer' : 'not-allowed',
                    opacity: !gitlabEnabled || !config.gitlab.accessToken || !config.gitlab.rootGroupId ? 0.5 : 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {loadingGroupProjects ? 'Loading...' : 'Load Projects'}
                </button>
                <button
                  onClick={handleFetchPods}
                  disabled={!gitlabEnabled || loadingPods || !config.gitlab.accessToken}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    background: loadingPods ? '#d1d5db' : 'linear-gradient(135deg, #fc6d26 0%, #e24329 100%)',
                    color: 'white',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: gitlabEnabled && !loadingPods ? 'pointer' : 'not-allowed',
                    opacity: !gitlabEnabled || !config.gitlab.accessToken ? 0.5 : 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {loadingPods ? 'Loading...' : 'Browse Subgroups'}
                </button>
              </div>

              {/* Projects Dropdown (direct from group) */}
              {groupProjects.length > 0 && (
                <div style={{ ...styles.fieldGroup, marginBottom: '12px' }}>
                  <label style={{ ...styles.label, fontSize: '12px' }}>Select Project</label>
                  <select
                    style={{ ...styles.input, fontSize: '13px', padding: '8px 10px', cursor: 'pointer' }}
                    value={config.gitlab.projectId}
                    onChange={(e) => handleGroupProjectSelect(e.target.value)}
                    disabled={!gitlabEnabled}
                  >
                    <option value="">-- Select a Project --</option>
                    {groupProjects.map(project => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Pods Dropdown */}
              {pods.length > 0 && (
                <div style={{ ...styles.fieldGroup, marginBottom: '12px' }}>
                  <label style={{ ...styles.label, fontSize: '12px' }}>Select Pod</label>
                  <select
                    style={{ ...styles.input, fontSize: '13px', padding: '8px 10px', cursor: 'pointer' }}
                    value={config.gitlab.selectedPodId}
                    onChange={(e) => handlePodSelect(e.target.value)}
                    disabled={!gitlabEnabled || loadingEpics}
                  >
                    <option value="">-- Select a Pod --</option>
                    {pods.map(pod => (
                      <option key={pod.id} value={pod.id}>{pod.name}</option>
                    ))}
                  </select>
                  {loadingEpics && (
                    <div style={{ fontSize: '11px', color: '#fc6d26', marginTop: '4px' }}>
                      Loading epics...
                    </div>
                  )}
                </div>
              )}

              {/* Navigation Breadcrumb */}
              {navigationStack.length > 0 && (
                <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={handleNavigateBack}
                    style={{
                      padding: '4px 8px',
                      fontSize: '12px',
                      backgroundColor: '#f0f0f0',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    ← Back
                  </button>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {navigationStack.map((item, idx) => (
                      <span key={item.id}>
                        {idx > 0 && ' / '}
                        <span style={{ color: '#333' }}>{item.name}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Epics Dropdown */}
              {epics.length > 0 && (
                <div style={{ ...styles.fieldGroup, marginBottom: '12px' }}>
                  <label style={{ ...styles.label, fontSize: '12px' }}>
                    {navigationStack.length > 0 ? 'Select Item' : 'Select Epic'}
                  </label>
                  <select
                    style={{ ...styles.input, fontSize: '13px', padding: '8px 10px', cursor: 'pointer' }}
                    value={config.gitlab.selectedEpicId}
                    onChange={(e) => handleEpicSelect(e.target.value)}
                    disabled={!gitlabEnabled}
                  >
                    <option value="">-- Select --</option>
                    {epics.map(epic => (
                      <option key={epic.id} value={epic.id}>{epic.name}</option>
                    ))}
                  </select>
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                    📁 = Subgroup (click to drill down), 📄 = Project (select to use)
                  </div>
                </div>
              )}

              {/* Selected Project Indicator */}
              {config.gitlab.projectId && selectedProjectName && (
                <div style={{
                  padding: '8px 12px',
                  backgroundColor: '#e8f5e9',
                  borderRadius: '6px',
                  marginBottom: '12px',
                  fontSize: '12px',
                  color: '#2e7d32'
                }}>
                  ✓ Project: <strong>{selectedProjectName}</strong>
                </div>
              )}

              {/* Branch & Path in 2 columns */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={styles.fieldGroup}>
                  <label style={{ ...styles.label, fontSize: '12px' }}>Branch</label>
                  {branches.length > 0 ? (
                    <select
                      style={{ ...styles.input, fontSize: '13px', padding: '8px 10px', cursor: 'pointer' }}
                      value={config.gitlab.branch}
                      onChange={(e) => updateConfig({ ...config, gitlab: { ...config.gitlab, branch: e.target.value } })}
                      disabled={!gitlabEnabled}
                    >
                      {branches.map(branch => (
                        <option key={branch.name} value={branch.name}>
                          {branch.name} {branch.default ? '(default)' : ''} {branch.protected ? '🔒' : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      style={{ ...styles.input, fontSize: '13px', padding: '8px 10px' }}
                      value={config.gitlab.branch}
                      onChange={(e) => updateConfig({ ...config, gitlab: { ...config.gitlab, branch: e.target.value } })}
                      disabled={!gitlabEnabled}
                      placeholder="main"
                    />
                  )}
                </div>
                <div style={styles.fieldGroup}>
                  <label style={{ ...styles.label, fontSize: '12px' }}>File Path</label>
                  <input
                    type="text"
                    style={{ ...styles.input, fontSize: '13px', padding: '8px 10px' }}
                    placeholder="docs/epics/"
                    value={config.gitlab.epicFilePath}
                    onChange={(e) => updateConfig({ ...config, gitlab: { ...config.gitlab, epicFilePath: e.target.value } })}
                    disabled={!gitlabEnabled}
                  />
                </div>
              </div>

              {/* Test connection */}
              {gitlabEnabled && (
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
                  <TestButton testing={gitlabTestStatus?.testing || false} onClick={handleTestGitLab} color="#fc6d26" />
                  {gitlabTestStatus?.result && <StatusResult result={gitlabTestStatus.result} />}
                </div>
              )}

              {/* Hint when no project selected */}
              {gitlabEnabled && !config.gitlab.projectId && (
                <div style={{
                  marginTop: '16px',
                  padding: '12px',
                  backgroundColor: '#fef3c7',
                  borderRadius: '6px',
                  border: '1px solid #fcd34d',
                  fontSize: '12px',
                  color: '#92400e'
                }}>
                  <strong>Next Step:</strong> Select a Pod, then navigate through subgroups (📁) until you find a project (📄) to select.
                  Once a project is selected, you'll see the <strong>Repository Browser</strong> and <strong>Publish Mode</strong> options.
                </div>
              )}

              {/* File Browser Section */}
              {gitlabEnabled && config.gitlab.projectId && (
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <label style={{ ...styles.label, fontSize: '12px', fontWeight: 600, margin: 0 }}>
                      📂 Repository Browser
                    </label>
                    <button
                      onClick={() => handleBrowseFiles(currentRepoPath || '')}
                      disabled={loadingRepoFiles}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        backgroundColor: loadingRepoFiles ? '#94a3b8' : '#fc6d26',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: loadingRepoFiles ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {loadingRepoFiles ? 'Loading...' : repositoryFiles.length > 0 ? 'Refresh' : 'Browse Files'}
                    </button>
                  </div>

                  {/* Current Path & Back button */}
                  {repositoryFiles.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      {currentRepoPath && (
                        <button
                          onClick={handleBrowseParent}
                          style={{
                            padding: '2px 8px',
                            fontSize: '11px',
                            backgroundColor: '#e5e7eb',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          ← Back
                        </button>
                      )}
                      <span style={{ fontSize: '11px', color: '#6b7280' }}>
                        /{currentRepoPath || '(root)'}
                      </span>
                    </div>
                  )}

                  {/* File List */}
                  {repositoryFiles.length > 0 && (
                    <div style={{
                      maxHeight: '200px',
                      overflowY: 'auto',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      backgroundColor: '#fafafa',
                    }}>
                      {repositoryFiles.map((item) => (
                        <div
                          key={item.path}
                          onClick={() => {
                            if (item.type === 'tree') {
                              handleBrowseFiles(item.path);
                            } else {
                              handleLoadFile(item.path);
                            }
                          }}
                          style={{
                            padding: '8px 12px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            borderBottom: '1px solid #e5e7eb',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundColor: 'white',
                            transition: 'background-color 0.15s',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'white')}
                        >
                          <span>{item.type === 'tree' ? '📁' : '📄'}</span>
                          <span style={{ flex: 1 }}>{item.name}</span>
                          <span style={{ fontSize: '10px', color: '#9ca3af' }}>
                            {item.type === 'tree' ? 'folder' : 'file'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {repositoryFiles.length === 0 && !loadingRepoFiles && (
                    <div style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'center', padding: '12px' }}>
                      Click "Browse Files" to view repository contents
                    </div>
                  )}
                </div>
              )}

              {/* Publish Mode Toggle */}
              {gitlabEnabled && config.gitlab.projectId && (
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
                  <label style={{ ...styles.label, fontSize: '12px', fontWeight: 600, marginBottom: '8px', display: 'block' }}>
                    Publish Mode
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setPublishMode('direct')}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        fontSize: '12px',
                        border: publishMode === 'direct' ? '2px solid #fc6d26' : '1px solid #e5e7eb',
                        borderRadius: '6px',
                        backgroundColor: publishMode === 'direct' ? '#fff7ed' : 'white',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: '4px' }}>⚡ Direct Commit</div>
                      <div style={{ fontSize: '10px', color: '#6b7280' }}>
                        Commit directly to branch
                      </div>
                    </button>
                    <button
                      onClick={() => setPublishMode('mr')}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        fontSize: '12px',
                        border: publishMode === 'mr' ? '2px solid #fc6d26' : '1px solid #e5e7eb',
                        borderRadius: '6px',
                        backgroundColor: publishMode === 'mr' ? '#fff7ed' : 'white',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: '4px' }}>🔀 Merge Request</div>
                      <div style={{ fontSize: '10px', color: '#6b7280' }}>
                        Create branch + MR for review
                      </div>
                    </button>
                  </div>
                  <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '6px' }}>
                    {publishMode === 'direct'
                      ? 'Files will be committed directly to the selected branch'
                      : 'A new branch will be created and a Merge Request opened for review'}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick status footer */}
        <div style={{
          display: 'flex',
          gap: '16px',
          padding: '12px 16px',
          backgroundColor: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: aiEnabled ? '#22c55e' : '#d1d5db',
            }} />
            <span style={{ fontSize: '13px', color: '#64748b' }}>
              AI: {aiEnabled ? <span style={{ color: '#166534', fontWeight: 500 }}>{getActiveAIProvider(config)}</span> : 'Disabled'}
            </span>
          </div>
          <div style={{ width: '1px', backgroundColor: '#e2e8f0' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: gitlabEnabled ? '#22c55e' : '#d1d5db',
            }} />
            <span style={{ fontSize: '13px', color: '#64748b' }}>
              GitLab: {gitlabEnabled ? <span style={{ color: '#166534', fontWeight: 500 }}>Connected</span> : 'Disabled'}
            </span>
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>
            Settings auto-save to browser
          </span>
        </div>
      </div>
    );
  };

  // Publish to GitLab
  const handlePublishToGitLab = async () => {
    if (!config.gitlab.enabled) {
      setPublishStatus({ type: 'error', message: 'GitLab integration is not enabled. Configure it in Settings.' });
      showToast('error', 'GitLab Not Configured', 'Enable GitLab in Settings first');
      return;
    }

    setIsPublishing(true);
    setPublishStatus(null);

    const projectName = state.data['projectName']?.original || 'untitled';
    const fileName = `${projectName.toLowerCase().replace(/\s+/g, '-')}-epic.md`;
    const commitMessage = `Add epic: ${projectName}`;

    if (publishMode === 'mr') {
      // Merge Request mode: Create branch + commit + MR
      console.log('[Publish] Using Merge Request mode');
      const mrTitle = `Epic: ${projectName}`;
      const mrDescription = `This MR adds the epic documentation for **${projectName}**.\n\n---\n*Created via Epic Generator*`;

      const result = await publishWithMergeRequest(
        config.gitlab,
        fileName,
        editableEpic,
        commitMessage,
        mrTitle,
        mrDescription
      );

      if (result.success) {
        if (result.mrUrl) {
          setPublishStatus({
            type: 'success',
            message: `MR created! Branch: ${result.branchName} | View MR: ${result.mrUrl}`
          });
          showToast('success', 'Merge Request Created!', 'Review and merge when ready');
        } else {
          // Commit succeeded but MR failed
          setPublishStatus({
            type: 'success',
            message: `File committed to branch: ${result.branchName}. ${result.error || 'MR creation may have failed.'}`
          });
          showToast('warning', 'Partial Success', 'File committed but MR may need manual creation');
        }
      } else {
        setPublishStatus({ type: 'error', message: result.error || 'Failed to create MR' });
        showToast('error', 'MR Creation Failed', result.error || 'Could not create merge request');
      }
    } else {
      // Direct commit mode: Commit directly to branch
      console.log('[Publish] Using Direct Commit mode');
      const result = await publishToGitLab(config.gitlab, fileName, editableEpic, commitMessage);

      if (result.success) {
        setPublishStatus({ type: 'success', message: `Published successfully! View at: ${result.url}` });
        showToast('success', 'Published to GitLab!', 'Your epic is now live');
      } else {
        setPublishStatus({ type: 'error', message: result.error || 'Failed to publish' });
        showToast('error', 'Publish Failed', result.error || 'Could not publish to GitLab');
      }
    }

    setIsPublishing(false);
  };

  const renderEpicEditor = () => (
    <div style={{ display: 'flex', gap: '16px' }}>
      {/* Main Editor Area */}
      <div style={{ flex: chatState.isOpen ? '1 1 70%' : '1 1 100%', transition: 'flex 0.3s ease' }}>
        {/* Action bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={styles.stageTitle}>Epic Editor</div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              style={styles.button(false)}
              onClick={() => {
                navigator.clipboard.writeText(editableEpic);
                showToast('success', 'Copied!', 'Markdown copied to clipboard');
              }}
            >
              Copy Markdown
            </button>
            <button
              style={styles.button(false)}
              onClick={() => {
                const blob = new Blob([editableEpic], { type: 'text/markdown' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'epic.md';
                a.click();
                URL.revokeObjectURL(url);
                showToast('success', 'Downloaded!', 'Epic saved as epic.md');
              }}
            >
              Download .md
            </button>
            <button
              style={{
                ...styles.button(true),
                background: !config.gitlab.enabled
                  ? '#9ca3af'
                  : isPublishing
                    ? 'linear-gradient(90deg, #fdba74 25%, #fc6d26 50%, #fdba74 75%)'
                    : 'linear-gradient(135deg, #fc6d26 0%, #e85d04 100%)',
                backgroundSize: isPublishing ? '200% 100%' : '100% 100%',
                animation: isPublishing ? 'shimmer 1.5s ease-in-out infinite' : 'none',
                cursor: config.gitlab.enabled && !isPublishing ? 'pointer' : 'not-allowed',
              }}
              onClick={handlePublishToGitLab}
              disabled={isPublishing || !config.gitlab.enabled}
              title={config.gitlab.enabled
                ? (publishMode === 'mr' ? 'Create Merge Request' : 'Commit directly to branch')
                : 'Enable GitLab in Settings first'}
            >
              {isPublishing
                ? (publishMode === 'mr' ? 'Creating MR...' : 'Publishing...')
                : (publishMode === 'mr' ? '🔀 Create MR' : '⚡ Push to GitLab')}
            </button>
            <button style={styles.button(false)} onClick={resetWizard}>
              Start Over
            </button>
            {/* Chat toggle button */}
            {!chatState.isOpen && isAIEnabled(config) && (
              <button
                onClick={toggleChat}
                style={{
                  ...styles.button(true),
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                title="Open Feedback Chat"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
                </svg>
                AI Feedback
              </button>
            )}
          </div>
        </div>

        {/* Publish status */}
        {publishStatus && (
          <div style={{
            padding: '12px 16px',
            marginBottom: '16px',
            borderRadius: '8px',
            backgroundColor: publishStatus.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: publishStatus.type === 'success' ? '#166534' : '#991b1b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span>{publishStatus.message}</span>
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}
              onClick={() => setPublishStatus(null)}
            >
              ✕
            </button>
          </div>
        )}

        {/* Split screen */}
        <div style={styles.splitContainer}>
          {/* Editor pane */}
          <div style={styles.splitPane}>
            <div style={styles.editorPane}>
              <div style={styles.paneHeader}>
                <span>Editor (Markdown)</span>
                <span style={{ fontSize: '12px', color: '#666' }}>
                  {editableEpic.split('\n').length} lines
                </span>
              </div>
              <textarea
                style={styles.editor}
                value={editableEpic}
                onChange={(e) => setEditableEpic(e.target.value)}
                spellCheck={false}
              />
            </div>
          </div>

          {/* Preview pane */}
          <div style={styles.splitPane}>
            <div style={styles.previewPane}>
              <div style={styles.paneHeader}>
                <span>Preview (Markdown)</span>
                <span style={{ fontSize: '12px', color: '#666' }}>Live Preview</span>
              </div>
              <div style={{ overflow: 'auto', height: 'calc(100% - 45px)' }}>
                <MarkdownPreview content={editableEpic} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Panel */}
      {chatState.isOpen && (
        <div style={{
          flex: '0 0 340px',
          display: 'flex',
          flexDirection: 'column',
          height: '700px',
          background: 'white',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
        }}>
          {/* Chat Header */}
          <div style={{
            padding: '14px 16px',
            background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
            color: 'white',
            fontWeight: 600,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
              </svg>
              Epic Feedback
            </div>
            <button
              onClick={toggleChat}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'white',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>

          {/* Chat Messages */}
          <div
            ref={chatMessagesRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              backgroundColor: '#f9fafb',
            }}
          >
            {/* Welcome message if no messages */}
            {chatState.messages.length === 0 && (
              <div style={{
                padding: '16px',
                background: 'white',
                borderRadius: '12px',
                border: '1px solid #e5e7eb',
                textAlign: 'center',
                color: '#6b7280',
              }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="#8b5cf6" style={{ margin: '0 auto' }}>
                    <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                  </svg>
                </div>
                <div style={{ fontWeight: 500, marginBottom: '4px', color: '#374151' }}>AI-Powered Feedback</div>
                <div style={{ fontSize: '13px' }}>
                  Describe changes you'd like to make to your epic. I'll help you update specific sections.
                </div>
              </div>
            )}

            {/* Chat messages */}
            {chatState.messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                }}
              >
                <div style={{
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: msg.role === 'user'
                    ? 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)'
                    : 'white',
                  color: msg.role === 'user' ? 'white' : '#374151',
                  border: msg.role === 'assistant' ? '1px solid #e5e7eb' : 'none',
                  boxShadow: msg.role === 'assistant' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                }}>
                  <div style={{ fontSize: '14px', lineHeight: '1.5' }}>{msg.content}</div>

                  {/* Section dropdown if needed and not answered */}
                  {msg.questionType === 'section-select' && !msg.isAnswered && (
                    <select
                      onChange={(e) => {
                        const sectionNum = parseInt(e.target.value);
                        if (sectionNum) handleSectionSelect(sectionNum, msg.id);
                      }}
                      style={{
                        marginTop: '10px',
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #d1d5db',
                        backgroundColor: 'white',
                        fontSize: '13px',
                        cursor: 'pointer',
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>Select a section...</option>
                      {EPIC_SECTIONS.map(s => (
                        <option key={s.num} value={s.num}>{s.num}. {s.title}</option>
                      ))}
                    </select>
                  )}

                  {/* Show selected section */}
                  {msg.questionType === 'section-select' && msg.isAnswered && msg.selectedValue && (
                    <div style={{
                      marginTop: '8px',
                      padding: '6px 10px',
                      background: '#f3f4f6',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#6b7280',
                    }}>
                      Selected: {EPIC_SECTIONS[parseInt(msg.selectedValue) - 1]?.title}
                    </div>
                  )}

                  {/* Confirm buttons if needed and not answered */}
                  {msg.questionType === 'confirm' && !msg.isAnswered && (
                    <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleConfirmSection(true, msg.id)}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          color: 'white',
                          fontSize: '13px',
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        Yes, update it
                      </button>
                      <button
                        onClick={() => handleConfirmSection(false, msg.id)}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid #d1d5db',
                          background: 'white',
                          color: '#374151',
                          fontSize: '13px',
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        No, different
                      </button>
                    </div>
                  )}

                  {/* Show confirmation result */}
                  {msg.questionType === 'confirm' && msg.isAnswered && (
                    <div style={{
                      marginTop: '8px',
                      padding: '6px 10px',
                      background: '#f3f4f6',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#6b7280',
                    }}>
                      {msg.selectedValue === 'yes' ? 'Confirmed' : 'Selected different section'}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Processing indicator */}
            {chatState.isProcessing && (
              <div style={{
                alignSelf: 'flex-start',
                padding: '10px 14px',
                borderRadius: '14px 14px 14px 4px',
                background: 'white',
                border: '1px solid #e5e7eb',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#6b7280',
              }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#8b5cf6',
                  animation: 'pulse 1s ease-in-out infinite',
                }} />
                Thinking...
              </div>
            )}
          </div>

          {/* Chat Input */}
          <div style={{
            padding: '12px',
            borderTop: '1px solid #e5e7eb',
            background: 'white',
            display: 'flex',
            gap: '8px',
          }}>
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendChatMessage();
                }
              }}
              placeholder="Describe what you'd like to change..."
              disabled={chatState.isProcessing}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '20px',
                border: '1px solid #d1d5db',
                fontSize: '14px',
                outline: 'none',
              }}
            />
            <button
              onClick={handleSendChatMessage}
              disabled={chatState.isProcessing || !chatInput.trim()}
              style={{
                padding: '10px 16px',
                borderRadius: '20px',
                border: 'none',
                background: chatInput.trim() && !chatState.isProcessing
                  ? 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)'
                  : '#e5e7eb',
                color: chatInput.trim() && !chatState.isProcessing ? 'white' : '#9ca3af',
                fontSize: '14px',
                fontWeight: 500,
                cursor: chatInput.trim() && !chatState.isProcessing ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div style={styles.container}>
      {/* Header - UBS FRAME Branding */}
      <div style={styles.header}>
        {/* UBS Logo - Official PNG */}
        <img
          src="/UBS-3821101260.png"
          alt="UBS Logo"
          style={{ height: '45px', width: 'auto' }}
        />

        {/* FRAME Title */}
        <h1 style={{
          fontSize: '32px',
          fontWeight: '700',
          color: '#000000',
          letterSpacing: '3px',
          margin: 0,
        }}>
          FRAME
        </h1>

        {/* Subtitle */}
        <div style={{
          color: '#4b5563',
          fontSize: '14px',
          marginTop: '4px',
        }}>
          Feature Requirements & Architecture Management Engine
        </div>
      </div>

      {/* Progress Steps */}
      <div style={styles.progressContainer}>
        <div style={styles.progress}>
          {STAGES.map((stage, index) => {
            const isActive = index === state.currentStage;
            const isCompleted = index < state.currentStage;
            const isLast = index === STAGES.length - 1;
            return (
              <div key={index} style={styles.progressStep}>
                {/* Connection line */}
                {!isLast && (
                  <div style={styles.progressLine(isCompleted)} />
                )}
                {/* Step dot with number or checkmark */}
                <div style={styles.progressDot(isActive, isCompleted)}>
                  {isCompleted ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                {/* Step label */}
                <div style={styles.progressLabel(isActive, isCompleted)}>
                  {stage.title}
                </div>
              </div>
            );
          })}
          {/* Final step - Epic */}
          <div style={styles.progressStep}>
            <div style={styles.progressDot(hasEpic && activeTab !== 'wizard', hasEpic)}>
              {hasEpic ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                </svg>
              )}
            </div>
            <div style={styles.progressLabel(hasEpic && activeTab !== 'wizard', hasEpic)}>
              Epic
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={styles.tabsContainer}>
        <div style={styles.tabsGroup}>
          <button style={styles.tab(activeTab === 'wizard')} onClick={() => setActiveTab('wizard')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={styles.tabIcon}>
              <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/>
            </svg>
            Wizard
          </button>
          {hasEpic && (
            <>
              <button style={styles.tab(activeTab === 'epic')} onClick={() => setActiveTab('epic')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={styles.tabIcon}>
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                </svg>
                Epic Editor
              </button>
              <button style={styles.tab(activeTab === 'blueprint')} onClick={() => setActiveTab('blueprint')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={styles.tabIcon}>
                  <path d="M22 9V7h-2V5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-2h2v-2h-2v-2h2v-2h-2V9h2zm-4 10H4V5h14v14zM6 13h5v4H6zm6-6h4v3h-4zM6 7h5v5H6zm6 4h4v6h-4z"/>
                </svg>
                Blueprint
              </button>
            </>
          )}
        </div>
        <button
          style={{
            ...styles.tab(activeTab === 'settings'),
            background: activeTab === 'settings' ? 'white' : 'transparent',
          }}
          onClick={() => setActiveTab('settings')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={styles.tabIcon}>
            <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
          </svg>
          Settings
        </button>
      </div>

      {/* Content */}
      {isGenerating ? (
        <div className="generation-progress" style={{ padding: '32px' }}>
          {/* Progress Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span className="progress-percentage">{Math.round((generationProgress.current / generationProgress.total) * 100)}%</span>
            <span style={{ fontSize: '14px', color: '#666' }}>
              Section {generationProgress.current} of {generationProgress.total}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="progress-bar-container">
            <div
              className="progress-bar-fill"
              style={{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }}
            />
          </div>

          {/* Current Section */}
          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <div className="progress-section-name" style={{ marginBottom: '8px' }}>
              {generationProgress.section || 'Preparing...'}
            </div>
            <div style={{ fontSize: '13px', color: '#9ca3af' }}>
              Building your comprehensive epic document
            </div>
          </div>

          {/* Skeleton preview */}
          <div style={{ marginTop: '24px', opacity: 0.5 }}>
            <div className="skeleton" style={{ height: '60px', borderRadius: '8px', marginBottom: '12px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="skeleton" style={{ height: '40px', borderRadius: '8px' }} />
              <div className="skeleton" style={{ height: '40px', borderRadius: '8px' }} />
            </div>
          </div>
        </div>
      ) : activeTab === 'wizard' ? (
        renderWizard()
      ) : activeTab === 'blueprint' ? (
        renderBlueprint()
      ) : activeTab === 'settings' ? (
        renderSettings()
      ) : (
        renderEpicEditor()
      )}

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`toast toast-${toast.type}${toast.exiting ? ' toast-exit' : ''}`}
          >
            <div className="toast-icon">
              <ToastIcon type={toast.type} />
            </div>
            <div className="toast-content">
              <div className="toast-title">{toast.title}</div>
              {toast.message && <div className="toast-message">{toast.message}</div>}
            </div>
            <div
              className="toast-progress"
              style={{
                animation: `progressShrink ${toast.duration || 3000}ms linear forwards`,
              }}
            />
          </div>
        ))}
      </div>

      {/* Confetti Celebration */}
      <Confetti active={showConfetti} />
    </div>
  );
}
