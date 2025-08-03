/**
 * Quiz API service for backend integration
 * Handles all quiz-related API calls with adaptive learning backend
 * Implements security-hardened API communication
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { secureTokenManager, dispatchSecurityEvent, SecurityEvent } from '@/utils/security';
import {
  SessionConfig,
  AnswerSubmission,
  CreateSessionResponse,
  GetQuestionResponse,
  SubmitAnswerResponse,
  LearningMetrics,
  SessionAnalytics,
  Recommendation,
  Session,
} from '@/types/quiz';

class QuizApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token securely
    this.api.interceptors.request.use(
      async (config) => {
        try {
          const token = await secureTokenManager.getAccessToken();
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
          }
          
          // Add security headers
          config.headers['X-Requested-With'] = 'XMLHttpRequest';
          config.headers['X-Content-Type-Options'] = 'nosniff';
          
          return config;
        } catch (error) {
          dispatchSecurityEvent(SecurityEvent.SUSPICIOUS_ACTIVITY, {
            action: 'token_access_failed',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          return Promise.reject(error);
        }
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling with security monitoring
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        // Security event logging
        const status = error.response?.status;
        const endpoint = error.config?.url;
        
        if (status === 401) {
          dispatchSecurityEvent(SecurityEvent.INVALID_TOKEN, {
            endpoint,
            timestamp: Date.now()
          });
          
          // Trigger session expiry handling
          const event = new CustomEvent('sessionExpired');
          window.dispatchEvent(event);
          
        } else if (status === 403) {
          dispatchSecurityEvent(SecurityEvent.SUSPICIOUS_ACTIVITY, {
            action: 'forbidden_access',
            endpoint,
            status
          });
          
        } else if (status === 429) {
          dispatchSecurityEvent(SecurityEvent.RATE_LIMIT_EXCEEDED, {
            endpoint,
            timestamp: Date.now()
          });
        }
        
        return Promise.reject(error);
      }
    );
  }

  // Session Management
  async createSession(config: SessionConfig): Promise<CreateSessionResponse> {
    try {
      const response: AxiosResponse<CreateSessionResponse> = await this.api.post('/sessions', config);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to create session');
    }
  }

  async startSession(sessionId: string): Promise<void> {
    try {
      await this.api.post(`/sessions/${sessionId}/start`);
    } catch (error) {
      throw this.handleError(error, 'Failed to start session');
    }
  }

  async pauseSession(sessionId: string): Promise<void> {
    try {
      await this.api.post(`/sessions/${sessionId}/pause`);
    } catch (error) {
      throw this.handleError(error, 'Failed to pause session');
    }
  }

  async resumeSession(sessionId: string): Promise<void> {
    try {
      await this.api.post(`/sessions/${sessionId}/resume`);
    } catch (error) {
      throw this.handleError(error, 'Failed to resume session');
    }
  }

  async completeSession(sessionId: string): Promise<void> {
    try {
      await this.api.post(`/sessions/${sessionId}/complete`);
    } catch (error) {
      throw this.handleError(error, 'Failed to complete session');
    }
  }

  async getSession(sessionId: string): Promise<Session> {
    try {
      const response: AxiosResponse<Session> = await this.api.get(`/sessions/${sessionId}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to get session');
    }
  }

  async getUserSessions(): Promise<Session[]> {
    try {
      const response: AxiosResponse<Session[]> = await this.api.get('/sessions');
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to get user sessions');
    }
  }

  // Question Management
  async getCurrentQuestion(sessionId: string): Promise<GetQuestionResponse> {
    try {
      const response: AxiosResponse<GetQuestionResponse> = await this.api.get(
        `/sessions/${sessionId}/question`
      );
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to get current question');
    }
  }

  async submitAnswer(sessionId: string, submission: AnswerSubmission): Promise<SubmitAnswerResponse> {
    try {
      const response: AxiosResponse<SubmitAnswerResponse> = await this.api.post(
        `/sessions/${sessionId}/answer`,
        submission
      );
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to submit answer');
    }
  }

  // Analytics and Progress
  async getLearningMetrics(userId?: string): Promise<LearningMetrics> {
    try {
      const endpoint = userId ? `/analytics/users/${userId}` : '/analytics/me';
      const response: AxiosResponse<LearningMetrics> = await this.api.get(endpoint);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to get learning metrics');
    }
  }

  async getSessionAnalytics(sessionId: string): Promise<SessionAnalytics> {
    try {
      const response: AxiosResponse<SessionAnalytics> = await this.api.get(
        `/analytics/sessions/${sessionId}`
      );
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to get session analytics');
    }
  }

  async getRecommendations(): Promise<Recommendation[]> {
    try {
      const response: AxiosResponse<Recommendation[]> = await this.api.get('/analytics/recommendations');
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to get recommendations');
    }
  }

  // Wrong Answer Pool
  async getWrongAnswerPool(): Promise<any[]> {
    try {
      const response: AxiosResponse<any[]> = await this.api.get('/progress/wrong-answers');
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to get wrong answer pool');
    }
  }

  async clearWrongAnswerPool(): Promise<void> {
    try {
      await this.api.delete('/progress/wrong-answers');
    } catch (error) {
      throw this.handleError(error, 'Failed to clear wrong answer pool');
    }
  }

  // Available Sources
  async getAvailableSources(): Promise<any[]> {
    try {
      const response: AxiosResponse<any[]> = await this.api.get('/sources');
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to get available sources');
    }
  }

  async getSourceDetails(category: string, provider: string, certificate: string): Promise<any> {
    try {
      const response: AxiosResponse<any> = await this.api.get(
        `/sources/${category}/${provider}/${certificate}`
      );
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to get source details');
    }
  }

  // Utility Methods
  private handleError(error: any, defaultMessage: string): Error {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.message || error.response?.data?.error || defaultMessage;
      return new Error(message);
    }
    return new Error(defaultMessage);
  }

  // Health Check
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    try {
      const response = await this.api.get('/health');
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Health check failed');
    }
  }
}

export const quizApi = new QuizApiService();