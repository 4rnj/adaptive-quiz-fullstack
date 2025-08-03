/**
 * Zustand store for authentication state management
 * Implements security-hardened authentication with secure token storage
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { AuthState, User, LoginCredentials, RegisterData, AuthResponse } from '@/types/auth';
import { authApi } from '@/services/authApi';
import { 
  secureTokenManager, 
  rateLimiter, 
  InputValidator, 
  SecurityEvent, 
  dispatchSecurityEvent,
  SECURITY_CONFIG 
} from '@/utils/security';
import { secureStorage, DataClassification, PIIType } from '@/utils/dataProtection';

interface AuthStore extends AuthState {
  // Actions
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  clearError: () => void;
  setUser: (user: User) => void;
  setToken: (token: string, expiresIn: number) => void;
  
  // Security actions
  validateInput: (email: string, password: string) => { valid: boolean; errors: string[] };
  checkRateLimit: (identifier: string) => boolean;
  getSessionMetadata: () => any;
  
  // Secure storage actions
  saveUserPreferences: (preferences: any) => Promise<void>;
  loadUserPreferences: () => Promise<any>;
  clearUserData: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>()(
  devtools(
    persist(
      immer((set, get) => ({
        // Initial State
        isAuthenticated: false,
        user: null,
        token: null,
        isLoading: false,
        error: null,

        // Login action with security hardening
        login: async (credentials: LoginCredentials) => {
          // Input validation
          const validation = get().validateInput(credentials.email, credentials.password);
          if (!validation.valid) {
            set((state) => {
              state.error = validation.errors.join(', ');
            });
            return;
          }

          // Rate limiting check
          const rateLimitKey = `login:${credentials.email}`;
          if (get().checkRateLimit(rateLimitKey)) {
            set((state) => {
              state.error = 'Too many login attempts. Please try again later.';
            });
            dispatchSecurityEvent(SecurityEvent.RATE_LIMIT_EXCEEDED, { email: credentials.email });
            return;
          }

          set((state) => {
            state.isLoading = true;
            state.error = null;
          });

          try {
            dispatchSecurityEvent(SecurityEvent.LOGIN_ATTEMPT, { email: credentials.email });
            
            const response: AuthResponse = await authApi.login(credentials);
            
            // Store access token securely
            secureTokenManager.setAccessToken(response.token, response.expiresIn);
            
            set((state) => {
              state.isAuthenticated = true;
              state.user = response.user;
              state.token = null; // Don't store token in state
              state.isLoading = false;
            });

            dispatchSecurityEvent(SecurityEvent.LOGIN_SUCCESS, { 
              userId: response.user.id,
              email: credentials.email 
            });

            // Reset rate limit on successful login
            rateLimiter.reset(rateLimitKey);
            
          } catch (error) {
            set((state) => {
              state.error = error instanceof Error ? error.message : 'Login failed';
              state.isLoading = false;
            });
            
            dispatchSecurityEvent(SecurityEvent.LOGIN_FAILURE, { 
              email: credentials.email,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        },

        // Register action with security hardening
        register: async (data: RegisterData) => {
          // Input validation
          const validation = get().validateInput(data.email, data.password);
          if (!validation.valid) {
            set((state) => {
              state.error = validation.errors.join(', ');
            });
            return;
          }

          // Additional registration validation
          if (data.password !== data.confirmPassword) {
            set((state) => {
              state.error = 'Passwords do not match';
            });
            return;
          }

          if (!data.acceptTerms) {
            set((state) => {
              state.error = 'You must accept the terms and conditions';
            });
            return;
          }

          // Rate limiting for registration
          const rateLimitKey = `register:${data.email}`;
          if (get().checkRateLimit(rateLimitKey)) {
            set((state) => {
              state.error = 'Too many registration attempts. Please try again later.';
            });
            return;
          }

          set((state) => {
            state.isLoading = true;
            state.error = null;
          });

          try {
            const response: AuthResponse = await authApi.register(data);
            
            // Store access token securely
            secureTokenManager.setAccessToken(response.token, response.expiresIn);
            
            set((state) => {
              state.isAuthenticated = true;
              state.user = response.user;
              state.token = null; // Don't store token in state
              state.isLoading = false;
            });

            dispatchSecurityEvent(SecurityEvent.LOGIN_SUCCESS, { 
              userId: response.user.id,
              email: data.email,
              action: 'register'
            });

          } catch (error) {
            set((state) => {
              state.error = error instanceof Error ? error.message : 'Registration failed';
              state.isLoading = false;
            });
          }
        },

        // Logout action with security cleanup
        logout: () => {
          const { user } = get();
          
          try {
            authApi.logout();
          } catch (error) {
            // Logout locally even if API call fails
            console.warn('Logout API call failed:', error);
          }

          // Clear secure token storage
          secureTokenManager.clearTokens();
          
          // Clear user-specific secure storage but preserve preferences
          // Full data clearing should be done through GDPR rights
          try {
            secureStorage.remove('quiz_session');
            secureStorage.remove('quiz_progress');
            secureStorage.remove('quiz_history');
          } catch (error) {
            console.warn('Failed to clear session storage:', error);
          }
          
          set((state) => {
            state.isAuthenticated = false;
            state.user = null;
            state.token = null;
            state.error = null;
          });

          dispatchSecurityEvent(SecurityEvent.LOGOUT, { 
            userId: user?.id 
          });
        },

        // Refresh token action with security validation
        refreshToken: async () => {
          try {
            // This is now handled by the backend via httpOnly cookies
            const response: AuthResponse = await authApi.refreshToken('');
            
            // Store new access token securely
            secureTokenManager.setAccessToken(response.token, response.expiresIn);
            
            set((state) => {
              state.user = response.user;
              state.token = null; // Don't store in state
              state.isAuthenticated = true;
            });

            dispatchSecurityEvent(SecurityEvent.TOKEN_REFRESH, { 
              userId: response.user.id 
            });
            
          } catch (error) {
            console.error('Token refresh failed:', error);
            dispatchSecurityEvent(SecurityEvent.SESSION_EXPIRED, { 
              reason: 'refresh_failed'
            });
            get().logout();
          }
        },

        // Update profile action
        updateProfile: async (updates: Partial<User>) => {
          const { user } = get();
          if (!user) return;

          set((state) => {
            state.isLoading = true;
            state.error = null;
          });

          try {
            const updatedUser = await authApi.updateProfile(updates);
            
            set((state) => {
              state.user = updatedUser;
              state.isLoading = false;
            });
          } catch (error) {
            set((state) => {
              state.error = error instanceof Error ? error.message : 'Profile update failed';
              state.isLoading = false;
            });
          }
        },

        // Clear error action
        clearError: () => {
          set((state) => {
            state.error = null;
          });
        },

        // Set user (for external auth flows)
        setUser: (user: User) => {
          set((state) => {
            state.user = user;
            state.isAuthenticated = true;
          });
        },

        // Set token with security validation (for external auth flows)
        setToken: (token: string, expiresIn: number) => {
          try {
            // Store access token securely
            secureTokenManager.setAccessToken(token, expiresIn);
            
            set((state) => {
              state.token = null; // Don't store in state
              state.isAuthenticated = true;
            });
          } catch (error) {
            console.error('Failed to set token securely:', error);
            set((state) => {
              state.error = 'Authentication failed';
            });
          }
        },

        // Input validation method
        validateInput: (email: string, password: string) => {
          const errors: string[] = [];
          
          const emailValidation = InputValidator.validateEmail(email);
          if (!emailValidation.valid) {
            errors.push(emailValidation.error!);
          }
          
          const passwordValidation = InputValidator.validatePassword(password);
          if (!passwordValidation.valid) {
            errors.push(passwordValidation.error!);
          }
          
          return { valid: errors.length === 0, errors };
        },

        // Rate limiting check
        checkRateLimit: (identifier: string) => {
          return rateLimiter.isRateLimited(
            identifier, 
            SECURITY_CONFIG.VALIDATION.MAX_LOGIN_ATTEMPTS,
            SECURITY_CONFIG.VALIDATION.LOCKOUT_DURATION
          );
        },

        // Get session metadata
        getSessionMetadata: () => {
          return secureTokenManager.getSessionMetadata();
        },

        // Save user preferences securely
        saveUserPreferences: async (preferences: any) => {
          const { user } = get();
          if (!user) return;
          
          try {
            await secureStorage.store(`user_preferences_${user.id}`, preferences, {
              classification: DataClassification.INTERNAL,
              piiType: PIIType.USER_PREFERENCES,
              purpose: 'User experience personalization',
              legalBasis: 'Legitimate interest',
              expiresIn: 5 * 365 * 24 * 60 * 60 * 1000, // 5 years
            });
          } catch (error) {
            console.error('Failed to save user preferences:', error);
          }
        },

        // Load user preferences securely
        loadUserPreferences: async () => {
          const { user } = get();
          if (!user) return null;
          
          try {
            return await secureStorage.retrieve(`user_preferences_${user.id}`);
          } catch (error) {
            console.error('Failed to load user preferences:', error);
            return null;
          }
        },

        // Clear all user data securely
        clearUserData: async () => {
          const { user } = get();
          if (!user) return;
          
          try {
            // Clear user-specific data
            secureStorage.remove(`user_preferences_${user.id}`);
            secureStorage.remove(`quiz_session_${user.id}`);
            secureStorage.remove(`quiz_results_${user.id}`);
            
            // Clear general secure storage if no other users
            const keys = secureStorage.list();
            const userDataKeys = keys.filter(key => !key.includes(user.id));
            if (userDataKeys.length === 0) {
              secureStorage.clear();
            }
          } catch (error) {
            console.error('Failed to clear user data:', error);
          }
        },
      })),
      {
        name: 'auth-store',
        partialize: (state) => ({
          user: state.user,
          // Don't persist token - it's handled securely
          isAuthenticated: state.isAuthenticated,
        }),
      }
    ),
    {
      name: 'auth-store',
    }
  )
);