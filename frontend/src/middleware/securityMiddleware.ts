/**
 * Security Middleware
 * Comprehensive security middleware integrating all protection systems
 */

import { 
  securityHeaders, 
  SecurityLevel, 
  SecurityHeadersAssessment 
} from '../utils/securityHeaders';
import { 
  xssProtection, 
  XSSDetectionResult, 
  ContentType, 
  XSSThreatLevel 
} from '../utils/xssProtection';
import { 
  csrfProtection, 
  CSRFValidationResult, 
  RequestContext, 
  CSRFAttackType 
} from '../utils/csrfProtection';
import { securityLogger, SecurityEventType, SecuritySeverity } from '../utils/securityLogging';
import { auditTrail, AuditCategory } from '../utils/auditTrail';

// Security middleware configuration
export interface SecurityMiddlewareConfig {
  enableSecurityHeaders: boolean;
  enableXSSProtection: boolean;
  enableCSRFProtection: boolean;
  enableRequestValidation: boolean;
  enableResponseSanitization: boolean;
  enableSecurityMonitoring: boolean;
  blockHighRiskRequests: boolean;
  logSecurityEvents: boolean;
  strictMode: boolean;
  bypassPaths: string[];
  trustedOrigins: string[];
  maxRequestSize: number;
  rateLimitRequests: boolean;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

// Security assessment result
export interface SecurityAssessment {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  securityHeaders: SecurityHeadersAssessment;
  xssDetection: XSSDetectionResult | null;
  csrfValidation: CSRFValidationResult | null;
  recommendations: string[];
  blocked: boolean;
  bypassReason?: string;
}

// Request processing result
export interface RequestProcessingResult {
  allowed: boolean;
  headers: Record<string, string>;
  sanitizedBody?: any;
  securityAssessment: SecurityAssessment;
  processingTime: number;
}

// Rate limiting tracking
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

/**
 * Security Middleware Service
 * Comprehensive security middleware for request/response processing
 */
export class SecurityMiddlewareService {
  private static instance: SecurityMiddlewareService;
  private config: SecurityMiddlewareConfig;
  private rateLimitMap: Map<string, RateLimitEntry>;
  private processingStats: {
    totalRequests: number;
    blockedRequests: number;
    xssAttempts: number;
    csrfAttempts: number;
    averageProcessingTime: number;
  };

  private constructor() {
    this.config = this.getDefaultConfig();
    this.rateLimitMap = new Map();
    this.processingStats = {
      totalRequests: 0,
      blockedRequests: 0,
      xssAttempts: 0,
      csrfAttempts: 0,
      averageProcessingTime: 0,
    };
    this.setupCleanupTasks();
  }

  public static getInstance(): SecurityMiddlewareService {
    if (!SecurityMiddlewareService.instance) {
      SecurityMiddlewareService.instance = new SecurityMiddlewareService();
    }
    return SecurityMiddlewareService.instance;
  }

  /**
   * Configure security middleware
   */
  public configure(config: Partial<SecurityMiddlewareConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('🔧 Security middleware configured:', {
      headers: this.config.enableSecurityHeaders,
      xss: this.config.enableXSSProtection,
      csrf: this.config.enableCSRFProtection,
      monitoring: this.config.enableSecurityMonitoring,
      strictMode: this.config.strictMode,
    });
  }

  /**
   * Process incoming request with security checks
   */
  public async processRequest(
    url: string,
    method: string,
    headers: Record<string, string>,
    body?: any
  ): Promise<RequestProcessingResult> {
    const startTime = performance.now();
    this.processingStats.totalRequests++;

    try {
      // Check if path is bypassed
      const bypassReason = this.checkBypass(url, method);
      if (bypassReason) {
        return this.createBypassResult(bypassReason, startTime);
      }

      // Rate limiting check
      if (this.config.rateLimitRequests) {
        const rateLimitResult = this.checkRateLimit(this.getClientIP(headers));
        if (!rateLimitResult.allowed) {
          return this.createBlockedResult(
            'Rate limit exceeded',
            startTime,
            'high',
            { rateLimitExceeded: true }
          );
        }
      }

      // Request size validation
      if (this.config.maxRequestSize > 0) {
        const requestSize = this.calculateRequestSize(body);
        if (requestSize > this.config.maxRequestSize) {
          return this.createBlockedResult(
            'Request size exceeds limit',
            startTime,
            'medium',
            { oversizedRequest: true }
          );
        }
      }

      // Create request context
      const requestContext: RequestContext = {
        method,
        url,
        headers: this.normalizeHeaders(headers),
        body,
        origin: headers.origin || headers.Origin,
        referer: headers.referer || headers.Referer,
        userAgent: headers['user-agent'] || headers['User-Agent'],
        timestamp: Date.now(),
      };

      // Security assessments
      const securityAssessment = await this.performSecurityAssessment(requestContext);

      // Determine if request should be blocked
      const shouldBlock = this.shouldBlockRequest(securityAssessment);

      if (shouldBlock) {
        this.processingStats.blockedRequests++;
        await this.logSecurityEvent('request_blocked', securityAssessment);
        
        return this.createBlockedResult(
          'Security threat detected',
          startTime,
          securityAssessment.overallRisk,
          securityAssessment
        );
      }

      // Generate security headers
      const responseHeaders = this.generateResponseHeaders(requestContext);

      // Sanitize request body if needed
      const sanitizedBody = this.sanitizeRequestBody(body, requestContext);

      const processingTime = performance.now() - startTime;
      this.updateProcessingStats(processingTime);

      return {
        allowed: true,
        headers: responseHeaders,
        sanitizedBody,
        securityAssessment,
        processingTime,
      };

    } catch (error) {
      console.error('❌ Security middleware processing failed:', error);
      
      // Fail securely - block on error if in strict mode
      if (this.config.strictMode) {
        return this.createBlockedResult(
          'Security processing error',
          startTime,
          'high',
          { error: error instanceof Error ? error.message : 'Unknown error' }
        );
      }

      // Otherwise allow with basic security headers
      return {
        allowed: true,
        headers: this.getBasicSecurityHeaders(),
        securityAssessment: this.createDefaultAssessment(),
        processingTime: performance.now() - startTime,
      };
    }
  }

  /**
   * Process outgoing response with security enhancements
   */
  public async processResponse(
    response: Response,
    requestContext: RequestContext
  ): Promise<Response> {
    try {
      if (!this.config.enableResponseSanitization) {
        return response;
      }

      // Clone response to avoid consuming the stream
      const responseClone = response.clone();
      
      // Get content type
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('text/html') || contentType.includes('application/json')) {
        const text = await responseClone.text();
        
        // Sanitize response content
        const sanitizedContent = this.sanitizeResponseContent(text, contentType);
        
        // Create new response with sanitized content
        const newResponse = new Response(sanitizedContent, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });

        // Add security headers
        const securityHeaders = this.generateResponseHeaders(requestContext);
        Object.entries(securityHeaders).forEach(([key, value]) => {
          newResponse.headers.set(key, value);
        });

        return newResponse;
      }

      return response;
    } catch (error) {
      console.error('❌ Response security processing failed:', error);
      return response;
    }
  }

  /**
   * Get middleware statistics
   */
  public getStats(): {
    processing: typeof this.processingStats;
    config: SecurityMiddlewareConfig;
    rateLimiting: {
      activeClients: number;
      totalRequests: number;
    };
    securityAssessments: {
      headers: any;
      xss: any;
      csrf: any;
    };
  } {
    return {
      processing: { ...this.processingStats },
      config: { ...this.config },
      rateLimiting: {
        activeClients: this.rateLimitMap.size,
        totalRequests: Array.from(this.rateLimitMap.values())
          .reduce((sum, entry) => sum + entry.count, 0),
      },
      securityAssessments: {
        headers: securityHeaders.getValidationStats ? securityHeaders.getValidationStats() : {},
        xss: xssProtection.getProtectionStats ? xssProtection.getProtectionStats() : {},
        csrf: csrfProtection.getProtectionStats ? csrfProtection.getProtectionStats() : {},
      },
    };
  }

  /**
   * Private helper methods
   */

  private getDefaultConfig(): SecurityMiddlewareConfig {
    return {
      enableSecurityHeaders: true,
      enableXSSProtection: true,
      enableCSRFProtection: true,
      enableRequestValidation: true,
      enableResponseSanitization: true,
      enableSecurityMonitoring: true,
      blockHighRiskRequests: true,
      logSecurityEvents: true,
      strictMode: false,
      bypassPaths: [
        '/health',
        '/status',
        '/metrics',
        '/favicon.ico',
        '/robots.txt',
        '/sitemap.xml',
      ],
      trustedOrigins: [window.location.origin],
      maxRequestSize: 10485760, // 10MB
      rateLimitRequests: true,
      rateLimitWindowMs: 900000, // 15 minutes
      rateLimitMaxRequests: 1000,
    };
  }

  private checkBypass(url: string, method: string): string | null {
    // Check bypass paths
    if (this.config.bypassPaths.some(path => url.includes(path))) {
      return `Path ${url} is in bypass list`;
    }

    // Safe methods that typically don't need full protection
    if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()) && 
        !url.includes('?') && !url.includes('#')) {
      return `Safe method ${method} for static resource`;
    }

    return null;
  }

  private checkRateLimit(clientIP: string): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const windowStart = now - this.config.rateLimitWindowMs;
    
    let entry = this.rateLimitMap.get(clientIP);
    
    if (!entry || entry.windowStart < windowStart) {
      // New window or expired entry
      entry = { count: 1, windowStart: now };
      this.rateLimitMap.set(clientIP, entry);
      return { allowed: true, remaining: this.config.rateLimitMaxRequests - 1 };
    }

    entry.count++;
    
    if (entry.count > this.config.rateLimitMaxRequests) {
      return { allowed: false, remaining: 0 };
    }

    return { 
      allowed: true, 
      remaining: this.config.rateLimitMaxRequests - entry.count 
    };
  }

  private async performSecurityAssessment(context: RequestContext): Promise<SecurityAssessment> {
    const assessments = await Promise.all([
      this.assessSecurityHeaders(context),
      this.assessXSSThreats(context),
      this.assessCSRFThreats(context),
    ]);

    const [headersAssessment, xssAssessment, csrfAssessment] = assessments;

    // Calculate overall risk score
    const riskFactors = [
      this.getRiskScore(headersAssessment),
      this.getRiskScore(xssAssessment),
      this.getRiskScore(csrfAssessment),
    ];

    const averageRisk = riskFactors.reduce((sum, risk) => sum + risk, 0) / riskFactors.length;
    const overallRisk = this.categorizeRisk(averageRisk);

    // Collect recommendations
    const recommendations = [
      ...this.getHeadersRecommendations(headersAssessment),
      ...this.getXSSRecommendations(xssAssessment),
      ...this.getCSRFRecommendations(csrfAssessment),
    ];

    return {
      overallRisk,
      riskScore: averageRisk,
      securityHeaders: headersAssessment,
      xssDetection: xssAssessment,
      csrfValidation: csrfAssessment,
      recommendations: Array.from(new Set(recommendations)), // Remove duplicates
      blocked: false,
    };
  }

  private async assessSecurityHeaders(context: RequestContext): Promise<SecurityHeadersAssessment> {
    if (!this.config.enableSecurityHeaders) {
      return { grade: 'A+', score: 100, issues: [], recommendations: [] };
    }

    try {
      return securityHeaders.validateSecurityHeaders(context.headers);
    } catch (error) {
      console.error('❌ Security headers assessment failed:', error);
      return { grade: 'F', score: 0, issues: ['Assessment failed'], recommendations: [] };
    }
  }

  private async assessXSSThreats(context: RequestContext): Promise<XSSDetectionResult | null> {
    if (!this.config.enableXSSProtection) {
      return null;
    }

    try {
      // Check URL for XSS
      const urlResult = xssProtection.detectXSS(context.url, ContentType.URL);
      if (urlResult.isXSS) {
        this.processingStats.xssAttempts++;
        return urlResult;
      }

      // Check headers for XSS
      for (const [header, value] of Object.entries(context.headers)) {
        if (typeof value === 'string') {
          const headerResult = xssProtection.detectXSS(value, ContentType.TEXT);
          if (headerResult.isXSS) {
            this.processingStats.xssAttempts++;
            return headerResult;
          }
        }
      }

      // Check body for XSS
      if (context.body) {
        const bodyContent = typeof context.body === 'string' ? 
                           context.body : 
                           JSON.stringify(context.body);
        const bodyResult = xssProtection.detectXSS(bodyContent, ContentType.HTML);
        if (bodyResult.isXSS) {
          this.processingStats.xssAttempts++;
          return bodyResult;
        }
      }

      return null;
    } catch (error) {
      console.error('❌ XSS threat assessment failed:', error);
      return null;
    }
  }

  private async assessCSRFThreats(context: RequestContext): Promise<CSRFValidationResult | null> {
    if (!this.config.enableCSRFProtection) {
      return null;
    }

    try {
      // Skip CSRF for safe methods
      if (['GET', 'HEAD', 'OPTIONS'].includes(context.method.toUpperCase())) {
        return null;
      }

      const validation = csrfProtection.validateRequest(context);
      if (validation.isCSRFAttempt) {
        this.processingStats.csrfAttempts++;
      }
      return validation;
    } catch (error) {
      console.error('❌ CSRF threat assessment failed:', error);
      return null;
    }
  }

  private shouldBlockRequest(assessment: SecurityAssessment): boolean {
    if (!this.config.blockHighRiskRequests) {
      return false;
    }

    // Block critical threats
    if (assessment.overallRisk === 'critical') {
      return true;
    }

    // Block high-risk XSS attempts
    if (assessment.xssDetection?.isXSS && 
        assessment.xssDetection.threatLevel === XSSThreatLevel.CRITICAL) {
      return true;
    }

    // Block CSRF attempts with high confidence
    if (assessment.csrfValidation?.isCSRFAttempt && 
        assessment.csrfValidation.confidence > 0.8) {
      return true;
    }

    // Block requests with very poor security headers in strict mode
    if (this.config.strictMode && 
        assessment.securityHeaders.grade === 'F' && 
        assessment.securityHeaders.score < 20) {
      return true;
    }

    return false;
  }

  private generateResponseHeaders(context: RequestContext): Record<string, string> {
    if (!this.config.enableSecurityHeaders) {
      return {};
    }

    try {
      return securityHeaders.applySecurityHeaders();
    } catch (error) {
      console.error('❌ Failed to generate security headers:', error);
      return this.getBasicSecurityHeaders();
    }
  }

  private getBasicSecurityHeaders(): Record<string, string> {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'self'",
    };
  }

  private sanitizeRequestBody(body: any, context: RequestContext): any {
    if (!body || !this.config.enableRequestValidation) {
      return body;
    }

    try {
      if (typeof body === 'string') {
        return xssProtection.sanitizeContent(body, ContentType.TEXT);
      } else if (typeof body === 'object') {
        return this.sanitizeObject(body);
      }
      return body;
    } catch (error) {
      console.error('❌ Request body sanitization failed:', error);
      return body;
    }
  }

  private sanitizeResponseContent(content: string, contentType: string): string {
    try {
      if (contentType.includes('text/html')) {
        return xssProtection.sanitizeContent(content, ContentType.HTML);
      } else if (contentType.includes('application/json')) {
        return xssProtection.sanitizeContent(content, ContentType.JSON);
      }
      return content;
    } catch (error) {
      console.error('❌ Response content sanitization failed:', error);
      return content;
    }
  }

  private sanitizeObject(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    } else if (typeof obj === 'object' && obj !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const sanitizedKey = xssProtection.sanitizeContent(key, ContentType.TEXT);
        sanitized[sanitizedKey] = this.sanitizeObject(value);
      }
      return sanitized;
    } else if (typeof obj === 'string') {
      return xssProtection.sanitizeContent(obj, ContentType.TEXT);
    }
    return obj;
  }

  private getRiskScore(assessment: any): number {
    if (!assessment) return 0;
    
    if (assessment.score !== undefined) {
      return (100 - assessment.score) / 100; // Convert score to risk (0-1)
    }
    
    if (assessment.confidence !== undefined) {
      return assessment.confidence;
    }
    
    if (assessment.isXSS || assessment.isCSRFAttempt) {
      return 0.8;
    }
    
    return 0;
  }

  private categorizeRisk(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 0.8) return 'critical';
    if (score >= 0.6) return 'high';
    if (score >= 0.3) return 'medium';
    return 'low';
  }

  private getHeadersRecommendations(assessment: SecurityHeadersAssessment): string[] {
    return assessment.recommendations || [];
  }

  private getXSSRecommendations(assessment: XSSDetectionResult | null): string[] {
    return assessment?.recommendations || [];
  }

  private getCSRFRecommendations(assessment: CSRFValidationResult | null): string[] {
    return assessment?.recommendations || [];
  }

  private createBypassResult(reason: string, startTime: number): RequestProcessingResult {
    return {
      allowed: true,
      headers: {},
      securityAssessment: {
        ...this.createDefaultAssessment(),
        bypassReason: reason,
      },
      processingTime: performance.now() - startTime,
    };
  }

  private createBlockedResult(
    reason: string,
    startTime: number,
    risk: 'low' | 'medium' | 'high' | 'critical',
    additionalData?: any
  ): RequestProcessingResult {
    return {
      allowed: false,
      headers: this.getBasicSecurityHeaders(),
      securityAssessment: {
        overallRisk: risk,
        riskScore: risk === 'critical' ? 1.0 : risk === 'high' ? 0.8 : risk === 'medium' ? 0.5 : 0.2,
        securityHeaders: { grade: 'F', score: 0, issues: [reason], recommendations: [] },
        xssDetection: null,
        csrfValidation: null,
        recommendations: [`Blocked: ${reason}`],
        blocked: true,
        ...additionalData,
      },
      processingTime: performance.now() - startTime,
    };
  }

  private createDefaultAssessment(): SecurityAssessment {
    return {
      overallRisk: 'low',
      riskScore: 0,
      securityHeaders: { grade: 'A+', score: 100, issues: [], recommendations: [] },
      xssDetection: null,
      csrfValidation: null,
      recommendations: [],
      blocked: false,
    };
  }

  private normalizeHeaders(headers: Record<string, string>): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      normalized[key.toLowerCase()] = value;
    }
    return normalized;
  }

  private getClientIP(headers: Record<string, string>): string {
    return headers['x-forwarded-for'] || 
           headers['x-real-ip'] || 
           headers['cf-connecting-ip'] || 
           'unknown';
  }

  private calculateRequestSize(body: any): number {
    if (!body) return 0;
    
    if (typeof body === 'string') {
      return new Blob([body]).size;
    } else if (body instanceof FormData) {
      // Approximate FormData size
      let size = 0;
      for (const [key, value] of body.entries()) {
        size += key.length;
        if (typeof value === 'string') {
          size += value.length;
        } else if (value instanceof File) {
          size += value.size;
        }
      }
      return size;
    } else {
      return new Blob([JSON.stringify(body)]).size;
    }
  }

  private async logSecurityEvent(eventType: string, assessment: SecurityAssessment): Promise<void> {
    if (!this.config.logSecurityEvents) {
      return;
    }

    try {
      await securityLogger.logEvent(
        SecurityEventType.SECURITY_INCIDENT,
        {
          type: eventType,
          overallRisk: assessment.overallRisk,
          riskScore: assessment.riskScore,
          blocked: assessment.blocked,
          xssDetected: assessment.xssDetection?.isXSS || false,
          csrfDetected: assessment.csrfValidation?.isCSRFAttempt || false,
          recommendations: assessment.recommendations.slice(0, 5), // Limit for logging
        },
        {
          severity: assessment.overallRisk === 'critical' ? SecuritySeverity.CRITICAL :
                   assessment.overallRisk === 'high' ? SecuritySeverity.HIGH :
                   assessment.overallRisk === 'medium' ? SecuritySeverity.MEDIUM :
                   SecuritySeverity.LOW,
        }
      );

      await auditTrail.logAuditEvent(
        AuditCategory.SECURITY,
        'security_middleware_assessment',
        {
          actor: {
            type: 'system',
            id: 'security_middleware',
          },
          target: {
            type: 'request',
            id: 'incoming_request',
            name: 'HTTP Request',
          },
          result: assessment.blocked ? 'blocked' : 'allowed',
          context: {
            component: 'security_middleware',
            operation: 'request_assessment',
            overallRisk: assessment.overallRisk,
            riskScore: assessment.riskScore.toFixed(2),
            eventType,
          },
          riskLevel: assessment.overallRisk,
        }
      );
    } catch (error) {
      console.error('❌ Failed to log security event:', error);
    }
  }

  private updateProcessingStats(processingTime: number): void {
    const currentAvg = this.processingStats.averageProcessingTime;
    const totalRequests = this.processingStats.totalRequests;
    
    this.processingStats.averageProcessingTime = 
      ((currentAvg * (totalRequests - 1)) + processingTime) / totalRequests;
  }

  private setupCleanupTasks(): void {
    // Clean up rate limiting data every 5 minutes
    setInterval(() => {
      const now = Date.now();
      const expiredThreshold = now - this.config.rateLimitWindowMs;
      
      for (const [clientIP, entry] of this.rateLimitMap.entries()) {
        if (entry.windowStart < expiredThreshold) {
          this.rateLimitMap.delete(clientIP);
        }
      }
    }, 300000); // 5 minutes
  }
}

// Express.js middleware function
export function createSecurityMiddleware(config?: Partial<SecurityMiddlewareConfig>) {
  const securityMiddleware = SecurityMiddlewareService.getInstance();
  
  if (config) {
    securityMiddleware.configure(config);
  }

  return async (req: any, res: any, next: any) => {
    try {
      const result = await securityMiddleware.processRequest(
        req.url || req.path,
        req.method,
        req.headers,
        req.body
      );

      // Add security headers to response
      Object.entries(result.headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });

      // Block request if not allowed
      if (!result.allowed) {
        res.status(403).json({
          error: 'Request blocked by security middleware',
          assessment: result.securityAssessment,
        });
        return;
      }

      // Add sanitized body if available
      if (result.sanitizedBody !== undefined) {
        req.body = result.sanitizedBody;
      }

      // Add security assessment to request object
      req.securityAssessment = result.securityAssessment;

      next();
    } catch (error) {
      console.error('❌ Security middleware error:', error);
      
      // Fail securely
      res.status(500).json({
        error: 'Security processing error',
      });
    }
  };
}

// Global instance
export const securityMiddleware = SecurityMiddlewareService.getInstance();