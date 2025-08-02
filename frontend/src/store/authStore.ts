/**
 * Zustand store for authentication state management
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { AuthState, User, LoginCredentials, RegisterData, AuthResponse } from '@/types/auth';
import { authApi } from '@/services/authApi';

interface AuthStore extends AuthState {
  // Actions
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  clearError: () => void;
  setUser: (user: User) => void;
  setToken: (token: string) => void;
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

        // Login action
        login: async (credentials: LoginCredentials) => {
          set((state) => {
            state.isLoading = true;
            state.error = null;
          });

          try {
            const response: AuthResponse = await authApi.login(credentials);
            
            set((state) => {
              state.isAuthenticated = true;
              state.user = response.user;
              state.token = response.token;
              state.isLoading = false;
            });

            // Store refresh token separately (more secure)
            if (credentials.rememberMe && response.refreshToken) {
              localStorage.setItem('refreshToken', response.refreshToken);
            }
          } catch (error) {
            set((state) => {
              state.error = error instanceof Error ? error.message : 'Login failed';
              state.isLoading = false;
            });
          }
        },

        // Register action
        register: async (data: RegisterData) => {
          set((state) => {
            state.isLoading = true;
            state.error = null;
          });

          try {
            const response: AuthResponse = await authApi.register(data);
            
            set((state) => {
              state.isAuthenticated = true;
              state.user = response.user;
              state.token = response.token;
              state.isLoading = false;
            });
          } catch (error) {
            set((state) => {
              state.error = error instanceof Error ? error.message : 'Registration failed';
              state.isLoading = false;
            });
          }
        },

        // Logout action
        logout: () => {
          try {
            authApi.logout();
          } catch (error) {
            // Logout locally even if API call fails
            console.warn('Logout API call failed:', error);
          }

          localStorage.removeItem('refreshToken');
          
          set((state) => {
            state.isAuthenticated = false;
            state.user = null;
            state.token = null;
            state.error = null;
          });
        },

        // Refresh token action
        refreshToken: async () => {
          const refreshToken = localStorage.getItem('refreshToken');
          if (!refreshToken) {
            get().logout();
            return;
          }

          try {
            const response: AuthResponse = await authApi.refreshToken(refreshToken);
            
            set((state) => {
              state.user = response.user;
              state.token = response.token;
              state.isAuthenticated = true;
            });

            // Update refresh token
            localStorage.setItem('refreshToken', response.refreshToken);
          } catch (error) {
            console.error('Token refresh failed:', error);
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

        // Set token (for external auth flows)
        setToken: (token: string) => {
          set((state) => {
            state.token = token;
            state.isAuthenticated = true;
          });
        },
      })),
      {
        name: 'auth-store',
        partialize: (state) => ({
          user: state.user,
          token: state.token,
          isAuthenticated: state.isAuthenticated,
        }),
      }
    ),
    {
      name: 'auth-store',
    }
  )
);