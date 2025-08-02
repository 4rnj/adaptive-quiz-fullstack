/**
 * Authentication and user types
 */

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  preferences: UserPreferences;
  subscription?: UserSubscription;
  createdAt: string;
  lastLoginAt: string;
}

export interface UserPreferences {
  language: 'EN' | 'ES' | 'FR' | 'DE' | 'IT' | 'PT' | 'ZH' | 'JA' | 'KO';
  theme: 'light' | 'dark' | 'system';
  notifications: {
    email: boolean;
    push: boolean;
    reminders: boolean;
  };
  quiz: {
    autoAdvance: boolean;
    showExplanations: boolean;
    soundEffects: boolean;
    vibration: boolean;
  };
}

export interface UserSubscription {
  plan: 'free' | 'premium' | 'enterprise';
  status: 'active' | 'inactive' | 'expired';
  expiresAt?: string;
  features: string[];
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterData {
  email: string;
  password: string;
  confirmPassword: string;
  name: string;
  acceptTerms: boolean;
}

export interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
  expiresIn: number;
}