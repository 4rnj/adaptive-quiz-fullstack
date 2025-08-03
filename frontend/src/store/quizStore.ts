/**
 * Zustand store for adaptive quiz state management
 * Handles session creation, question flow, and answer processing
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import {
  Session,
  Question,
  AnswerSubmission,
  AnswerResult,
  ProgressIndicator,
  SessionConfig,
  // NextAction,
  QuizUIState,
} from '@/types/quiz';
import { quizApi } from '@/services/quizApi';
import { secureStorage, DataClassification, PIIType } from '@/utils/dataProtection';

interface QuizState {
  // Session Management
  currentSession: Session | null;
  isCreatingSession: boolean;
  
  // Question Flow
  currentQuestion: Question | null;
  questionHistory: Question[];
  isLoadingQuestion: boolean;
  
  // Answer Processing
  isSubmittingAnswer: boolean;
  lastAnswerResult: AnswerResult | null;
  
  // Progress Tracking
  progress: ProgressIndicator | null;
  
  // UI State
  ui: QuizUIState;
  
  // Error Handling
  error: string | null;
  
  // Actions
  createSession: (config: SessionConfig) => Promise<void>;
  startSession: (sessionId: string) => Promise<void>;
  getCurrentQuestion: () => Promise<void>;
  submitAnswer: (submission: AnswerSubmission) => Promise<void>;
  handleRetryQuestion: () => void;
  completeSession: () => Promise<void>;
  pauseSession: () => Promise<void>;
  resumeSession: () => Promise<void>;
  resetQuiz: () => void;
  clearError: () => void;
  
  // Secure Storage Actions
  loadPersistedState: () => Promise<void>;
  saveSessionSecurely: () => Promise<void>;
  clearSecureStorage: () => void;
  
  // UI Actions
  selectAnswer: (answerId: string) => void;
  unselectAnswer: (answerId: string) => void;
  clearSelectedAnswers: () => void;
  toggleExplanation: () => void;
  setTimeRemaining: (time: number) => void;
}

export const useQuizStore = create<QuizState>()(
  devtools(
    immer((set, get) => ({
        // Initial State
        currentSession: null,
        isCreatingSession: false,
        currentQuestion: null,
        questionHistory: [],
        isLoadingQuestion: false,
        isSubmittingAnswer: false,
        lastAnswerResult: null,
        progress: null,
        ui: {
          isLoading: false,
          error: null,
          currentQuestion: null,
          selectedAnswers: [],
          showExplanation: false,
          isSubmitting: false,
        },
        error: null,

        // Session Management Actions
        createSession: async (config: SessionConfig) => {
          set((state) => {
            state.isCreatingSession = true;
            state.error = null;
          });

          try {
            const response = await quizApi.createSession(config);
            
            set((state) => {
              state.currentSession = {
                sessionId: response.sessionId,
                userId: '', // Will be populated from auth
                config: response.config,
                status: 'CREATED',
                questionPool: [],
                answeredQuestions: [],
                currentQuestion: 0,
                totalQuestions: response.config.totalQuestions,
                correctAnswers: 0,
                timeSpent: 0,
                version: 1,
              };
              state.isCreatingSession = false;
            });
          } catch (error) {
            set((state) => {
              state.error = error instanceof Error ? error.message : 'Failed to create session';
              state.isCreatingSession = false;
            });
          }
        },

        startSession: async (sessionId: string) => {
          set((state) => {
            state.ui.isLoading = true;
            state.error = null;
          });

          try {
            await quizApi.startSession(sessionId);
            
            set((state) => {
              if (state.currentSession) {
                state.currentSession.status = 'ACTIVE';
                state.currentSession.startedAt = new Date().toISOString();
              }
              state.ui.isLoading = false;
            });

            // Load first question
            await get().getCurrentQuestion();
          } catch (error) {
            set((state) => {
              state.error = error instanceof Error ? error.message : 'Failed to start session';
              state.ui.isLoading = false;
            });
          }
        },

        getCurrentQuestion: async () => {
          const { currentSession } = get();
          if (!currentSession) return;

          set((state) => {
            state.isLoadingQuestion = true;
            state.error = null;
          });

          try {
            const response = await quizApi.getCurrentQuestion(currentSession.sessionId);
            
            set((state) => {
              if (response.sessionComplete) {
                state.currentQuestion = null;
                if (state.currentSession) {
                  state.currentSession.status = 'COMPLETED';
                  state.currentSession.completedAt = new Date().toISOString();
                }
              } else if (response.question) {
                state.currentQuestion = response.question;
                state.ui.currentQuestion = response.question;
                state.questionHistory.push(response.question);
              }
              
              state.progress = response.progress;
              state.isLoadingQuestion = false;
              
              // Clear previous answer state
              state.ui.selectedAnswers = [];
              state.ui.showExplanation = false;
              state.lastAnswerResult = null;
            });
          } catch (error) {
            set((state) => {
              state.error = error instanceof Error ? error.message : 'Failed to load question';
              state.isLoadingQuestion = false;
            });
          }
        },

        submitAnswer: async (submission: AnswerSubmission) => {
          const { currentSession } = get();
          if (!currentSession) return;

          set((state) => {
            state.isSubmittingAnswer = true;
            state.ui.isSubmitting = true;
            state.error = null;
          });

          try {
            const result = await quizApi.submitAnswer(currentSession.sessionId, submission);
            
            set((state) => {
              state.lastAnswerResult = result;
              state.progress = result.progress;
              state.isSubmittingAnswer = false;
              state.ui.isSubmitting = false;
              
              // Update session stats
              if (state.currentSession) {
                if (result.correct) {
                  state.currentSession.correctAnswers += 1;
                }
                state.currentSession.timeSpent += submission.timeSpent;
              }

              // Handle immediate retry for wrong answers
              if (result.nextAction === 'RETRY_SAME_QUESTION' && result.question) {
                state.currentQuestion = result.question;
                state.ui.currentQuestion = result.question;
                state.ui.selectedAnswers = [];
                state.ui.showExplanation = false;
              }
              
              // Show explanation if provided
              if (result.explanation) {
                state.ui.showExplanation = true;
              }
            });

            // Auto-advance to next question if correct
            if (result.nextAction === 'NEXT_QUESTION') {
              setTimeout(() => {
                get().getCurrentQuestion();
              }, 2000); // 2 second delay to show result
            }
          } catch (error) {
            set((state) => {
              state.error = error instanceof Error ? error.message : 'Failed to submit answer';
              state.isSubmittingAnswer = false;
              state.ui.isSubmitting = false;
            });
          }
        },

        handleRetryQuestion: () => {
          set((state) => {
            state.ui.selectedAnswers = [];
            state.ui.showExplanation = false;
            state.lastAnswerResult = null;
          });
        },

        completeSession: async () => {
          const { currentSession } = get();
          if (!currentSession) return;

          try {
            await quizApi.completeSession(currentSession.sessionId);
            
            set((state) => {
              if (state.currentSession) {
                state.currentSession.status = 'COMPLETED';
                state.currentSession.completedAt = new Date().toISOString();
              }
            });
          } catch (error) {
            set((state) => {
              state.error = error instanceof Error ? error.message : 'Failed to complete session';
            });
          }
        },

        pauseSession: async () => {
          const { currentSession } = get();
          if (!currentSession) return;

          try {
            await quizApi.pauseSession(currentSession.sessionId);
            
            set((state) => {
              if (state.currentSession) {
                state.currentSession.status = 'PAUSED';
              }
            });
          } catch (error) {
            set((state) => {
              state.error = error instanceof Error ? error.message : 'Failed to pause session';
            });
          }
        },

        resumeSession: async () => {
          const { currentSession } = get();
          if (!currentSession) return;

          try {
            await quizApi.resumeSession(currentSession.sessionId);
            
            set((state) => {
              if (state.currentSession) {
                state.currentSession.status = 'ACTIVE';
              }
            });
          } catch (error) {
            set((state) => {
              state.error = error instanceof Error ? error.message : 'Failed to resume session';
            });
          }
        },

        resetQuiz: () => {
          set((state) => {
            state.currentSession = null;
            state.currentQuestion = null;
            state.questionHistory = [];
            state.lastAnswerResult = null;
            state.progress = null;
            state.error = null;
            state.ui = {
              isLoading: false,
              error: null,
              currentQuestion: null,
              selectedAnswers: [],
              showExplanation: false,
              isSubmitting: false,
            };
          });
        },

        clearError: () => {
          set((state) => {
            state.error = null;
            state.ui.error = null;
          });
        },

        // UI Actions
        selectAnswer: (answerId: string) => {
          set((state) => {
            const { currentQuestion } = state;
            if (!currentQuestion) return;

            if (currentQuestion.type === 'SINGLE_CHOICE') {
              state.ui.selectedAnswers = [answerId];
            } else {
              if (!state.ui.selectedAnswers.includes(answerId)) {
                state.ui.selectedAnswers.push(answerId);
              }
            }
          });
        },

        unselectAnswer: (answerId: string) => {
          set((state) => {
            state.ui.selectedAnswers = state.ui.selectedAnswers.filter((id: string) => id !== answerId);
          });
        },

        clearSelectedAnswers: () => {
          set((state) => {
            state.ui.selectedAnswers = [];
          });
        },

        toggleExplanation: () => {
          set((state) => {
            state.ui.showExplanation = !state.ui.showExplanation;
          });
        },

        setTimeRemaining: (time: number) => {
          set((state) => {
            state.ui.timeRemaining = time;
          });
        },

        // Secure Storage Actions
        loadPersistedState: async () => {
          try {
            const sessionData = await secureStorage.retrieve('quiz_session');
            const progressData = await secureStorage.retrieve('quiz_progress');
            const historyData = await secureStorage.retrieve('quiz_history');
            
            if (sessionData || progressData || historyData) {
              set((state) => {
                if (sessionData) state.currentSession = sessionData;
                if (progressData) state.progress = progressData;
                if (historyData) state.questionHistory = historyData;
              });
            }
          } catch (error) {
            console.warn('Failed to load persisted quiz state:', error);
          }
        },

        saveSessionSecurely: async () => {
          const { currentSession, progress, questionHistory } = get();
          
          try {
            if (currentSession) {
              await secureStorage.store('quiz_session', currentSession, {
                classification: DataClassification.CONFIDENTIAL,
                piiType: PIIType.QUIZ_RESULTS,
                purpose: 'Quiz session state management',
                legalBasis: 'Contract performance',
                expiresIn: 30 * 24 * 60 * 60 * 1000, // 30 days
              });
            }
            
            if (progress) {
              await secureStorage.store('quiz_progress', progress, {
                classification: DataClassification.INTERNAL,
                piiType: PIIType.QUIZ_RESULTS,
                purpose: 'Learning progress tracking',
                legalBasis: 'Legitimate interest',
                expiresIn: 2 * 365 * 24 * 60 * 60 * 1000, // 2 years
              });
            }
            
            if (questionHistory.length > 0) {
              await secureStorage.store('quiz_history', questionHistory, {
                classification: DataClassification.INTERNAL,
                purpose: 'Quiz history for analytics',
                legalBasis: 'Legitimate interest',
                expiresIn: 90 * 24 * 60 * 60 * 1000, // 90 days
              });
            }
          } catch (error) {
            console.warn('Failed to save quiz state securely:', error);
          }
        },

        clearSecureStorage: () => {
          try {
            secureStorage.remove('quiz_session');
            secureStorage.remove('quiz_progress');
            secureStorage.remove('quiz_history');
          } catch (error) {
            console.warn('Failed to clear secure storage:', error);
          }
        },
      })),
    {
      name: 'quiz-store',
    }
  )
);

// Auto-save to secure storage when important state changes
let lastSessionId: string | null = null;
useQuizStore.subscribe((state) => {
  const currentSessionId = state.currentSession?.sessionId || null;
  
  // Save when session changes or important updates occur
  if (currentSessionId !== lastSessionId || state.progress || state.currentSession) {
    lastSessionId = currentSessionId;
    
    // Debounce saves to avoid excessive storage operations
    setTimeout(() => {
      useQuizStore.getState().saveSessionSecurely();
    }, 1000);
  }
});

// Load persisted state on store initialization
if (typeof window !== 'undefined') {
  useQuizStore.getState().loadPersistedState();
}