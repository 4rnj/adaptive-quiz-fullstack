/**
 * TypeScript type definitions for the adaptive quiz application
 * Matches backend service interfaces for seamless integration
 */

export interface QuizAnswer {
  id: string;
  text: string;
}

export type QuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';
export type Language = 'EN' | 'ES' | 'FR' | 'DE' | 'IT' | 'PT' | 'ZH' | 'JA' | 'KO';

export interface Question {
  questionId: string;
  text: string;
  type: QuestionType;
  language: Language;
  answers: QuizAnswer[];
  correctAnswers: string[];
  explanation?: string;
  category?: string;
  difficulty?: number;
  isFromWrongPool?: boolean;
  remainingTries?: number;
  shuffled?: boolean;
}

export interface SessionSource {
  category: string;
  provider: string;
  certificate: string;
  language: Language;
  questionCount: number;
}

export interface SessionConfig {
  name: string;
  sources: SessionSource[];
  settings: {
    randomizeQuestions: boolean;
    adaptiveLearning: boolean;
    wrongAnswerPercentage: number;
    timeLimit?: number;
  };
  totalQuestions: number;
  estimatedDuration: number;
}

export type SessionStatus = 'CREATED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'EXPIRED';

export interface Session {
  sessionId: string;
  userId: string;
  config: SessionConfig;
  status: SessionStatus;
  questionPool: string[];
  answeredQuestions: string[];
  currentQuestion: number;
  totalQuestions: number;
  correctAnswers: number;
  startedAt?: string;
  completedAt?: string;
  timeSpent: number;
  version: number;
}

export interface ProgressIndicator {
  currentQuestion: number;
  totalQuestions: number;
  additionalQuestions: number;
  correctAnswers: number;
  wrongPoolSize: number;
  penaltyText?: string;
  completionPercentage: number;
}

export type NextAction = 'NEXT_QUESTION' | 'RETRY_SAME_QUESTION' | 'SESSION_COMPLETE';

export interface AnswerSubmission {
  questionId: string;
  selectedAnswers: string[];
  timeSpent: number;
}

export interface AnswerResult {
  correct: boolean;
  nextAction: NextAction;
  progress: ProgressIndicator;
  question?: Question;
  explanation?: string;
  message?: string;
  penaltyIndicator?: string;
}

export interface WrongAnswer {
  userId: string;
  questionId: string;
  timestamp: string;
  remainingTries: number;
  shuffledAnswers: QuizAnswer[];
  sessionId?: string;
}

export interface LearningMetrics {
  userId: string;
  totalQuestionsAttempted: number;
  totalCorrect: number;
  accuracyPercentage: number;
  averageTimePerQuestion: number;
  improvementTrend: 'improving' | 'stable' | 'declining' | 'insufficient_data';
  weakAreas: string[];
  strongAreas: string[];
  masteryLevel: number;
  learningVelocity: number;
  calculatedAt: string;
}

export interface SessionAnalytics {
  sessionId: string;
  userId: string;
  completionDate: string;
  totalQuestions: number;
  correctAnswers: number;
  accuracy: number;
  timeSpent: number;
  questionsFromWrongPool: number;
  immediateCorrections: number;
  categoriesCovered: string[];
  performanceScore: number;
}

export interface Recommendation {
  type: 'focus_weak_areas' | 'improve_accuracy' | 'improve_speed' | 'review_wrong_answers' | 'maintain_momentum';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  categories?: string[];
  targetAccuracy?: number;
  targetTime?: number;
  wrongPoolSize?: number;
}

// UI State Types
export interface QuizUIState {
  isLoading: boolean;
  error: string | null;
  currentQuestion: Question | null;
  selectedAnswers: string[];
  showExplanation: boolean;
  timeRemaining?: number;
  isSubmitting: boolean;
}

export interface SessionCreationState {
  step: 'sources' | 'settings' | 'review';
  selectedSources: SessionSource[];
  settings: SessionConfig['settings'];
  isValid: boolean;
  errors: Record<string, string>;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface CreateSessionResponse {
  sessionId: string;
  config: SessionConfig;
  estimatedDuration: number;
}

export interface GetQuestionResponse {
  question?: Question;
  progress: ProgressIndicator;
  sessionComplete?: boolean;
  penaltyIndicator?: string;
}

export interface SubmitAnswerResponse extends AnswerResult {
  sessionId: string;
}

// Filter and Search Types
export interface QuizFilters {
  categories: string[];
  providers: string[];
  certificates: string[];
  languages: Language[];
  difficulty?: number;
}

export interface SearchParams {
  query?: string;
  filters: QuizFilters;
  sortBy: 'name' | 'difficulty' | 'recent' | 'popular';
  sortOrder: 'asc' | 'desc';
}