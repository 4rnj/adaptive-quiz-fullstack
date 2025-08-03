/**
 * CSRF Protected Form Components
 * React components with automatic CSRF protection
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { csrfProtection, useCSRFProtection } from '../../utils/csrfProtection';

// CSRF Protected Form Props
export interface CSRFProtectedFormProps extends React.FormHTMLAttributes<HTMLFormElement> {
  onSubmit?: (event: React.FormEvent<HTMLFormElement>, token: string) => void;
  onCSRFError?: (error: string) => void;
  validateOnSubmit?: boolean;
  autoRefreshToken?: boolean;
  tokenRefreshInterval?: number;
  showTokenStatus?: boolean;
  children: React.ReactNode;
}

/**
 * CSRF Protected Form Component
 * Automatically adds CSRF token to forms and validates on submission
 */
export const CSRFProtectedForm: React.FC<CSRFProtectedFormProps> = ({
  onSubmit,
  onCSRFError,
  validateOnSubmit = true,
  autoRefreshToken = false,
  tokenRefreshInterval = 1800000, // 30 minutes
  showTokenStatus = false,
  children,
  ...formProps
}) => {
  const { generateToken, getToken, refreshToken } = useCSRFProtection();
  const [csrfToken, setCSRFToken] = useState<string>('');
  const [tokenStatus, setTokenStatus] = useState<'valid' | 'expired' | 'missing'>('missing');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize CSRF token
  useEffect(() => {
    const initializeToken = () => {
      let token = getToken();
      if (!token) {
        token = generateToken();
      }
      setCSRFToken(token);
      setTokenStatus('valid');
    };

    initializeToken();
  }, [generateToken, getToken]);

  // Setup automatic token refresh
  useEffect(() => {
    if (autoRefreshToken && tokenRefreshInterval > 0) {
      refreshIntervalRef.current = setInterval(() => {
        try {
          const newToken = refreshToken();
          setCSRFToken(newToken);
          setTokenStatus('valid');
          console.log('🔄 CSRF token automatically refreshed');
        } catch (error) {
          console.error('❌ Failed to refresh CSRF token:', error);
          setTokenStatus('expired');
          if (onCSRFError) {
            onCSRFError('Failed to refresh CSRF token');
          }
        }
      }, tokenRefreshInterval);

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
        }
      };
    }
  }, [autoRefreshToken, tokenRefreshInterval, refreshToken, onCSRFError]);

  // Handle form submission
  const handleSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Validate CSRF token if required
      if (validateOnSubmit) {
        const currentToken = getToken();
        if (!currentToken) {
          throw new Error('CSRF token not found');
        }

        // Update token if different
        if (currentToken !== csrfToken) {
          setCSRFToken(currentToken);
        }
      }

      // Call custom onSubmit handler
      if (onSubmit) {
        await onSubmit(event, csrfToken);
      } else {
        // Default form submission
        const form = event.currentTarget;
        const formData = new FormData(form);
        
        // Ensure CSRF token is in form data
        if (!formData.has('_csrf_token')) {
          formData.set('_csrf_token', csrfToken);
        }

        // Submit form (you would replace this with your actual submission logic)
        console.log('📝 Form submitted with CSRF protection:', {
          action: form.action,
          method: form.method,
          hasToken: formData.has('_csrf_token'),
        });
      }

      setTokenStatus('valid');
    } catch (error) {
      console.error('❌ CSRF protected form submission failed:', error);
      setTokenStatus('expired');
      
      if (onCSRFError) {
        onCSRFError(error instanceof Error ? error.message : 'CSRF validation failed');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, validateOnSubmit, getToken, csrfToken, onSubmit, onCSRFError]);

  // Manually refresh token
  const handleRefreshToken = useCallback(() => {
    try {
      const newToken = refreshToken();
      setCSRFToken(newToken);
      setTokenStatus('valid');
      console.log('🔄 CSRF token manually refreshed');
    } catch (error) {
      console.error('❌ Failed to manually refresh CSRF token:', error);
      setTokenStatus('expired');
      if (onCSRFError) {
        onCSRFError('Failed to refresh CSRF token');
      }
    }
  }, [refreshToken, onCSRFError]);

  return (
    <form
      {...formProps}
      onSubmit={handleSubmit}
      data-csrf-protected="true"
      data-token-status={tokenStatus}
    >
      {/* Hidden CSRF token input */}
      <input
        type="hidden"
        name="_csrf_token"
        value={csrfToken}
        data-testid="csrf-token-input"
      />

      {/* Token status indicator */}
      {showTokenStatus && (
        <div className={`csrf-token-status csrf-token-status--${tokenStatus}`}>
          <span className="csrf-token-status__icon">
            {tokenStatus === 'valid' && '🔒'}
            {tokenStatus === 'expired' && '⚠️'}
            {tokenStatus === 'missing' && '❌'}
          </span>
          <span className="csrf-token-status__text">
            CSRF Protection: {tokenStatus}
          </span>
          {tokenStatus !== 'valid' && (
            <button
              type="button"
              className="csrf-token-status__refresh"
              onClick={handleRefreshToken}
              disabled={isSubmitting}
            >
              Refresh Token
            </button>
          )}
        </div>
      )}

      {children}

      {/* Submission status */}
      {isSubmitting && (
        <div className="csrf-form-submitting">
          <span>🔄 Submitting securely...</span>
        </div>
      )}
    </form>
  );
};

/**
 * CSRF Token Provider Component
 * Provides CSRF token context to child components
 */
export interface CSRFTokenContextValue {
  token: string;
  refreshToken: () => string;
  isValid: boolean;
}

const CSRFTokenContext = React.createContext<CSRFTokenContextValue | null>(null);

export interface CSRFTokenProviderProps {
  children: React.ReactNode;
  sessionId?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export const CSRFTokenProvider: React.FC<CSRFTokenProviderProps> = ({
  children,
  sessionId,
  autoRefresh = true,
  refreshInterval = 1800000, // 30 minutes
}) => {
  const { generateToken, getToken, refreshToken } = useCSRFProtection();
  const [token, setToken] = useState<string>('');
  const [isValid, setIsValid] = useState<boolean>(false);

  // Initialize token
  useEffect(() => {
    const initializeToken = () => {
      let currentToken = getToken(sessionId);
      if (!currentToken) {
        currentToken = generateToken(sessionId);
      }
      setToken(currentToken);
      setIsValid(true);
    };

    initializeToken();
  }, [generateToken, getToken, sessionId]);

  // Auto refresh token
  useEffect(() => {
    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(() => {
        try {
          const newToken = refreshToken(sessionId);
          setToken(newToken);
          setIsValid(true);
          console.log('🔄 CSRF token auto-refreshed in provider');
        } catch (error) {
          console.error('❌ Failed to auto-refresh CSRF token:', error);
          setIsValid(false);
        }
      }, refreshInterval);

      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, refreshToken, sessionId]);

  const handleRefreshToken = useCallback(() => {
    try {
      const newToken = refreshToken(sessionId);
      setToken(newToken);
      setIsValid(true);
      return newToken;
    } catch (error) {
      console.error('❌ Failed to refresh CSRF token:', error);
      setIsValid(false);
      throw error;
    }
  }, [refreshToken, sessionId]);

  const contextValue: CSRFTokenContextValue = {
    token,
    refreshToken: handleRefreshToken,
    isValid,
  };

  return (
    <CSRFTokenContext.Provider value={contextValue}>
      {children}
    </CSRFTokenContext.Provider>
  );
};

/**
 * Hook to use CSRF token from context
 */
export function useCSRFToken(): CSRFTokenContextValue {
  const context = React.useContext(CSRFTokenContext);
  if (!context) {
    throw new Error('useCSRFToken must be used within a CSRFTokenProvider');
  }
  return context;
}

/**
 * CSRF Protected Button Component
 * Button that includes CSRF token in requests
 */
export interface CSRFProtectedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onClick?: (event: React.MouseEvent<HTMLButtonElement>, token: string) => void;
  requireToken?: boolean;
  showTokenStatus?: boolean;
  onCSRFError?: (error: string) => void;
}

export const CSRFProtectedButton: React.FC<CSRFProtectedButtonProps> = ({
  onClick,
  requireToken = true,
  showTokenStatus = false,
  onCSRFError,
  children,
  disabled,
  ...buttonProps
}) => {
  const { getToken } = useCSRFProtection();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleClick = useCallback(async (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isProcessing) {
      return;
    }

    setIsProcessing(true);

    try {
      let token = '';
      
      if (requireToken) {
        token = getToken();
        if (!token) {
          throw new Error('CSRF token not available');
        }
      }

      if (onClick) {
        await onClick(event, token);
      }
    } catch (error) {
      console.error('❌ CSRF protected button click failed:', error);
      if (onCSRFError) {
        onCSRFError(error instanceof Error ? error.message : 'CSRF validation failed');
      }
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, requireToken, getToken, onClick, onCSRFError]);

  return (
    <button
      {...buttonProps}
      onClick={handleClick}
      disabled={disabled || isProcessing}
      data-csrf-protected={requireToken}
      data-processing={isProcessing}
    >
      {isProcessing ? '🔄 Processing...' : children}
      {showTokenStatus && requireToken && (
        <span className="csrf-button-status">
          🔒
        </span>
      )}
    </button>
  );
};

/**
 * CSRF Protected AJAX Hook
 * Hook for making CSRF-protected AJAX requests
 */
export function useCSRFProtectedRequest() {
  const { getToken } = useCSRFProtection();

  const makeRequest = useCallback(async (
    url: string,
    options: RequestInit = {}
  ): Promise<Response> => {
    const token = getToken();
    if (!token) {
      throw new Error('CSRF token not available');
    }

    // Add CSRF token to headers
    const headers = new Headers(options.headers);
    headers.set('X-CSRF-Token', token);
    headers.set('X-Requested-With', 'XMLHttpRequest');

    // Make request with CSRF protection
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('CSRF token validation failed');
      }
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    return response;
  }, [getToken]);

  return { makeRequest };
}

// CSS styles for CSRF components (to be included in your CSS)
export const csrfComponentStyles = `
.csrf-token-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 12px;
  border-radius: 4px;
  margin-bottom: 16px;
}

.csrf-token-status--valid {
  background-color: #d4edda;
  border: 1px solid #c3e6cb;
  color: #155724;
}

.csrf-token-status--expired {
  background-color: #fff3cd;
  border: 1px solid #ffeaa7;
  color: #856404;
}

.csrf-token-status--missing {
  background-color: #f8d7da;
  border: 1px solid #f5c6cb;
  color: #721c24;
}

.csrf-token-status__refresh {
  background: #007bff;
  color: white;
  border: none;
  padding: 4px 8px;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
}

.csrf-token-status__refresh:hover {
  background: #0056b3;
}

.csrf-token-status__refresh:disabled {
  background: #6c757d;
  cursor: not-allowed;
}

.csrf-form-submitting {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: #cce7ff;
  border: 1px solid #99d3ff;
  border-radius: 4px;
  color: #004085;
  font-size: 14px;
  margin-top: 8px;
}

.csrf-button-status {
  margin-left: 4px;
  font-size: 10px;
}

button[data-csrf-protected="true"] {
  position: relative;
}

button[data-processing="true"] {
  opacity: 0.7;
  cursor: not-allowed;
}

form[data-csrf-protected="true"] {
  position: relative;
}

form[data-token-status="expired"] {
  border-left: 3px solid #ffc107;
  padding-left: 8px;
}

form[data-token-status="missing"] {
  border-left: 3px solid #dc3545;
  padding-left: 8px;
}
`;

export default CSRFProtectedForm;