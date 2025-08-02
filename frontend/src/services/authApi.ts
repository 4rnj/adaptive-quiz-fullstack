/**
 * Authentication API service
 * Handles auth-related API calls with AWS Cognito integration
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { LoginCredentials, RegisterData, AuthResponse, User } from '@/types/auth';

class AuthApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Response interceptor for error handling
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('Auth API Error:', error);
        return Promise.reject(error);
      }
    );
  }

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response: AxiosResponse<AuthResponse> = await this.api.post('/auth/login', credentials);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Login failed');
    }
  }

  async register(data: RegisterData): Promise<AuthResponse> {
    try {
      const response: AxiosResponse<AuthResponse> = await this.api.post('/auth/register', data);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Registration failed');
    }
  }

  async logout(): Promise<void> {
    try {
      await this.api.post('/auth/logout');
    } catch (error) {
      // Don't throw for logout errors - we'll clear local state anyway
      console.warn('Logout API call failed:', error);
    }
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    try {
      const response: AxiosResponse<AuthResponse> = await this.api.post('/auth/refresh', {
        refreshToken,
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Token refresh failed');
    }
  }

  async updateProfile(updates: Partial<User>): Promise<User> {
    try {
      const response: AxiosResponse<User> = await this.api.patch('/auth/profile', updates);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Profile update failed');
    }
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    try {
      await this.api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });
    } catch (error) {
      throw this.handleError(error, 'Password change failed');
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    try {
      await this.api.post('/auth/forgot-password', { email });
    } catch (error) {
      throw this.handleError(error, 'Password reset request failed');
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
      await this.api.post('/auth/reset-password', {
        token,
        newPassword,
      });
    } catch (error) {
      throw this.handleError(error, 'Password reset failed');
    }
  }

  async verifyEmail(token: string): Promise<void> {
    try {
      await this.api.post('/auth/verify-email', { token });
    } catch (error) {
      throw this.handleError(error, 'Email verification failed');
    }
  }

  async resendVerificationEmail(): Promise<void> {
    try {
      await this.api.post('/auth/resend-verification');
    } catch (error) {
      throw this.handleError(error, 'Failed to resend verification email');
    }
  }

  private handleError(error: any, defaultMessage: string): Error {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.message || error.response?.data?.error || defaultMessage;
      return new Error(message);
    }
    return new Error(defaultMessage);
  }
}

export const authApi = new AuthApiService();