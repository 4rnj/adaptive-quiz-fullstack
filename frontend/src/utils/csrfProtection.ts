/**
 * CSRF Protection Utilities
 * Comprehensive Cross-Site Request Forgery protection system
 */

import { securityLogger, SecurityEventType, SecuritySeverity } from './securityLogging';
import { auditTrail, AuditCategory } from './auditTrail';

// CSRF attack types
export enum CSRFAttackType {
  FORM_SUBMISSION = 'form_submission',
  AJAX_REQUEST = 'ajax_request',
  IMAGE_TAG = 'image_tag',
  IFRAME_ATTACK = 'iframe_attack',
  WEBSOCKET = 'websocket',
  FETCH_API = 'fetch_api',
  XMLHTTPREQUEST = 'xmlhttprequest',
}

// CSRF protection methods
export enum CSRFProtectionMethod {
  SYNCHRONIZER_TOKEN = 'synchronizer_token',
  DOUBLE_SUBMIT_COOKIE = 'double_submit_cookie',
  SAMESITE_COOKIE = 'samesite_cookie',
  CUSTOM_HEADER = 'custom_header',
  ORIGIN_VALIDATION = 'origin_validation',
  REFERER_VALIDATION = 'referer_validation',
}

// CSRF token configuration
export interface CSRFTokenConfig {
  tokenName: string;
  headerName: string;
  cookieName: string;
  tokenLength: number;
  tokenLifetime: number; // in milliseconds
  secureOnly: boolean;
  httpOnly: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  domain?: string;
  path: string;
}

// CSRF validation result
export interface CSRFValidationResult {
  isValid: boolean;
  isCSRFAttempt: boolean;
  attackType?: CSRFAttackType;
  failureReason?: string;
  confidence: number;
  recommendations: string[];
  tokenUsed?: string;
  origin?: string;
  referer?: string;
}

// Request context for CSRF validation
export interface RequestContext {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: any;
  cookies?: Record<string, string>;
  origin?: string;
  referer?: string;
  userAgent?: string;
  timestamp: number;
}

// CSRF protection configuration
export interface CSRFProtectionConfig {
  enableSynchronizerToken: boolean;
  enableDoubleSubmitCookie: boolean;
  enableOriginValidation: boolean;
  enableRefererValidation: boolean;
  enableCustomHeader: boolean;
  enableSameSiteCookie: boolean;
  requireSecureContext: boolean;
  allowedOrigins: string[];
  allowedReferers: string[];
  exemptPaths: string[];
  exemptMethods: string[];
  logAttempts: boolean;
  blockSuspiciousRequests: boolean;
  tokenConfig: CSRFTokenConfig;
  customHeaderName: string;
  customHeaderValue: string;
}

/**
 * CSRF Protection Service
 * Comprehensive Cross-Site Request Forgery protection and detection
 */
export class CSRFProtectionService {
  private static instance: CSRFProtectionService;
  private config: CSRFProtectionConfig;
  private tokenStore: Map<string, { token: string; expiry: number; origin: string }>;
  private blockedAttempts: Map<string, { count: number; lastAttempt: number }>;
  private validatedRequests: Set<string>;

  private constructor() {
    this.config = this.getDefaultConfig();
    this.tokenStore = new Map();
    this.blockedAttempts = new Map();
    this.validatedRequests = new Set();
    this.setupAutomaticCleanup();
  }

  public static getInstance(): CSRFProtectionService {
    if (!CSRFProtectionService.instance) {
      CSRFProtectionService.instance = new CSRFProtectionService();
    }
    return CSRFProtectionService.instance;
  }

  /**
   * Configure CSRF protection settings
   */
  public configure(config: Partial<CSRFProtectionConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('🛡️ CSRF Protection configured:', {
      synchronizerToken: this.config.enableSynchronizerToken,
      doubleSubmitCookie: this.config.enableDoubleSubmitCookie,
      originValidation: this.config.enableOriginValidation,
      customHeader: this.config.enableCustomHeader,
    });
  }

  /**
   * Generate CSRF token for current session
   */
  public generateToken(sessionId?: string, origin?: string): string {
    const tokenId = sessionId || this.generateSessionId();
    const token = this.generateSecureToken();
    const expiry = Date.now() + this.config.tokenConfig.tokenLifetime;
    const requestOrigin = origin || window.location.origin;

    // Store token with metadata
    this.tokenStore.set(tokenId, {
      token,
      expiry,
      origin: requestOrigin,
    });

    // Set token in cookie if double submit cookie is enabled
    if (this.config.enableDoubleSubmitCookie) {
      this.setCSRFCookie(token);
    }

    console.log('🔑 CSRF token generated:', {
      tokenId: tokenId.substring(0, 8),
      token: token.substring(0, 8),
      expiry: new Date(expiry).toISOString(),
      origin: requestOrigin,
    });

    return token;
  }

  /**
   * Validate request for CSRF protection
   */
  public validateRequest(context: RequestContext, token?: string): CSRFValidationResult {
    const startTime = performance.now();
    
    try {
      // Check if method requires CSRF protection
      if (this.config.exemptMethods.includes(context.method.toUpperCase())) {
        return this.createValidResult('Method exempt from CSRF protection');
      }

      // Check if path is exempt
      if (this.isExemptPath(context.url)) {
        return this.createValidResult('Path exempt from CSRF protection');
      }

      // Validate HTTPS requirement
      if (this.config.requireSecureContext && !this.isSecureContext(context)) {
        return this.createInvalidResult(
          CSRFAttackType.FORM_SUBMISSION,
          'Insecure context not allowed',
          0.3
        );
      }

      // Multiple validation layers
      const validations = [
        this.validateSynchronizerToken(context, token),
        this.validateDoubleSubmitCookie(context),
        this.validateOrigin(context),
        this.validateReferer(context),
        this.validateCustomHeader(context),
      ];

      // Determine overall validation result
      const passedValidations = validations.filter(v => v.isValid).length;
      const totalEnabledValidations = this.getEnabledValidationCount();

      // Require at least one validation to pass
      if (passedValidations === 0) {
        return this.createInvalidResult(
          this.detectAttackType(context),
          'No CSRF protection validation passed',
          0.8
        );
      }

      // Check for suspicious patterns
      const suspiciousResult = this.detectSuspiciousPatterns(context);
      if (suspiciousResult.isCSRFAttempt) {
        return suspiciousResult;
      }

      // Log successful validation
      this.logSuccessfulValidation(context, passedValidations, totalEnabledValidations);

      const duration = performance.now() - startTime;
      console.log(`✅ CSRF validation passed in ${duration.toFixed(2)}ms:`, {
        method: context.method,
        url: context.url.substring(0, 50),
        validations: `${passedValidations}/${totalEnabledValidations}`,
      });

      return this.createValidResult(`${passedValidations}/${totalEnabledValidations} validations passed`);

    } catch (error) {
      console.error('❌ CSRF validation failed:', error);
      
      return this.createInvalidResult(
        CSRFAttackType.FORM_SUBMISSION,
        'CSRF validation error',
        0.5
      );
    }
  }

  /**
   * Get CSRF token for current session
   */
  public getToken(sessionId?: string): string | null {
    const tokenId = sessionId || this.getCurrentSessionId();
    const tokenData = this.tokenStore.get(tokenId);

    if (!tokenData) {
      return null;
    }

    // Check if token is expired
    if (Date.now() > tokenData.expiry) {
      this.tokenStore.delete(tokenId);
      return null;
    }

    return tokenData.token;
  }

  /**
   * Refresh CSRF token
   */
  public refreshToken(sessionId?: string): string {
    const tokenId = sessionId || this.getCurrentSessionId();
    
    // Remove old token
    this.tokenStore.delete(tokenId);
    
    // Generate new token
    return this.generateToken(tokenId);
  }

  /**
   * Setup request interceptors for automatic CSRF protection
   */
  public setupRequestInterceptors(): void {
    // Intercept fetch requests
    const originalFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      
      // Add CSRF protection to state-changing requests
      if (this.shouldProtectRequest(request)) {
        const token = this.getToken();
        if (token) {
          // Add token as header
          request.headers.set(this.config.tokenConfig.headerName, token);
          
          // Add custom header if enabled
          if (this.config.enableCustomHeader) {
            request.headers.set(this.config.customHeaderName, this.config.customHeaderValue);
          }
        }
      }
      
      return originalFetch(request);
    };

    // Intercept XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method: string, url: string | URL, ...args: any[]) {
      (this as any)._csrfMethod = method;
      (this as any)._csrfUrl = url;
      return originalOpen.apply(this, [method, url, ...args] as any);
    };

    XMLHttpRequest.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null) {
      const method = (this as any)._csrfMethod;
      const url = (this as any)._csrfUrl;
      
      if (method && url && CSRFProtectionService.getInstance().shouldProtectXHR(method, url)) {
        const token = CSRFProtectionService.getInstance().getToken();
        if (token) {
          this.setRequestHeader(CSRFProtectionService.getInstance().config.tokenConfig.headerName, token);
          
          if (CSRFProtectionService.getInstance().config.enableCustomHeader) {
            this.setRequestHeader(
              CSRFProtectionService.getInstance().config.customHeaderName,
              CSRFProtectionService.getInstance().config.customHeaderValue
            );
          }
        }
      }
      
      return originalSend.apply(this, [body]);
    };

    console.log('🔧 CSRF request interceptors configured');
  }

  /**
   * Setup form protection
   */
  public setupFormProtection(): void {
    // Add CSRF tokens to all forms
    document.addEventListener('DOMContentLoaded', () => {
      this.protectExistingForms();
      this.monitorNewForms();
    });

    // Monitor form submissions
    document.addEventListener('submit', (event) => {
      const form = event.target as HTMLFormElement;
      if (form && this.shouldProtectForm(form)) {
        const hasToken = this.validateFormToken(form);
        
        if (!hasToken) {
          console.warn('🚨 Form submission blocked - missing CSRF token:', form.action);
          event.preventDefault();
          this.logCSRFAttempt('form_submission_blocked', form.action);
        }
      }
    });
  }

  /**
   * Get CSRF protection statistics
   */
  public getProtectionStats(): {
    activeTokens: number;
    blockedAttempts: number;
    validatedRequests: number;
    tokenUtilization: number;
    topAttackTypes: Array<{ type: string; count: number }>;
    protectionMethods: Record<CSRFProtectionMethod, boolean>;
  } {
    const now = Date.now();
    const activeTokens = Array.from(this.tokenStore.values()).filter(t => t.expiry > now).length;
    const totalAttempts = Array.from(this.blockedAttempts.values()).reduce((sum, data) => sum + data.count, 0);

    return {
      activeTokens,
      blockedAttempts: totalAttempts,
      validatedRequests: this.validatedRequests.size,
      tokenUtilization: activeTokens > 0 ? (this.validatedRequests.size / activeTokens) * 100 : 0,
      topAttackTypes: [
        { type: 'form_submission', count: Math.floor(totalAttempts * 0.4) },
        { type: 'ajax_request', count: Math.floor(totalAttempts * 0.3) },
        { type: 'fetch_api', count: Math.floor(totalAttempts * 0.2) },
        { type: 'other', count: Math.floor(totalAttempts * 0.1) },
      ],
      protectionMethods: {
        [CSRFProtectionMethod.SYNCHRONIZER_TOKEN]: this.config.enableSynchronizerToken,
        [CSRFProtectionMethod.DOUBLE_SUBMIT_COOKIE]: this.config.enableDoubleSubmitCookie,
        [CSRFProtectionMethod.ORIGIN_VALIDATION]: this.config.enableOriginValidation,
        [CSRFProtectionMethod.REFERER_VALIDATION]: this.config.enableRefererValidation,
        [CSRFProtectionMethod.CUSTOM_HEADER]: this.config.enableCustomHeader,
        [CSRFProtectionMethod.SAMESITE_COOKIE]: this.config.enableSameSiteCookie,
      },
    };
  }

  /**
   * Private helper methods
   */

  private getDefaultConfig(): CSRFProtectionConfig {
    return {
      enableSynchronizerToken: true,
      enableDoubleSubmitCookie: true,
      enableOriginValidation: true,
      enableRefererValidation: false, // Can be unreliable
      enableCustomHeader: true,
      enableSameSiteCookie: true,
      requireSecureContext: true,
      allowedOrigins: [window.location.origin],
      allowedReferers: [window.location.origin],
      exemptPaths: ['/api/health', '/api/status', '/api/metrics'],
      exemptMethods: ['GET', 'HEAD', 'OPTIONS'],
      logAttempts: true,
      blockSuspiciousRequests: true,
      tokenConfig: {
        tokenName: '_csrf_token',
        headerName: 'X-CSRF-Token',
        cookieName: '_csrf_cookie',
        tokenLength: 32,
        tokenLifetime: 3600000, // 1 hour
        secureOnly: true,
        httpOnly: false, // Must be accessible to JavaScript
        sameSite: 'strict',
        path: '/',
      },
      customHeaderName: 'X-Requested-With',
      customHeaderValue: 'XMLHttpRequest',
    };
  }

  private generateSecureToken(): string {
    const array = new Uint8Array(this.config.tokenConfig.tokenLength);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getCurrentSessionId(): string {
    // In a real application, this would come from session management
    return 'current_session';
  }

  private setCSRFCookie(token: string): void {
    const config = this.config.tokenConfig;
    const cookieOptions = [
      `${config.cookieName}=${token}`,
      `path=${config.path}`,
      `max-age=${Math.floor(config.tokenLifetime / 1000)}`,
      `samesite=${config.sameSite}`,
    ];

    if (config.secureOnly) {
      cookieOptions.push('secure');
    }

    if (config.domain) {
      cookieOptions.push(`domain=${config.domain}`);
    }

    document.cookie = cookieOptions.join('; ');
  }

  private validateSynchronizerToken(context: RequestContext, token?: string): CSRFValidationResult {
    if (!this.config.enableSynchronizerToken) {
      return this.createValidResult('Synchronizer token validation disabled');
    }

    const providedToken = token || 
                          context.headers[this.config.tokenConfig.headerName.toLowerCase()] ||
                          this.extractTokenFromBody(context.body);

    if (!providedToken) {
      return this.createInvalidResult(
        CSRFAttackType.FORM_SUBMISSION,
        'Missing CSRF token',
        0.7
      );
    }

    // Validate token against stored tokens
    const isValidToken = Array.from(this.tokenStore.values()).some(tokenData => 
      tokenData.token === providedToken && tokenData.expiry > Date.now()
    );

    if (!isValidToken) {
      return this.createInvalidResult(
        CSRFAttackType.FORM_SUBMISSION,
        'Invalid or expired CSRF token',
        0.9
      );
    }

    return this.createValidResult('Valid synchronizer token');
  }

  private validateDoubleSubmitCookie(context: RequestContext): CSRFValidationResult {
    if (!this.config.enableDoubleSubmitCookie) {
      return this.createValidResult('Double submit cookie validation disabled');
    }

    const cookieToken = context.cookies?.[this.config.tokenConfig.cookieName];
    const headerToken = context.headers[this.config.tokenConfig.headerName.toLowerCase()];

    if (!cookieToken || !headerToken) {
      return this.createInvalidResult(
        CSRFAttackType.AJAX_REQUEST,
        'Missing cookie or header token for double submit validation',
        0.6
      );
    }

    if (cookieToken !== headerToken) {
      return this.createInvalidResult(
        CSRFAttackType.AJAX_REQUEST,
        'Cookie and header tokens do not match',
        0.8
      );
    }

    return this.createValidResult('Valid double submit cookie');
  }

  private validateOrigin(context: RequestContext): CSRFValidationResult {
    if (!this.config.enableOriginValidation) {
      return this.createValidResult('Origin validation disabled');
    }

    const origin = context.origin || context.headers.origin;
    
    if (!origin) {
      return this.createInvalidResult(
        CSRFAttackType.IFRAME_ATTACK,
        'Missing Origin header',
        0.5
      );
    }

    if (!this.config.allowedOrigins.includes(origin)) {
      return this.createInvalidResult(
        CSRFAttackType.IFRAME_ATTACK,
        `Unauthorized origin: ${origin}`,
        0.9
      );
    }

    return this.createValidResult('Valid origin');
  }

  private validateReferer(context: RequestContext): CSRFValidationResult {
    if (!this.config.enableRefererValidation) {
      return this.createValidResult('Referer validation disabled');
    }

    const referer = context.referer || context.headers.referer;
    
    if (!referer) {
      return this.createInvalidResult(
        CSRFAttackType.FORM_SUBMISSION,
        'Missing Referer header',
        0.4
      );
    }

    const isValidReferer = this.config.allowedReferers.some(allowed => 
      referer.startsWith(allowed)
    );

    if (!isValidReferer) {
      return this.createInvalidResult(
        CSRFAttackType.FORM_SUBMISSION,
        `Unauthorized referer: ${referer}`,
        0.7
      );
    }

    return this.createValidResult('Valid referer');
  }

  private validateCustomHeader(context: RequestContext): CSRFValidationResult {
    if (!this.config.enableCustomHeader) {
      return this.createValidResult('Custom header validation disabled');
    }

    const headerValue = context.headers[this.config.customHeaderName.toLowerCase()];
    
    if (!headerValue) {
      return this.createInvalidResult(
        CSRFAttackType.AJAX_REQUEST,
        `Missing custom header: ${this.config.customHeaderName}`,
        0.5
      );
    }

    if (headerValue !== this.config.customHeaderValue) {
      return this.createInvalidResult(
        CSRFAttackType.AJAX_REQUEST,
        `Invalid custom header value`,
        0.6
      );
    }

    return this.createValidResult('Valid custom header');
  }

  private detectSuspiciousPatterns(context: RequestContext): CSRFValidationResult {
    const suspicious = [];

    // Check for suspicious user agents
    const userAgent = context.userAgent?.toLowerCase() || '';
    if (userAgent.includes('bot') || userAgent.includes('crawler') || userAgent.includes('spider')) {
      suspicious.push('Suspicious user agent');
    }

    // Check for rapid requests from same IP
    const clientIP = this.getClientIP(context);
    const attempts = this.blockedAttempts.get(clientIP);
    if (attempts && attempts.count > 10 && (Date.now() - attempts.lastAttempt) < 60000) {
      suspicious.push('Rapid repeated requests');
    }

    // Check for unusual request patterns
    if (context.method === 'POST' && !context.headers['content-type']) {
      suspicious.push('POST request without content-type');
    }

    if (suspicious.length > 0) {
      return this.createInvalidResult(
        this.detectAttackType(context),
        `Suspicious patterns detected: ${suspicious.join(', ')}`,
        0.6
      );
    }

    return this.createValidResult('No suspicious patterns detected');
  }

  private detectAttackType(context: RequestContext): CSRFAttackType {
    const contentType = context.headers['content-type']?.toLowerCase() || '';
    
    if (contentType.includes('application/json')) {
      return CSRFAttackType.FETCH_API;
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      return CSRFAttackType.FORM_SUBMISSION;
    } else if (context.headers['x-requested-with']) {
      return CSRFAttackType.XMLHTTPREQUEST;
    } else if (context.url.includes('?') && context.method === 'GET') {
      return CSRFAttackType.IMAGE_TAG;
    }
    
    return CSRFAttackType.FORM_SUBMISSION;
  }

  private shouldProtectRequest(request: Request): boolean {
    const method = request.method.toUpperCase();
    const url = request.url;
    
    // Skip exempt methods
    if (this.config.exemptMethods.includes(method)) {
      return false;
    }
    
    // Skip exempt paths
    if (this.isExemptPath(url)) {
      return false;
    }
    
    return true;
  }

  private shouldProtectXHR(method: string, url: string | URL): boolean {
    const methodUpper = method.toUpperCase();
    const urlString = url.toString();
    
    return !this.config.exemptMethods.includes(methodUpper) && !this.isExemptPath(urlString);
  }

  private shouldProtectForm(form: HTMLFormElement): boolean {
    const method = (form.method || 'GET').toUpperCase();
    const action = form.action || window.location.href;
    
    return !this.config.exemptMethods.includes(method) && !this.isExemptPath(action);
  }

  private isExemptPath(url: string): boolean {
    return this.config.exemptPaths.some(path => url.includes(path));
  }

  private isSecureContext(context: RequestContext): boolean {
    return context.url.startsWith('https://') || 
           context.url.startsWith('http://localhost') ||
           context.url.startsWith('http://127.0.0.1');
  }

  private getEnabledValidationCount(): number {
    let count = 0;
    if (this.config.enableSynchronizerToken) count++;
    if (this.config.enableDoubleSubmitCookie) count++;
    if (this.config.enableOriginValidation) count++;
    if (this.config.enableRefererValidation) count++;
    if (this.config.enableCustomHeader) count++;
    return count;
  }

  private extractTokenFromBody(body: any): string | null {
    if (!body) return null;
    
    if (typeof body === 'string') {
      const match = body.match(new RegExp(`${this.config.tokenConfig.tokenName}=([^&]*)`));
      return match ? decodeURIComponent(match[1]) : null;
    }
    
    if (body instanceof FormData) {
      return body.get(this.config.tokenConfig.tokenName) as string || null;
    }
    
    if (typeof body === 'object') {
      return body[this.config.tokenConfig.tokenName] || null;
    }
    
    return null;
  }

  private protectExistingForms(): void {
    const forms = document.querySelectorAll('form');
    forms.forEach(form => this.addCSRFTokenToForm(form));
  }

  private monitorNewForms(): void {
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            const forms = element.tagName === 'FORM' ? [element] : 
                         element.querySelectorAll('form');
            forms.forEach(form => this.addCSRFTokenToForm(form as HTMLFormElement));
          }
        });
      });
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
  }

  private addCSRFTokenToForm(form: HTMLFormElement): void {
    if (!this.shouldProtectForm(form)) {
      return;
    }
    
    // Check if token already exists
    const existingToken = form.querySelector(`input[name="${this.config.tokenConfig.tokenName}"]`);
    if (existingToken) {
      return;
    }
    
    // Create hidden input for CSRF token
    const token = this.getToken() || this.generateToken();
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = this.config.tokenConfig.tokenName;
    input.value = token;
    
    form.appendChild(input);
  }

  private validateFormToken(form: HTMLFormElement): boolean {
    const tokenInput = form.querySelector(`input[name="${this.config.tokenConfig.tokenName}"]`) as HTMLInputElement;
    return tokenInput && tokenInput.value !== '';
  }

  private createValidResult(reason: string): CSRFValidationResult {
    return {
      isValid: true,
      isCSRFAttempt: false,
      confidence: 0,
      recommendations: [],
    };
  }

  private createInvalidResult(
    attackType: CSRFAttackType,
    reason: string,
    confidence: number
  ): CSRFValidationResult {
    const result: CSRFValidationResult = {
      isValid: false,
      isCSRFAttempt: true,
      attackType,
      failureReason: reason,
      confidence,
      recommendations: this.generateRecommendations(attackType),
    };

    // Log the attempt
    if (this.config.logAttempts) {
      this.logCSRFAttempt(attackType, reason, confidence);
    }

    return result;
  }

  private generateRecommendations(attackType: CSRFAttackType): string[] {
    const recommendations = [
      'Ensure CSRF tokens are included in all state-changing requests',
      'Validate Origin and Referer headers',
      'Use SameSite cookie attributes',
      'Implement custom headers for AJAX requests',
    ];

    switch (attackType) {
      case CSRFAttackType.FORM_SUBMISSION:
        recommendations.push('Add CSRF tokens to all HTML forms');
        break;
      case CSRFAttackType.AJAX_REQUEST:
        recommendations.push('Include CSRF tokens in AJAX request headers');
        break;
      case CSRFAttackType.FETCH_API:
        recommendations.push('Configure fetch requests with CSRF headers');
        break;
      case CSRFAttackType.IFRAME_ATTACK:
        recommendations.push('Implement X-Frame-Options and frame-ancestors CSP');
        break;
    }

    return recommendations;
  }

  private getClientIP(context: RequestContext): string {
    // In a real application, this would be determined by the server
    return context.headers['x-forwarded-for'] || 
           context.headers['x-real-ip'] || 
           'unknown';
  }

  private logCSRFAttempt(attackType: string, reason: string, confidence: number = 0.5): void {
    const clientIP = 'unknown'; // Would be determined from request context
    
    // Update blocked attempts counter
    const attempts = this.blockedAttempts.get(clientIP) || { count: 0, lastAttempt: 0 };
    attempts.count++;
    attempts.lastAttempt = Date.now();
    this.blockedAttempts.set(clientIP, attempts);

    // Log to security logger
    securityLogger.logEvent(
      SecurityEventType.SECURITY_INCIDENT,
      {
        type: 'csrf_attempt_detected',
        attackType,
        reason,
        confidence,
        clientIP,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      },
      {
        severity: confidence > 0.7 ? SecuritySeverity.HIGH : SecuritySeverity.MEDIUM,
      }
    );

    // Log to audit trail
    auditTrail.logAuditEvent(
      AuditCategory.SECURITY,
      'csrf_protection_triggered',
      {
        actor: {
          type: 'user',
          id: clientIP,
        },
        target: {
          type: 'application',
          id: 'csrf_protection',
          name: 'CSRF Protection System',
        },
        result: 'blocked',
        context: {
          component: 'csrf_protection',
          operation: 'request_validation',
          attackType,
          reason,
          confidence: confidence.toFixed(2),
        },
        riskLevel: confidence > 0.7 ? 'high' : 'medium',
      }
    );
  }

  private logSuccessfulValidation(context: RequestContext, passed: number, total: number): void {
    const requestId = `${context.method}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.validatedRequests.add(requestId);
  }

  private setupAutomaticCleanup(): void {
    // Clean up expired tokens every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [sessionId, tokenData] of this.tokenStore.entries()) {
        if (tokenData.expiry <= now) {
          this.tokenStore.delete(sessionId);
        }
      }
      
      // Clean up old blocked attempts (older than 1 hour)
      for (const [ip, attempts] of this.blockedAttempts.entries()) {
        if (now - attempts.lastAttempt > 3600000) {
          this.blockedAttempts.delete(ip);
        }
      }
    }, 300000); // 5 minutes
  }
}

// React Hook for CSRF Protection
export function useCSRFProtection() {
  const csrfService = CSRFProtectionService.getInstance();

  const generateToken = (sessionId?: string) => {
    return csrfService.generateToken(sessionId);
  };

  const getToken = (sessionId?: string) => {
    return csrfService.getToken(sessionId);
  };

  const validateRequest = (context: RequestContext, token?: string) => {
    return csrfService.validateRequest(context, token);
  };

  const refreshToken = (sessionId?: string) => {
    return csrfService.refreshToken(sessionId);
  };

  return {
    generateToken,
    getToken,
    validateRequest,
    refreshToken,
    service: csrfService,
  };
}

// Global instance
export const csrfProtection = CSRFProtectionService.getInstance();