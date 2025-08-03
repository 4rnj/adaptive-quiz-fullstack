/**
 * Security utilities for authentication hardening and session management
 * Implements OWASP security best practices for frontend applications
 */

// Security constants
export const SECURITY_CONFIG = {
  TOKEN: {
    ACCESS_TOKEN_TTL: 15 * 60 * 1000, // 15 minutes
    REFRESH_TOKEN_TTL: 7 * 24 * 60 * 60 * 1000, // 7 days
    STORAGE_KEY: '__quiz_session__',
    REFRESH_THRESHOLD: 5 * 60 * 1000, // Refresh 5 minutes before expiry
  },
  SESSION: {
    MAX_IDLE_TIME: 30 * 60 * 1000, // 30 minutes
    MAX_SESSION_TIME: 8 * 60 * 60 * 1000, // 8 hours
    ACTIVITY_CHECK_INTERVAL: 60 * 1000, // 1 minute
  },
  VALIDATION: {
    PASSWORD_MIN_LENGTH: 8,
    PASSWORD_COMPLEXITY_SCORE: 3, // out of 4 checks
    EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
  },
  CSP: {
    DEFAULT_SRC: "'self'",
    SCRIPT_SRC: "'self' 'unsafe-inline'",
    STYLE_SRC: "'self' 'unsafe-inline'",
    IMG_SRC: "'self' data: https:",
    CONNECT_SRC: "'self'",
    FONT_SRC: "'self'",
    OBJECT_SRC: "'none'",
    MEDIA_SRC: "'self'",
    FRAME_SRC: "'none'",
  }
} as const;

// Security event types for audit logging
export enum SecurityEvent {
  LOGIN_ATTEMPT = 'LOGIN_ATTEMPT',
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  INVALID_TOKEN = 'INVALID_TOKEN',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
}

// Token payload interface for JWT validation
export interface TokenPayload {
  sub: string; // User ID
  email: string;
  iat: number; // Issued at
  exp: number; // Expires at
  jti: string; // JWT ID for revocation
  scope: string[]; // User permissions
  device_id?: string; // Device binding
  session_id: string; // Session tracking
}

// Session metadata for security tracking
export interface SessionMetadata {
  sessionId: string;
  deviceId: string;
  userAgent: string;
  ipAddress: string;
  startTime: number;
  lastActivity: number;
  loginAttempts: number;
  isLocked: boolean;
  lockoutUntil?: number;
}

/**
 * Secure token storage manager using memory and secure cookies
 * Replaces insecure localStorage with security-hardened storage
 */
export class SecureTokenManager {
  private accessToken: string | null = null;
  private tokenExpiry: number | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private sessionMetadata: SessionMetadata | null = null;

  constructor() {
    this.initializeSession();
    this.startActivityMonitoring();
  }

  /**
   * Store access token securely in memory only
   * Refresh token stored in httpOnly cookie (backend responsibility)
   */
  setAccessToken(token: string, expiresIn: number): void {
    try {
      // Validate token structure before storing
      const payload = this.validateAndDecodeToken(token);
      if (!payload) {
        this.logSecurityEvent(SecurityEvent.INVALID_TOKEN, { token: 'malformed' });
        throw new Error('Invalid token format');
      }

      this.accessToken = token;
      this.tokenExpiry = Date.now() + (expiresIn * 1000);
      
      // Schedule automatic refresh
      this.scheduleTokenRefresh(expiresIn);
      
      // Update session activity
      this.updateLastActivity();
      
      this.logSecurityEvent(SecurityEvent.TOKEN_REFRESH, {
        userId: payload.sub,
        expiresIn,
        sessionId: payload.session_id
      });
    } catch (error) {
      this.logSecurityEvent(SecurityEvent.INVALID_TOKEN, { error: error instanceof Error ? error.message : 'Unknown error' });
      throw new Error('Failed to store access token securely');
    }
  }

  /**
   * Get access token with automatic validation and refresh
   */
  async getAccessToken(): Promise<string | null> {
    if (!this.accessToken || !this.tokenExpiry) {
      return null;
    }

    // Check if token is expired
    if (Date.now() >= this.tokenExpiry) {
      this.logSecurityEvent(SecurityEvent.SESSION_EXPIRED, { 
        expiry: new Date(this.tokenExpiry).toISOString() 
      });
      await this.handleTokenExpiry();
      return null;
    }

    // Check if token needs refresh (5 minutes before expiry)
    if (Date.now() >= (this.tokenExpiry - SECURITY_CONFIG.TOKEN.REFRESH_THRESHOLD)) {
      this.requestTokenRefresh();
    }

    this.updateLastActivity();
    return this.accessToken;
  }

  /**
   * Validate and decode JWT token
   */
  private validateAndDecodeToken(token: string): TokenPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      // Decode payload (base64url)
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      
      // Validate required fields
      if (!payload.sub || !payload.email || !payload.exp || !payload.iat || !payload.session_id) {
        return null;
      }

      // Check expiry
      if (payload.exp * 1000 <= Date.now()) {
        return null;
      }

      return payload as TokenPayload;
    } catch (error) {
      this.logSecurityEvent(SecurityEvent.INVALID_TOKEN, { 
        error: error instanceof Error ? error.message : 'Decode failure' 
      });
      return null;
    }
  }

  /**
   * Clear all tokens and session data
   */
  clearTokens(): void {
    this.accessToken = null;
    this.tokenExpiry = null;
    
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    // Clear session metadata
    if (this.sessionMetadata) {
      this.logSecurityEvent(SecurityEvent.LOGOUT, {
        sessionId: this.sessionMetadata.sessionId,
        duration: Date.now() - this.sessionMetadata.startTime
      });
      this.sessionMetadata = null;
    }

    // Remove from sessionStorage (backup storage)
    try {
      sessionStorage.removeItem(SECURITY_CONFIG.TOKEN.STORAGE_KEY);
    } catch (error) {
      // Ignore storage errors
    }
  }

  /**
   * Initialize session metadata with device fingerprinting
   */
  private initializeSession(): void {
    const deviceId = this.generateDeviceFingerprint();
    const sessionId = this.generateSecureSessionId();
    
    this.sessionMetadata = {
      sessionId,
      deviceId,
      userAgent: navigator.userAgent,
      ipAddress: '', // Will be set by backend
      startTime: Date.now(),
      lastActivity: Date.now(),
      loginAttempts: 0,
      isLocked: false,
    };
  }

  /**
   * Generate device fingerprint for device binding
   */
  private generateDeviceFingerprint(): string {
    const components = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset().toString(),
      navigator.hardwareConcurrency?.toString() || '0',
    ];
    
    // Simple hash function (in production, use crypto.subtle.digest)
    let hash = 0;
    const str = components.join('|');
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(36);
  }

  /**
   * Generate cryptographically secure session ID
   */
  private generateSecureSessionId(): string {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }
    
    // Fallback for environments without crypto API
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  /**
   * Schedule automatic token refresh
   */
  private scheduleTokenRefresh(expiresIn: number): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    // Refresh 5 minutes before expiry
    const refreshTime = Math.max(0, (expiresIn * 1000) - SECURITY_CONFIG.TOKEN.REFRESH_THRESHOLD);
    
    this.refreshTimer = setTimeout(() => {
      this.requestTokenRefresh();
    }, refreshTime);
  }

  /**
   * Request token refresh from auth service
   */
  private async requestTokenRefresh(): Promise<void> {
    try {
      // This will be handled by the auth store
      const event = new CustomEvent('tokenRefreshRequired', {
        detail: { sessionId: this.sessionMetadata?.sessionId }
      });
      window.dispatchEvent(event);
    } catch (error) {
      this.logSecurityEvent(SecurityEvent.SUSPICIOUS_ACTIVITY, {
        action: 'token_refresh_failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Handle token expiry
   */
  private async handleTokenExpiry(): Promise<void> {
    this.clearTokens();
    
    // Redirect to login
    const event = new CustomEvent('sessionExpired');
    window.dispatchEvent(event);
  }

  /**
   * Update last activity timestamp
   */
  private updateLastActivity(): void {
    if (this.sessionMetadata) {
      this.sessionMetadata.lastActivity = Date.now();
    }
  }

  /**
   * Start activity monitoring for session timeout
   */
  private startActivityMonitoring(): void {
    // Monitor user activity
    const activities = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    
    activities.forEach(activity => {
      document.addEventListener(activity, () => {
        this.updateLastActivity();
      }, { passive: true });
    });

    // Check for session timeout every minute
    setInterval(() => {
      this.checkSessionTimeout();
    }, SECURITY_CONFIG.SESSION.ACTIVITY_CHECK_INTERVAL);
  }

  /**
   * Check for session timeout
   */
  private checkSessionTimeout(): void {
    if (!this.sessionMetadata) return;

    const now = Date.now();
    const idleTime = now - this.sessionMetadata.lastActivity;
    const sessionTime = now - this.sessionMetadata.startTime;

    // Check idle timeout
    if (idleTime > SECURITY_CONFIG.SESSION.MAX_IDLE_TIME) {
      this.logSecurityEvent(SecurityEvent.SESSION_EXPIRED, {
        reason: 'idle_timeout',
        idleTime: Math.round(idleTime / 1000)
      });
      this.handleTokenExpiry();
      return;
    }

    // Check maximum session time
    if (sessionTime > SECURITY_CONFIG.SESSION.MAX_SESSION_TIME) {
      this.logSecurityEvent(SecurityEvent.SESSION_EXPIRED, {
        reason: 'max_session_time',
        sessionTime: Math.round(sessionTime / 1000)
      });
      this.handleTokenExpiry();
      return;
    }
  }

  /**
   * Get session metadata for security monitoring
   */
  getSessionMetadata(): SessionMetadata | null {
    return this.sessionMetadata;
  }

  /**
   * Log security events for audit trail
   */
  private logSecurityEvent(event: SecurityEvent, data: Record<string, any> = {}): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      sessionId: this.sessionMetadata?.sessionId,
      deviceId: this.sessionMetadata?.deviceId,
      userAgent: navigator.userAgent,
      url: window.location.href,
      ...data
    };

    // In development, log to console
    if (process.env.NODE_ENV === 'development') {
      console.log('[SECURITY]', logEntry);
    }

    // Send to security monitoring service
    try {
      // This would integrate with your security monitoring system
      fetch('/api/security/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logEntry)
      }).catch(() => {
        // Fail silently to avoid breaking user experience
      });
    } catch (error) {
      // Fail silently
    }
  }
}

/**
 * Input validation utilities with security hardening
 */
export class InputValidator {
  /**
   * Validate email format with security considerations
   */
  static validateEmail(email: string): { valid: boolean; error?: string } {
    if (!email || typeof email !== 'string') {
      return { valid: false, error: 'Email is required' };
    }

    if (email.length > 254) {
      return { valid: false, error: 'Email address too long' };
    }

    if (!SECURITY_CONFIG.VALIDATION.EMAIL_REGEX.test(email)) {
      return { valid: false, error: 'Invalid email format' };
    }

    // Check for common security issues
    if (email.includes('..') || email.startsWith('.') || email.endsWith('.')) {
      return { valid: false, error: 'Invalid email format' };
    }

    return { valid: true };
  }

  /**
   * Validate password with comprehensive security checks
   */
  static validatePassword(password: string): { valid: boolean; error?: string; score: number } {
    if (!password || typeof password !== 'string') {
      return { valid: false, error: 'Password is required', score: 0 };
    }

    if (password.length < SECURITY_CONFIG.VALIDATION.PASSWORD_MIN_LENGTH) {
      return { 
        valid: false, 
        error: `Password must be at least ${SECURITY_CONFIG.VALIDATION.PASSWORD_MIN_LENGTH} characters`, 
        score: 0 
      };
    }

    let score = 0;
    const checks = {
      hasLowerCase: /[a-z]/.test(password),
      hasUpperCase: /[A-Z]/.test(password),
      hasNumbers: /\d/.test(password),
      hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    };

    score = Object.values(checks).filter(Boolean).length;

    // Check for common weak patterns
    const weakPatterns = [
      /123456/,
      /password/i,
      /qwerty/i,
      /(.)\1{2,}/, // Repeated characters
    ];

    const hasWeakPattern = weakPatterns.some(pattern => pattern.test(password));
    if (hasWeakPattern) {
      return { valid: false, error: 'Password contains weak patterns', score: Math.max(0, score - 1) };
    }

    const isValid = score >= SECURITY_CONFIG.VALIDATION.PASSWORD_COMPLEXITY_SCORE;
    
    return {
      valid: isValid,
      error: isValid ? undefined : 'Password must contain uppercase, lowercase, numbers, and special characters',
      score
    };
  }

  /**
   * Sanitize user input to prevent XSS
   */
  static sanitizeInput(input: string): string {
    if (!input || typeof input !== 'string') return '';
    
    return input
      .replace(/[<>]/g, '') // Remove HTML brackets
      .replace(/javascript:/gi, '') // Remove javascript: URLs
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .trim()
      .substring(0, 1000); // Limit length
  }

  /**
   * Validate session name for quiz sessions
   */
  static validateSessionName(name: string): { valid: boolean; error?: string } {
    if (!name || typeof name !== 'string') {
      return { valid: false, error: 'Session name is required' };
    }

    const sanitized = this.sanitizeInput(name);
    if (sanitized.length < 3) {
      return { valid: false, error: 'Session name must be at least 3 characters' };
    }

    if (sanitized.length > 100) {
      return { valid: false, error: 'Session name too long (max 100 characters)' };
    }

    return { valid: true };
  }
}

/**
 * Rate limiting utility for client-side protection
 */
export class RateLimiter {
  private attempts: Map<string, { count: number; resetTime: number }> = new Map();

  /**
   * Check if action is rate limited
   */
  isRateLimited(key: string, maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000): boolean {
    const now = Date.now();
    const record = this.attempts.get(key);

    // Clean up expired records
    if (record && now > record.resetTime) {
      this.attempts.delete(key);
    }

    const currentRecord = this.attempts.get(key);
    
    if (!currentRecord) {
      this.attempts.set(key, { count: 1, resetTime: now + windowMs });
      return false;
    }

    if (currentRecord.count >= maxAttempts) {
      return true;
    }

    currentRecord.count++;
    return false;
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    this.attempts.delete(key);
  }

  /**
   * Get remaining attempts
   */
  getRemainingAttempts(key: string, maxAttempts: number = 5): number {
    const record = this.attempts.get(key);
    if (!record) return maxAttempts;
    
    return Math.max(0, maxAttempts - record.count);
  }
}

// Global instances
export const secureTokenManager = new SecureTokenManager();
export const rateLimiter = new RateLimiter();

// Security event dispatcher
export const dispatchSecurityEvent = (event: SecurityEvent, data?: Record<string, any>): void => {
  const customEvent = new CustomEvent('securityEvent', {
    detail: { event, data, timestamp: Date.now() }
  });
  window.dispatchEvent(customEvent);
};