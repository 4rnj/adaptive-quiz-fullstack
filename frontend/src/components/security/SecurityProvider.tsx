/**
 * Security Provider Component
 * Implements global security monitoring, session management, and event handling
 */

import React, { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { 
  SecurityEvent, 
  secureTokenManager,
  SECURITY_CONFIG 
} from '@/utils/security';

interface SecurityProviderProps {
  children: React.ReactNode;
}

export const SecurityProvider: React.FC<SecurityProviderProps> = ({ children }) => {
  const navigate = useNavigate();
  const { logout, refreshToken, isAuthenticated } = useAuthStore();

  /**
   * Handle security events with appropriate responses
   */
  const handleSecurityEvent = useCallback((event: CustomEvent) => {
    const { event: eventType, data } = event.detail;

    switch (eventType) {
      case SecurityEvent.SESSION_EXPIRED:
        toast.error('Your session has expired. Please log in again.', {
          duration: 5000,
          id: 'session-expired'
        });
        logout();
        navigate('/login', { replace: true });
        break;

      case SecurityEvent.INVALID_TOKEN:
        console.warn('Invalid token detected, attempting refresh...');
        if (isAuthenticated) {
          refreshToken().catch(() => {
            toast.error('Authentication failed. Please log in again.');
            logout();
            navigate('/login', { replace: true });
          });
        }
        break;

      case SecurityEvent.RATE_LIMIT_EXCEEDED:
        toast.error('Too many requests. Please slow down.', {
          duration: 8000,
          id: 'rate-limit'
        });
        break;

      case SecurityEvent.SUSPICIOUS_ACTIVITY:
        console.warn('Suspicious activity detected:', data);
        toast.error('Unusual activity detected. Please verify your account.', {
          duration: 10000,
          id: 'suspicious-activity'
        });
        break;

      case SecurityEvent.LOGIN_FAILURE:
        if (data?.error?.includes('rate limit') || data?.error?.includes('too many')) {
          toast.error('Account temporarily locked due to too many failed attempts.', {
            duration: 10000,
            id: 'account-locked'
          });
        }
        break;

      case SecurityEvent.TOKEN_REFRESH:
        // Silent success - no user notification needed
        break;

      default:
        // Log unknown security events
        console.warn('Unknown security event:', eventType, data);
    }
  }, [logout, navigate, refreshToken, isAuthenticated]);

  /**
   * Handle session expiry events
   */
  const handleSessionExpiry = useCallback(() => {
    toast.error('Your session has expired for security reasons.', {
      duration: 5000,
      id: 'session-expired'
    });
    logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  /**
   * Handle token refresh requests
   */
  const handleTokenRefreshRequest = useCallback(() => {
    if (isAuthenticated) {
      refreshToken().catch((error) => {
        console.error('Token refresh failed:', error);
        handleSessionExpiry();
      });
    }
  }, [isAuthenticated, refreshToken, handleSessionExpiry]);

  /**
   * Handle page visibility change for security
   */
  const handleVisibilityChange = useCallback(() => {
    if (document.hidden) {
      // Page is hidden - could implement additional security measures
      return;
    }

    // Page is visible again - check session validity
    if (isAuthenticated) {
      const sessionMetadata = secureTokenManager.getSessionMetadata();
      if (sessionMetadata) {
        const idleTime = Date.now() - sessionMetadata.lastActivity;
        
        // If idle for more than the configured time, show warning
        if (idleTime > SECURITY_CONFIG.SESSION.MAX_IDLE_TIME * 0.8) {
          toast('Your session will expire soon due to inactivity.', {
            duration: 5000,
            id: 'session-warning'
          });
        }
      }
    }
  }, [isAuthenticated]);

  /**
   * Handle beforeunload for security cleanup
   */
  const handleBeforeUnload = useCallback((_event: BeforeUnloadEvent) => {
    // Don't prevent unload, but log the event for security monitoring
    if (isAuthenticated) {
      const sessionMetadata = secureTokenManager.getSessionMetadata();
      if (sessionMetadata) {
        // Send beacon for security logging (non-blocking)
        try {
          navigator.sendBeacon('/api/security/events', JSON.stringify({
            event: 'page_unload',
            sessionId: sessionMetadata.sessionId,
            timestamp: Date.now()
          }));
        } catch (error) {
          // Fail silently
        }
      }
    }
  }, [isAuthenticated]);

  /**
   * Initialize security monitoring
   */
  useEffect(() => {
    // Add security event listeners
    window.addEventListener('securityEvent', handleSecurityEvent as EventListener);
    window.addEventListener('sessionExpired', handleSessionExpiry);
    window.addEventListener('tokenRefreshRequired', handleTokenRefreshRequest);
    
    // Add page lifecycle listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Add network status monitoring
    const handleOnline = () => {
      if (isAuthenticated) {
        // Check session validity when coming back online
        refreshToken().catch(() => {
          // Silent fail - let normal flow handle it
        });
      }
    };

    const handleOffline = () => {
      toast('You are offline. Some features may not work properly.', {
        duration: 3000,
        id: 'offline-warning'
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cleanup function
    return () => {
      window.removeEventListener('securityEvent', handleSecurityEvent as EventListener);
      window.removeEventListener('sessionExpired', handleSessionExpiry);
      window.removeEventListener('tokenRefreshRequired', handleTokenRefreshRequest);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [
    handleSecurityEvent,
    handleSessionExpiry,
    handleTokenRefreshRequest,
    handleVisibilityChange,
    handleBeforeUnload,
    isAuthenticated,
    refreshToken
  ]);

  /**
   * Add keyboard shortcut for emergency logout (Ctrl+Shift+L)
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key === 'L') {
        event.preventDefault();
        if (isAuthenticated) {
          toast('Emergency logout activated', { duration: 2000 });
          logout();
          navigate('/login', { replace: true });
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAuthenticated, logout, navigate]);

  return <>{children}</>;
};

/**
 * Security Context Hook for components that need security information
 */
export const useSecurityContext = () => {
  const sessionMetadata = secureTokenManager.getSessionMetadata();
  
  return {
    sessionId: sessionMetadata?.sessionId,
    deviceId: sessionMetadata?.deviceId,
    lastActivity: sessionMetadata?.lastActivity,
    isSecureSession: !!sessionMetadata,
    timeUntilExpiry: sessionMetadata 
      ? Math.max(0, (sessionMetadata.lastActivity + SECURITY_CONFIG.SESSION.MAX_IDLE_TIME) - Date.now())
      : 0
  };
};