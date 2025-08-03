/**
 * Security Integration Layer
 * Integrates all security systems with the main application
 */

import { 
  securityLogger, 
  SecurityEventType, 
  SecuritySeverity 
} from './securityLogging';
import { threatDetector } from './threatDetection';
import { auditTrail, AuditCategory } from './auditTrail';
import { securityAlerts, AlertType } from '../components/security/SecurityAlerts';
import { SECURITY_CONFIG, SecurityEvent } from './security';

/**
 * Enhanced Security Event Dispatcher
 * Integrates with all security systems
 */
export const dispatchEnhancedSecurityEvent = async (
  event: SecurityEvent, 
  data?: any,
  options?: {
    userId?: string;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<void> => {
  try {
    // Map security events to logging types
    const eventTypeMap: Record<SecurityEvent, SecurityEventType> = {
      [SecurityEvent.LOGIN_ATTEMPT]: SecurityEventType.LOGIN_ATTEMPT,
      [SecurityEvent.LOGIN_SUCCESS]: SecurityEventType.LOGIN_SUCCESS,
      [SecurityEvent.LOGIN_FAILURE]: SecurityEventType.LOGIN_FAILURE,
      [SecurityEvent.LOGOUT]: SecurityEventType.LOGOUT,
      [SecurityEvent.TOKEN_REFRESH]: SecurityEventType.TOKEN_REFRESH,
      [SecurityEvent.TOKEN_EXPIRED]: SecurityEventType.TOKEN_EXPIRED,
      [SecurityEvent.SESSION_EXPIRED]: SecurityEventType.SESSION_EXPIRED,
      [SecurityEvent.INVALID_TOKEN]: SecurityEventType.INVALID_TOKEN,
      [SecurityEvent.RATE_LIMIT_EXCEEDED]: SecurityEventType.RATE_LIMIT_EXCEEDED,
      [SecurityEvent.SUSPICIOUS_ACTIVITY]: SecurityEventType.SUSPICIOUS_ACTIVITY,
      [SecurityEvent.PASSWORD_CHANGE]: SecurityEventType.SECURITY_EVENT,
    };
    
    const securityEventType = eventTypeMap[event];
    if (!securityEventType) return;
    
    // Determine severity
    const severity = getSeverityForEvent(event);
    
    // Log to security system
    const logEntry = await securityLogger.logEvent(
      securityEventType,
      {
        originalEvent: event,
        ...data
      },
      {
        severity,
        userId: options?.userId,
        sessionId: options?.sessionId,
      }
    );
    
    // Analyze for threats
    const threatAnalysis = await threatDetector.analyzeEvent(logEntry);
    if (threatAnalysis.isAnomaly) {
      // Create security alert
      await securityAlerts.createAlert(
        getAlertTypeForThreat(threatAnalysis),
        {
          source: 'threat_detection',
          affectedUser: options?.userId,
          ipAddress: options?.ipAddress,
          riskScore: threatAnalysis.anomalyScore,
        },
        [logEntry.id]
      );
    }
    
    // Log to audit trail for critical events
    if (shouldAudit(event)) {
      await auditTrail.logAuditEvent(
        getAuditCategoryForEvent(event),
        event,
        {
          actor: {
            type: options?.userId ? 'user' : 'system',
            id: options?.userId || 'system',
            ipAddress: options?.ipAddress,
            userAgent: options?.userAgent,
            sessionId: options?.sessionId,
          },
          result: getResultForEvent(event),
          context: {
            component: 'security_system',
            operation: event,
          },
          riskLevel: getRiskLevelForEvent(event),
        }
      );
    }
    
    // Dispatch to UI
    window.dispatchEvent(new CustomEvent('securityEvent', {
      detail: { event, data, logEntry, threatAnalysis }
    }));
    
  } catch (error) {
    console.error('Enhanced security event dispatch failed:', error);
    
    // Fallback: at least log the error
    await securityLogger.logEvent(
      SecurityEventType.SECURITY_EVENT,
      {
        error: 'security_integration_failure',
        originalEvent: event,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      },
      {
        severity: SecuritySeverity.HIGH
      }
    );
  }
};

/**
 * Enhanced Input Validation with Security Logging
 */
export class EnhancedInputValidator {
  /**
   * Validate email with security logging
   */
  static async validateEmailSecure(
    email: string,
    context: { userId?: string; sessionId?: string } = {}
  ): Promise<{ valid: boolean; error?: string }> {
    const result = this.validateEmail(email);
    
    if (!result.valid) {
      await dispatchEnhancedSecurityEvent(
        SecurityEvent.SUSPICIOUS_ACTIVITY,
        {
          type: 'invalid_email_format',
          email: email.substring(0, 3) + '***', // Partially mask
          error: result.error
        },
        context
      );
    }
    
    return result;
  }
  
  /**
   * Basic email validation
   */
  static validateEmail(email: string): { valid: boolean; error?: string } {
    if (!email) {
      return { valid: false, error: 'Email is required' };
    }
    
    if (email.length > 254) {
      return { valid: false, error: 'Email is too long' };
    }
    
    if (!SECURITY_CONFIG.VALIDATION.EMAIL_REGEX.test(email)) {
      return { valid: false, error: 'Invalid email format' };
    }
    
    return { valid: true };
  }
  
  /**
   * Validate password with security logging
   */
  static async validatePasswordSecure(
    password: string,
    context: { userId?: string; sessionId?: string } = {}
  ): Promise<{ valid: boolean; error?: string; strength?: string }> {
    const result = this.validatePassword(password);
    
    if (!result.valid) {
      await dispatchEnhancedSecurityEvent(
        SecurityEvent.SUSPICIOUS_ACTIVITY,
        {
          type: 'weak_password_attempt',
          strength: result.strength,
          error: result.error
        },
        context
      );
    }
    
    return result;
  }
  
  /**
   * Basic password validation
   */
  static validatePassword(password: string): { valid: boolean; error?: string; strength?: string } {
    if (!password) {
      return { valid: false, error: 'Password is required', strength: 'none' };
    }
    
    if (password.length < SECURITY_CONFIG.VALIDATION.PASSWORD_MIN_LENGTH) {
      return { 
        valid: false, 
        error: `Password must be at least ${SECURITY_CONFIG.VALIDATION.PASSWORD_MIN_LENGTH} characters`,
        strength: 'weak'
      };
    }
    
    // Check complexity
    const checks = [
      /[a-z]/.test(password), // lowercase
      /[A-Z]/.test(password), // uppercase
      /\d/.test(password),    // digits
      /[!@#$%^&*(),.?":{}|<>]/.test(password) // special chars
    ];
    
    const score = checks.filter(Boolean).length;
    
    if (score < SECURITY_CONFIG.VALIDATION.PASSWORD_COMPLEXITY_SCORE) {
      return { 
        valid: false, 
        error: 'Password must contain uppercase, lowercase, numbers, and special characters',
        strength: score <= 1 ? 'weak' : 'fair'
      };
    }
    
    const strength = score === 4 ? 'strong' : 'good';
    return { valid: true, strength };
  }
  
  /**
   * Sanitize input to prevent XSS
   */
  static sanitizeInput(input: string): string {
    if (typeof input !== 'string') return '';
    
    return input
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;')
      .trim();
  }
  
  /**
   * Detect potential injection attempts
   */
  static async detectInjection(
    input: string,
    context: { userId?: string; sessionId?: string } = {}
  ): Promise<boolean> {
    const injectionResult = threatDetector.detectInjectionAttempt(input);
    
    if (injectionResult.isInjection) {
      await dispatchEnhancedSecurityEvent(
        SecurityEvent.SUSPICIOUS_ACTIVITY,
        {
          type: 'injection_attempt',
          injectionType: injectionResult.type,
          confidence: injectionResult.confidence,
          input: input.substring(0, 50) + '...' // Truncate for logging
        },
        context
      );
      
      // Create critical alert
      await securityAlerts.createAlert(
        AlertType.CRITICAL_THREAT,
        {
          source: 'input_validation',
          affectedUser: context.userId,
          riskScore: injectionResult.confidence,
        }
      );
      
      return true;
    }
    
    return false;
  }
}

/**
 * Enhanced Rate Limiter with Security Integration
 */
export class EnhancedRateLimiter {
  private attempts = new Map<string, number[]>();
  private readonly window: number;
  
  constructor(windowMs: number = 15 * 60 * 1000) {
    this.window = windowMs;
  }
  
  /**
   * Track attempt with security logging
   */
  async trackAttempt(
    key: string,
    context: { userId?: string; sessionId?: string } = {}
  ): Promise<void> {
    const now = Date.now();
    let attempts = this.attempts.get(key) || [];
    
    // Remove old attempts outside the window
    attempts = attempts.filter(time => now - time < this.window);
    
    // Add current attempt
    attempts.push(now);
    this.attempts.set(key, attempts);
    
    // Check for rate limiting
    const maxAttempts = SECURITY_CONFIG.VALIDATION.MAX_LOGIN_ATTEMPTS;
    if (attempts.length >= maxAttempts) {
      await dispatchEnhancedSecurityEvent(
        SecurityEvent.RATE_LIMIT_EXCEEDED,
        {
          key,
          attempts: attempts.length,
          maxAttempts,
          timeWindow: this.window
        },
        context
      );
      
      // Check for brute force
      await threatDetector.detectBruteForce(key, this.window);
      
      // Create security alert
      await securityAlerts.createAlert(
        AlertType.BRUTE_FORCE,
        {
          source: 'rate_limiter',
          affectedUser: context.userId,
          riskScore: Math.min(attempts.length / maxAttempts, 1.0),
        }
      );
    }
  }
  
  /**
   * Check if key is rate limited
   */
  isRateLimited(key: string, maxAttempts: number, windowMs?: number): boolean {
    const window = windowMs || this.window;
    const now = Date.now();
    const attempts = this.attempts.get(key) || [];
    
    // Remove old attempts
    const recentAttempts = attempts.filter(time => now - time < window);
    this.attempts.set(key, recentAttempts);
    
    return recentAttempts.length >= maxAttempts;
  }
  
  /**
   * Get remaining attempts
   */
  getRemainingAttempts(key: string, maxAttempts: number): number {
    const attempts = this.attempts.get(key) || [];
    const now = Date.now();
    const recentAttempts = attempts.filter(time => now - time < this.window);
    
    return Math.max(0, maxAttempts - recentAttempts.length);
  }
  
  /**
   * Reset attempts for key
   */
  reset(key: string): void {
    this.attempts.delete(key);
  }
}

/**
 * Helper functions
 */
function getSeverityForEvent(event: SecurityEvent): SecuritySeverity {
  const severityMap: Partial<Record<SecurityEvent, SecuritySeverity>> = {
    [SecurityEvent.LOGIN_SUCCESS]: SecuritySeverity.INFO,
    [SecurityEvent.LOGIN_FAILURE]: SecuritySeverity.LOW,
    [SecurityEvent.LOGOUT]: SecuritySeverity.INFO,
    [SecurityEvent.TOKEN_REFRESH]: SecuritySeverity.INFO,
    [SecurityEvent.TOKEN_EXPIRED]: SecuritySeverity.MEDIUM,
    [SecurityEvent.SESSION_EXPIRED]: SecuritySeverity.MEDIUM,
    [SecurityEvent.INVALID_TOKEN]: SecuritySeverity.HIGH,
    [SecurityEvent.RATE_LIMIT_EXCEEDED]: SecuritySeverity.HIGH,
    [SecurityEvent.SUSPICIOUS_ACTIVITY]: SecuritySeverity.HIGH,
    [SecurityEvent.PASSWORD_CHANGE]: SecuritySeverity.MEDIUM,
  };
  
  return severityMap[event] || SecuritySeverity.INFO;
}

function getAlertTypeForThreat(threat: any): AlertType {
  if (threat.anomalyTypes.includes('brute_force')) {
    return AlertType.BRUTE_FORCE;
  }
  if (threat.anomalyTypes.includes('injection')) {
    return AlertType.CRITICAL_THREAT;
  }
  if (threat.anomalyTypes.includes('session_hijack')) {
    return AlertType.SESSION_HIJACK;
  }
  
  return AlertType.SUSPICIOUS_ACTIVITY;
}

function shouldAudit(event: SecurityEvent): boolean {
  const auditableEvents = [
    SecurityEvent.LOGIN_SUCCESS,
    SecurityEvent.LOGIN_FAILURE,
    SecurityEvent.LOGOUT,
    SecurityEvent.PASSWORD_CHANGE,
    SecurityEvent.SUSPICIOUS_ACTIVITY,
    SecurityEvent.SESSION_EXPIRED,
  ];
  
  return auditableEvents.includes(event);
}

function getAuditCategoryForEvent(event: SecurityEvent): AuditCategory {
  const categoryMap: Partial<Record<SecurityEvent, AuditCategory>> = {
    [SecurityEvent.LOGIN_SUCCESS]: AuditCategory.AUTHENTICATION,
    [SecurityEvent.LOGIN_FAILURE]: AuditCategory.AUTHENTICATION,
    [SecurityEvent.LOGOUT]: AuditCategory.AUTHENTICATION,
    [SecurityEvent.PASSWORD_CHANGE]: AuditCategory.AUTHENTICATION,
    [SecurityEvent.SUSPICIOUS_ACTIVITY]: AuditCategory.SECURITY_EVENT,
    [SecurityEvent.SESSION_EXPIRED]: AuditCategory.AUTHENTICATION,
  };
  
  return categoryMap[event] || AuditCategory.SYSTEM_ACTION;
}

function getResultForEvent(event: SecurityEvent): 'success' | 'failure' | 'partial' {
  const failureEvents = [
    SecurityEvent.LOGIN_FAILURE,
    SecurityEvent.INVALID_TOKEN,
    SecurityEvent.SUSPICIOUS_ACTIVITY,
  ];
  
  return failureEvents.includes(event) ? 'failure' : 'success';
}

function getRiskLevelForEvent(event: SecurityEvent): 'low' | 'medium' | 'high' | 'critical' {
  const riskMap: Partial<Record<SecurityEvent, 'low' | 'medium' | 'high' | 'critical'>> = {
    [SecurityEvent.LOGIN_SUCCESS]: 'low',
    [SecurityEvent.LOGIN_FAILURE]: 'medium',
    [SecurityEvent.LOGOUT]: 'low',
    [SecurityEvent.TOKEN_REFRESH]: 'low',
    [SecurityEvent.TOKEN_EXPIRED]: 'medium',
    [SecurityEvent.SESSION_EXPIRED]: 'medium',
    [SecurityEvent.INVALID_TOKEN]: 'high',
    [SecurityEvent.RATE_LIMIT_EXCEEDED]: 'high',
    [SecurityEvent.SUSPICIOUS_ACTIVITY]: 'critical',
    [SecurityEvent.PASSWORD_CHANGE]: 'medium',
  };
  
  return riskMap[event] || 'low';
}

// Global instances
export const enhancedRateLimiter = new EnhancedRateLimiter();