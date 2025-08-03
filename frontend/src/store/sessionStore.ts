/**
 * Zustand store for session creation and configuration
 * Handles multi-source session setup wizard
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import {
  SessionSource,
  SessionConfig,
  SessionCreationState,
  Language,
  // QuizFilters,
} from '@/types/quiz';

interface AvailableSource {
  category: string;
  provider: string;
  certificate: string;
  languages: Language[];
  totalQuestions: number;
  difficulty: number;
  description: string;
  estimatedTime: number;
}

interface SessionCreationStore {
  // Creation State
  creationState: SessionCreationState;
  availableSources: AvailableSource[];
  isLoadingSources: boolean;
  
  // Configuration
  sessionName: string;
  selectedSources: SessionSource[];
  settings: SessionConfig['settings'];
  
  // Validation
  errors: Record<string, string>;
  isValid: boolean;
  
  // Actions
  loadAvailableSources: () => Promise<void>;
  setSessionName: (name: string) => void;
  addSource: (source: SessionSource) => void;
  removeSource: (index: number) => void;
  updateSource: (index: number, source: Partial<SessionSource>) => void;
  updateSettings: (settings: Partial<SessionConfig['settings']>) => void;
  validateConfiguration: () => boolean;
  nextStep: () => void;
  previousStep: () => void;
  resetCreation: () => void;
  getSessionConfig: () => SessionConfig;
}

const initialSettings: SessionConfig['settings'] = {
  randomizeQuestions: true,
  adaptiveLearning: true,
  wrongAnswerPercentage: 20,
};

export const useSessionCreationStore = create<SessionCreationStore>()(
  devtools(
    immer((set, get) => ({
      // Initial State
      creationState: {
        step: 'sources',
        selectedSources: [],
        settings: initialSettings,
        isValid: false,
        errors: {},
      },
      availableSources: [],
      isLoadingSources: false,
      sessionName: '',
      selectedSources: [],
      settings: initialSettings,
      errors: {},
      isValid: false,

      // Load available quiz sources from backend
      loadAvailableSources: async () => {
        set((state) => {
          state.isLoadingSources = true;
        });

        try {
          // Mock data for now - replace with actual API call
          const sources: AvailableSource[] = [
            {
              category: 'programming',
              provider: 'python',
              certificate: 'pcap',
              languages: ['EN'],
              totalQuestions: 150,
              difficulty: 3,
              description: 'Python Certified Associate Programmer',
              estimatedTime: 90,
            },
            {
              category: 'programming',
              provider: 'javascript',
              certificate: 'fundamentals',
              languages: ['EN', 'ES'],
              totalQuestions: 200,
              difficulty: 2,
              description: 'JavaScript Fundamentals Certification',
              estimatedTime: 60,
            },
            {
              category: 'cloud',
              provider: 'aws',
              certificate: 'saa',
              languages: ['EN'],
              totalQuestions: 300,
              difficulty: 4,
              description: 'AWS Solutions Architect Associate',
              estimatedTime: 120,
            },
            {
              category: 'cloud',
              provider: 'azure',
              certificate: 'az-900',
              languages: ['EN'],
              totalQuestions: 250,
              difficulty: 2,
              description: 'Azure Fundamentals',
              estimatedTime: 75,
            },
            {
              category: 'networking',
              provider: 'cisco',
              certificate: 'ccna',
              languages: ['EN'],
              totalQuestions: 400,
              difficulty: 4,
              description: 'Cisco Certified Network Associate',
              estimatedTime: 150,
            },
          ];

          set((state) => {
            state.availableSources = sources;
            state.isLoadingSources = false;
          });
        } catch (error) {
          set((state) => {
            state.isLoadingSources = false;
            state.errors.sources = 'Failed to load available sources';
          });
        }
      },

      setSessionName: (name: string) => {
        set((state) => {
          state.sessionName = name;
          state.creationState.isValid = get().validateConfiguration();
          
          if (name.trim().length < 3) {
            state.errors.sessionName = 'Session name must be at least 3 characters';
          } else {
            delete state.errors.sessionName;
          }
        });
      },

      addSource: (source: SessionSource) => {
        set((state) => {
          state.selectedSources.push(source);
          state.creationState.selectedSources = state.selectedSources;
          state.creationState.isValid = get().validateConfiguration();
          
          // Clear errors if valid
          if (state.selectedSources.length > 0) {
            delete state.errors.sources;
          }
        });
      },

      removeSource: (index: number) => {
        set((state) => {
          state.selectedSources.splice(index, 1);
          state.creationState.selectedSources = state.selectedSources;
          state.creationState.isValid = get().validateConfiguration();
          
          if (state.selectedSources.length === 0) {
            state.errors.sources = 'At least one source must be selected';
          }
        });
      },

      updateSource: (index: number, sourceUpdate: Partial<SessionSource>) => {
        set((state) => {
          if (state.selectedSources[index]) {
            Object.assign(state.selectedSources[index], sourceUpdate);
            state.creationState.selectedSources = state.selectedSources;
            state.creationState.isValid = get().validateConfiguration();
          }
        });
      },

      updateSettings: (settingsUpdate: Partial<SessionConfig['settings']>) => {
        set((state) => {
          Object.assign(state.settings, settingsUpdate);
          state.creationState.settings = state.settings;
          state.creationState.isValid = get().validateConfiguration();
          
          // Validate wrong answer percentage
          if (settingsUpdate.wrongAnswerPercentage !== undefined) {
            const percentage = settingsUpdate.wrongAnswerPercentage;
            if (percentage < 0 || percentage > 50) {
              state.errors.wrongAnswerPercentage = 'Must be between 0 and 50';
            } else {
              delete state.errors.wrongAnswerPercentage;
            }
          }
        });
      },

      validateConfiguration: () => {
        const { sessionName, selectedSources, settings } = get();
        const errors: Record<string, string> = {};

        // Validate session name
        if (!sessionName || sessionName.trim().length < 3) {
          errors.sessionName = 'Session name must be at least 3 characters';
        }

        // Validate sources
        if (selectedSources.length === 0) {
          errors.sources = 'At least one source must be selected';
        }

        // Validate individual sources
        selectedSources.forEach((source, index) => {
          if (source.questionCount < 1) {
            errors[`source_${index}_count`] = 'Question count must be at least 1';
          }
          if (source.questionCount > 100) {
            errors[`source_${index}_count`] = 'Question count cannot exceed 100';
          }
        });

        // Validate settings
        if (settings.wrongAnswerPercentage < 0 || settings.wrongAnswerPercentage > 50) {
          errors.wrongAnswerPercentage = 'Must be between 0 and 50';
        }

        // Calculate total questions
        const totalQuestions = selectedSources.reduce((sum, source) => sum + source.questionCount, 0);
        if (totalQuestions > 200) {
          errors.totalQuestions = 'Total questions cannot exceed 200';
        }

        set((state) => {
          state.errors = errors;
          state.isValid = Object.keys(errors).length === 0;
        });

        return Object.keys(errors).length === 0;
      },

      nextStep: () => {
        // const { creationState } = get();
        const isValid = get().validateConfiguration();
        
        if (!isValid) return;

        set((state) => {
          switch (state.creationState.step) {
            case 'sources':
              state.creationState.step = 'settings';
              break;
            case 'settings':
              state.creationState.step = 'review';
              break;
          }
        });
      },

      previousStep: () => {
        set((state) => {
          switch (state.creationState.step) {
            case 'settings':
              state.creationState.step = 'sources';
              break;
            case 'review':
              state.creationState.step = 'settings';
              break;
          }
        });
      },

      resetCreation: () => {
        set((state) => {
          state.creationState = {
            step: 'sources',
            selectedSources: [],
            settings: initialSettings,
            isValid: false,
            errors: {},
          };
          state.sessionName = '';
          state.selectedSources = [];
          state.settings = { ...initialSettings };
          state.errors = {};
          state.isValid = false;
        });
      },

      getSessionConfig: (): SessionConfig => {
        const { sessionName, selectedSources, settings } = get();
        const totalQuestions = selectedSources.reduce((sum, source) => sum + source.questionCount, 0);
        const estimatedDuration = selectedSources.reduce((sum, source) => {
          // Estimate 2 minutes per question
          return sum + (source.questionCount * 2);
        }, 0);

        return {
          name: sessionName,
          sources: selectedSources,
          settings,
          totalQuestions,
          estimatedDuration,
        };
      },
    })),
    {
      name: 'session-creation-store',
    }
  )
);