/**
 * Security Headers Configuration System
 * Comprehensive security headers implementation for web application protection
 */

import { securityLogger, SecurityEventType, SecuritySeverity } from './securityLogging';
import { auditTrail, AuditCategory } from './auditTrail';
import { securityAlerts, AlertType } from '../components/security/SecurityAlerts';

// Security header types
export enum SecurityHeaderType {
  CONTENT_SECURITY_POLICY = 'Content-Security-Policy',
  CONTENT_SECURITY_POLICY_REPORT_ONLY = 'Content-Security-Policy-Report-Only',
  STRICT_TRANSPORT_SECURITY = 'Strict-Transport-Security',
  X_FRAME_OPTIONS = 'X-Frame-Options',
  X_CONTENT_TYPE_OPTIONS = 'X-Content-Type-Options',
  X_XSS_PROTECTION = 'X-XSS-Protection',
  REFERRER_POLICY = 'Referrer-Policy',
  PERMISSIONS_POLICY = 'Permissions-Policy',
  CROSS_ORIGIN_EMBEDDER_POLICY = 'Cross-Origin-Embedder-Policy',
  CROSS_ORIGIN_OPENER_POLICY = 'Cross-Origin-Opener-Policy',
  CROSS_ORIGIN_RESOURCE_POLICY = 'Cross-Origin-Resource-Policy',
  EXPECT_CT = 'Expect-CT',
  CACHE_CONTROL = 'Cache-Control',
  PRAGMA = 'Pragma',
  X_PERMITTED_CROSS_DOMAIN_POLICIES = 'X-Permitted-Cross-Domain-Policies',
  X_ROBOTS_TAG = 'X-Robots-Tag',
  X_DOWNLOAD_OPTIONS = 'X-Download-Options',
  X_DNS_PREFETCH_CONTROL = 'X-DNS-Prefetch-Control',
}

// CSP directive types
export enum CSPDirective {
  DEFAULT_SRC = 'default-src',
  SCRIPT_SRC = 'script-src',
  STYLE_SRC = 'style-src',
  IMG_SRC = 'img-src',
  CONNECT_SRC = 'connect-src',
  FONT_SRC = 'font-src',
  OBJECT_SRC = 'object-src',
  MEDIA_SRC = 'media-src',
  FRAME_SRC = 'frame-src',
  CHILD_SRC = 'child-src',
  WORKER_SRC = 'worker-src',
  MANIFEST_SRC = 'manifest-src',
  BASE_URI = 'base-uri',
  FORM_ACTION = 'form-action',
  FRAME_ANCESTORS = 'frame-ancestors',
  PLUGIN_TYPES = 'plugin-types',
  SANDBOX = 'sandbox',
  UPGRADE_INSECURE_REQUESTS = 'upgrade-insecure-requests',
  BLOCK_ALL_MIXED_CONTENT = 'block-all-mixed-content',
  REQUIRE_SRI_FOR = 'require-sri-for',
  REQUIRE_TRUSTED_TYPES_FOR = 'require-trusted-types-for',
  TRUSTED_TYPES = 'trusted-types',
  REPORT_URI = 'report-uri',
  REPORT_TO = 'report-to',
}

// CSP source keywords
export enum CSPSource {
  SELF = "'self'",
  UNSAFE_INLINE = "'unsafe-inline'",
  UNSAFE_EVAL = "'unsafe-eval'",
  UNSAFE_HASHES = "'unsafe-hashes'",
  STRICT_DYNAMIC = "'strict-dynamic'",
  REPORT_SAMPLE = "'report-sample'",
  NONE = "'none'",
  WASM_UNSAFE_EVAL = "'wasm-unsafe-eval'",
}

// Security level presets
export enum SecurityLevel {
  STRICT = 'STRICT',
  MODERATE = 'MODERATE',
  RELAXED = 'RELAXED',
  DEVELOPMENT = 'DEVELOPMENT',
  CUSTOM = 'CUSTOM',
}

// Environment types
export enum Environment {
  DEVELOPMENT = 'DEVELOPMENT',
  STAGING = 'STAGING',
  PRODUCTION = 'PRODUCTION',
  TEST = 'TEST',
}

// Security header configuration
export interface SecurityHeaderConfig {
  enabled: boolean;
  value: string;
  reportOnly?: boolean;
  environments?: Environment[];
  description?: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
}

// CSP configuration
export interface CSPConfig {
  [CSPDirective.DEFAULT_SRC]?: string[];
  [CSPDirective.SCRIPT_SRC]?: string[];
  [CSPDirective.STYLE_SRC]?: string[];
  [CSPDirective.IMG_SRC]?: string[];
  [CSPDirective.CONNECT_SRC]?: string[];
  [CSPDirective.FONT_SRC]?: string[];
  [CSPDirective.OBJECT_SRC]?: string[];
  [CSPDirective.MEDIA_SRC]?: string[];
  [CSPDirective.FRAME_SRC]?: string[];
  [CSPDirective.CHILD_SRC]?: string[];
  [CSPDirective.WORKER_SRC]?: string[];
  [CSPDirective.MANIFEST_SRC]?: string[];
  [CSPDirective.BASE_URI]?: string[];
  [CSPDirective.FORM_ACTION]?: string[];
  [CSPDirective.FRAME_ANCESTORS]?: string[];
  [CSPDirective.PLUGIN_TYPES]?: string[];
  [CSPDirective.SANDBOX]?: string[];
  [CSPDirective.UPGRADE_INSECURE_REQUESTS]?: boolean;
  [CSPDirective.BLOCK_ALL_MIXED_CONTENT]?: boolean;
  [CSPDirective.REQUIRE_SRI_FOR]?: string[];
  [CSPDirective.REQUIRE_TRUSTED_TYPES_FOR]?: string[];
  [CSPDirective.TRUSTED_TYPES]?: string[];
  [CSPDirective.REPORT_URI]?: string[];
  [CSPDirective.REPORT_TO]?: string[];
}

// Security headers configuration
export interface SecurityHeadersConfig {
  environment: Environment;
  securityLevel: SecurityLevel;
  headers: {
    [SecurityHeaderType.CONTENT_SECURITY_POLICY]: {
      enabled: boolean;
      reportOnly: boolean;
      config: CSPConfig;
    };
    [SecurityHeaderType.STRICT_TRANSPORT_SECURITY]: SecurityHeaderConfig;
    [SecurityHeaderType.X_FRAME_OPTIONS]: SecurityHeaderConfig;
    [SecurityHeaderType.X_CONTENT_TYPE_OPTIONS]: SecurityHeaderConfig;
    [SecurityHeaderType.X_XSS_PROTECTION]: SecurityHeaderConfig;
    [SecurityHeaderType.REFERRER_POLICY]: SecurityHeaderConfig;
    [SecurityHeaderType.PERMISSIONS_POLICY]: SecurityHeaderConfig;
    [SecurityHeaderType.CROSS_ORIGIN_EMBEDDER_POLICY]: SecurityHeaderConfig;
    [SecurityHeaderType.CROSS_ORIGIN_OPENER_POLICY]: SecurityHeaderConfig;
    [SecurityHeaderType.CROSS_ORIGIN_RESOURCE_POLICY]: SecurityHeaderConfig;
    [SecurityHeaderType.EXPECT_CT]: SecurityHeaderConfig;
    [SecurityHeaderType.CACHE_CONTROL]: SecurityHeaderConfig;
    [SecurityHeaderType.PRAGMA]: SecurityHeaderConfig;
    [SecurityHeaderType.X_PERMITTED_CROSS_DOMAIN_POLICIES]: SecurityHeaderConfig;
    [SecurityHeaderType.X_ROBOTS_TAG]: SecurityHeaderConfig;
    [SecurityHeaderType.X_DOWNLOAD_OPTIONS]: SecurityHeaderConfig;
    [SecurityHeaderType.X_DNS_PREFETCH_CONTROL]: SecurityHeaderConfig;
  };
  customHeaders: Record<string, SecurityHeaderConfig>;
  reporting: {
    cspReportEndpoint: string;
    expectCtReportEndpoint: string;
    networkErrorLogging: boolean;
  };
}

// CSP violation report
export interface CSPViolationReport {
  'document-uri': string;
  referrer: string;
  'violated-directive': string;
  'effective-directive': string;
  'original-policy': string;
  disposition: 'enforce' | 'report';
  'blocked-uri': string;
  'line-number': number;
  'column-number': number;
  'source-file': string;
  'status-code': number;
  'script-sample': string;
}

// Security header validation result
export interface HeaderValidationResult {
  header: string;
  present: boolean;
  value?: string;
  valid: boolean;
  issues: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    recommendation: string;
  }>;
  score: number; // 0-100
}

// Security headers assessment
export interface SecurityHeadersAssessment {
  overallScore: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  headers: HeaderValidationResult[];
  recommendations: string[];
  criticalIssues: string[];
  missingHeaders: string[];
  weakHeaders: string[];
}

/**
 * Security Headers Service
 * Comprehensive security headers management and enforcement
 */
export class SecurityHeadersService {
  private static instance: SecurityHeadersService;
  private config: SecurityHeadersConfig;
  private appliedHeaders = new Map<string, string>();
  private violationReports: CSPViolationReport[] = [];

  private constructor() {
    this.config = this.getDefaultConfig();
    this.initializeSecurityHeaders();
    this.setupCSPReporting();
  }

  public static getInstance(): SecurityHeadersService {
    if (!SecurityHeadersService.instance) {
      SecurityHeadersService.instance = new SecurityHeadersService();
    }
    return SecurityHeadersService.instance;
  }

  /**
   * Apply security headers based on configuration
   */
  public applySecurityHeaders(): Record<string, string> {
    try {
      console.log('🛡️ Applying security headers...');
      
      const headers: Record<string, string> = {};
      
      // Apply each configured header
      Object.entries(this.config.headers).forEach(([headerType, headerConfig]) => {
        if (this.shouldApplyHeader(headerConfig)) {
          const headerValue = this.generateHeaderValue(headerType as SecurityHeaderType, headerConfig);
          if (headerValue) {
            headers[headerType] = headerValue;
            this.appliedHeaders.set(headerType, headerValue);
          }
        }
      });
      
      // Apply custom headers
      Object.entries(this.config.customHeaders).forEach(([headerName, headerConfig]) => {
        if (this.shouldApplyHeader(headerConfig)) {
          headers[headerName] = headerConfig.value;
          this.appliedHeaders.set(headerName, headerConfig.value);
        }
      });
      
      console.log(`✅ Applied ${Object.keys(headers).length} security headers`);
      
      // Log header application
      this.logHeaderApplication(headers);
      
      return headers;
      
    } catch (error) {
      console.error('❌ Failed to apply security headers:', error);
      
      securityLogger.logEvent(
        SecurityEventType.SECURITY_EVENT,
        {
          type: 'security_headers_application_failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        {
          severity: SecuritySeverity.HIGH,
        }
      );
      
      return {};
    }
  }

  /**
   * Generate Content Security Policy
   */
  public generateCSP(reportOnly: boolean = false): string {
    const cspConfig = this.config.headers[SecurityHeaderType.CONTENT_SECURITY_POLICY].config;
    const directives: string[] = [];
    
    // Process each CSP directive
    Object.entries(cspConfig).forEach(([directive, value]) => {
      if (value !== undefined) {
        if (typeof value === 'boolean') {
          if (value) {
            directives.push(directive);
          }
        } else if (Array.isArray(value) && value.length > 0) {
          directives.push(`${directive} ${value.join(' ')}`);
        }
      }
    });
    
    const csp = directives.join('; ');
    
    console.log(`🔒 Generated CSP (${reportOnly ? 'report-only' : 'enforce'}): ${csp.length} characters`);
    
    return csp;
  }

  /**
   * Handle CSP violation report
   */
  public handleCSPViolation(report: CSPViolationReport): void {
    try {
      console.log('🚨 CSP Violation detected:', report['violated-directive']);
      
      // Store violation report
      this.violationReports.push(report);
      
      // Analyze violation severity
      const severity = this.analyzeViolationSeverity(report);
      
      // Log security event
      securityLogger.logEvent(
        SecurityEventType.XSS_ATTEMPT,
        {
          type: 'csp_violation',
          violatedDirective: report['violated-directive'],
          blockedUri: report['blocked-uri'],
          sourceFile: report['source-file'],
          lineNumber: report['line-number'],
          scriptSample: report['script-sample'],
          documentUri: report['document-uri'],
          disposition: report.disposition,
        },
        {
          severity,
        }
      );
      
      // Create security alert for critical violations
      if (severity === SecuritySeverity.HIGH || severity === SecuritySeverity.CRITICAL) {
        securityAlerts.createAlert(AlertType.CRITICAL_THREAT, {
          source: 'csp_violation',
          riskScore: this.calculateViolationRiskScore(report),
        });
      }
      
      // Record in audit trail
      auditTrail.logAuditEvent(
        AuditCategory.SECURITY_EVENT,
        'csp_violation',
        {
          actor: {
            type: 'unknown',
            id: 'csp_violator',
          },
          target: {
            type: 'csp_policy',
            id: 'content_security_policy',
            name: 'Content Security Policy',
          },
          result: 'failure',
          context: {
            component: 'security_headers',
            operation: 'csp_enforcement',
            directive: report['violated-directive'],
          },
          riskLevel: this.mapSeverityToRiskLevel(severity),
        }
      );
      
    } catch (error) {
      console.error('❌ Failed to handle CSP violation:', error);
    }
  }

  /**
   * Validate current security headers
   */
  public validateSecurityHeaders(headers?: Record<string, string>): SecurityHeadersAssessment {
    const headersToValidate = headers || this.getCurrentHeaders();
    const results: HeaderValidationResult[] = [];
    
    // Validate each critical security header
    const criticalHeaders = [
      SecurityHeaderType.CONTENT_SECURITY_POLICY,
      SecurityHeaderType.STRICT_TRANSPORT_SECURITY,
      SecurityHeaderType.X_FRAME_OPTIONS,
      SecurityHeaderType.X_CONTENT_TYPE_OPTIONS,
      SecurityHeaderType.X_XSS_PROTECTION,
      SecurityHeaderType.REFERRER_POLICY,
    ];
    
    criticalHeaders.forEach(headerType => {
      const result = this.validateHeader(headerType, headersToValidate[headerType]);
      results.push(result);
    });
    
    // Calculate overall assessment
    const assessment = this.calculateAssessment(results);
    
    console.log(`🔍 Security headers assessment: Grade ${assessment.grade} (${assessment.overallScore}/100)`);
    
    return assessment;
  }

  /**
   * Get CSP violation reports
   */
  public getCSPViolationReports(limit: number = 50): CSPViolationReport[] {
    return this.violationReports
      .slice(-limit)
      .sort((a, b) => new Date(b['document-uri']).getTime() - new Date(a['document-uri']).getTime());
  }

  /**
   * Update security headers configuration
   */
  public updateConfiguration(updates: Partial<SecurityHeadersConfig>): void {
    this.config = { ...this.config, ...updates };
    console.log('🔧 Security headers configuration updated');
    
    // Reapply headers with new configuration
    this.applySecurityHeaders();
  }

  /**
   * Get security headers configuration
   */
  public getConfiguration(): SecurityHeadersConfig {
    return { ...this.config };
  }

  /**
   * Set security level preset
   */
  public setSecurityLevel(level: SecurityLevel, environment?: Environment): void {
    const env = environment || this.config.environment;
    this.config = this.getConfigForLevel(level, env);
    console.log(`🛡️ Security level set to: ${level} (${env})`);
    
    // Reapply headers
    this.applySecurityHeaders();
  }

  /**
   * Generate security headers report
   */
  public generateSecurityReport(): {
    configuration: SecurityHeadersConfig;
    appliedHeaders: Record<string, string>;
    assessment: SecurityHeadersAssessment;
    violations: CSPViolationReport[];
    recommendations: string[];
  } {
    const appliedHeaders = Object.fromEntries(this.appliedHeaders);
    const assessment = this.validateSecurityHeaders(appliedHeaders);
    const violations = this.getCSPViolationReports(20);
    
    const recommendations = [
      ...assessment.recommendations,
      'Regular security header audits',
      'Monitor CSP violation reports',
      'Keep security policies updated',
      'Test headers in staging environment',
    ];
    
    return {
      configuration: this.config,
      appliedHeaders,
      assessment,
      violations,
      recommendations,
    };
  }

  /**
   * Private helper methods
   */

  private shouldApplyHeader(headerConfig: any): boolean {
    if (!headerConfig.enabled) return false;
    
    if (headerConfig.environments && headerConfig.environments.length > 0) {
      return headerConfig.environments.includes(this.config.environment);
    }
    
    return true;
  }

  private generateHeaderValue(headerType: SecurityHeaderType, headerConfig: any): string | null {
    switch (headerType) {
      case SecurityHeaderType.CONTENT_SECURITY_POLICY:
        return this.generateCSP(false);
        
      case SecurityHeaderType.CONTENT_SECURITY_POLICY_REPORT_ONLY:
        return headerConfig.reportOnly ? this.generateCSP(true) : null;
        
      default:
        return headerConfig.value || null;
    }
  }

  private analyzeViolationSeverity(report: CSPViolationReport): SecuritySeverity {
    // Analyze violation context for severity
    const directive = report['violated-directive'];
    const blockedUri = report['blocked-uri'];
    const scriptSample = report['script-sample'];
    
    // Critical: script-src violations with inline scripts
    if (directive.startsWith('script-src') && scriptSample) {
      return SecuritySeverity.CRITICAL;
    }
    
    // High: External script/style loading
    if ((directive.startsWith('script-src') || directive.startsWith('style-src')) && 
        blockedUri && !blockedUri.startsWith('data:')) {
      return SecuritySeverity.HIGH;
    }
    
    // Medium: Other policy violations
    if (directive.startsWith('frame-src') || directive.startsWith('object-src')) {
      return SecuritySeverity.MEDIUM;
    }
    
    // Default to medium for unknown violations
    return SecuritySeverity.MEDIUM;
  }

  private calculateViolationRiskScore(report: CSPViolationReport): number {
    let riskScore = 0.5; // Base risk
    
    // Increase risk for dangerous directives
    if (report['violated-directive'].startsWith('script-src')) {
      riskScore += 0.3;
    }
    
    // Increase risk for external resources
    if (report['blocked-uri'] && !report['blocked-uri'].startsWith('data:')) {
      riskScore += 0.2;
    }
    
    // Increase risk for inline code
    if (report['script-sample']) {
      riskScore += 0.2;
    }
    
    return Math.min(1.0, riskScore);
  }

  private mapSeverityToRiskLevel(severity: SecuritySeverity): 'low' | 'medium' | 'high' | 'critical' {
    switch (severity) {
      case SecuritySeverity.CRITICAL: return 'critical';
      case SecuritySeverity.HIGH: return 'high';
      case SecuritySeverity.MEDIUM: return 'medium';
      default: return 'low';
    }
  }

  private getCurrentHeaders(): Record<string, string> {
    // In production, this would get headers from the current response
    return Object.fromEntries(this.appliedHeaders);
  }

  private validateHeader(headerType: SecurityHeaderType, value?: string): HeaderValidationResult {
    const result: HeaderValidationResult = {
      header: headerType,
      present: !!value,
      value,
      valid: false,
      issues: [],
      score: 0,
    };
    
    if (!value) {
      result.issues.push({
        severity: 'high',
        message: `Missing critical security header: ${headerType}`,
        recommendation: `Implement ${headerType} header`,
      });
      return result;
    }
    
    // Validate specific headers
    switch (headerType) {
      case SecurityHeaderType.CONTENT_SECURITY_POLICY:
        this.validateCSP(value, result);
        break;
        
      case SecurityHeaderType.STRICT_TRANSPORT_SECURITY:
        this.validateHSTS(value, result);
        break;
        
      case SecurityHeaderType.X_FRAME_OPTIONS:
        this.validateFrameOptions(value, result);
        break;
        
      case SecurityHeaderType.X_CONTENT_TYPE_OPTIONS:
        this.validateContentTypeOptions(value, result);
        break;
        
      case SecurityHeaderType.X_XSS_PROTECTION:
        this.validateXSSProtection(value, result);
        break;
        
      case SecurityHeaderType.REFERRER_POLICY:
        this.validateReferrerPolicy(value, result);
        break;
        
      default:
        result.valid = true;
        result.score = 70; // Default score for present header
    }
    
    return result;
  }

  private validateCSP(value: string, result: HeaderValidationResult): void {
    result.valid = value.length > 0;
    result.score = 60; // Base score
    
    // Check for unsafe directives
    if (value.includes("'unsafe-inline'")) {
      result.issues.push({
        severity: 'high',
        message: "CSP contains 'unsafe-inline' directive",
        recommendation: "Remove 'unsafe-inline' and use nonces or hashes",
      });
      result.score -= 20;
    }
    
    if (value.includes("'unsafe-eval'")) {
      result.issues.push({
        severity: 'high',
        message: "CSP contains 'unsafe-eval' directive",
        recommendation: "Remove 'unsafe-eval' directive",
      });
      result.score -= 20;
    }
    
    // Check for wildcard sources
    if (value.includes('*')) {
      result.issues.push({
        severity: 'medium',
        message: 'CSP contains wildcard (*) sources',
        recommendation: 'Use specific domains instead of wildcards',
      });
      result.score -= 10;
    }
    
    // Bonus for strict directives
    if (value.includes("'strict-dynamic'")) {
      result.score += 20;
    }
    
    if (value.includes('report-uri') || value.includes('report-to')) {
      result.score += 10;
    }
    
    result.score = Math.max(0, Math.min(100, result.score));
  }

  private validateHSTS(value: string, result: HeaderValidationResult): void {
    const maxAgeMatch = value.match(/max-age=(\d+)/);
    const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;
    
    result.valid = maxAge > 0;
    result.score = 50;
    
    if (maxAge < 31536000) { // Less than 1 year
      result.issues.push({
        severity: 'medium',
        message: 'HSTS max-age is less than 1 year',
        recommendation: 'Set max-age to at least 31536000 (1 year)',
      });
      result.score -= 20;
    } else {
      result.score += 20;
    }
    
    if (value.includes('includeSubDomains')) {
      result.score += 15;
    } else {
      result.issues.push({
        severity: 'low',
        message: 'HSTS does not include subdomains',
        recommendation: 'Add includeSubDomains directive',
      });
    }
    
    if (value.includes('preload')) {
      result.score += 15;
    }
    
    result.score = Math.max(0, Math.min(100, result.score));
  }

  private validateFrameOptions(value: string, result: HeaderValidationResult): void {
    const validValues = ['DENY', 'SAMEORIGIN'];
    result.valid = validValues.includes(value) || value.startsWith('ALLOW-FROM');
    result.score = result.valid ? 80 : 0;
    
    if (value === 'DENY') {
      result.score = 100;
    } else if (value === 'SAMEORIGIN') {
      result.score = 90;
    } else if (value.startsWith('ALLOW-FROM')) {
      result.score = 70;
      result.issues.push({
        severity: 'low',
        message: 'ALLOW-FROM is deprecated',
        recommendation: 'Use CSP frame-ancestors directive instead',
      });
    }
  }

  private validateContentTypeOptions(value: string, result: HeaderValidationResult): void {
    result.valid = value === 'nosniff';
    result.score = result.valid ? 100 : 0;
    
    if (!result.valid) {
      result.issues.push({
        severity: 'medium',
        message: 'X-Content-Type-Options should be set to "nosniff"',
        recommendation: 'Set header value to "nosniff"',
      });
    }
  }

  private validateXSSProtection(value: string, result: HeaderValidationResult): void {
    result.valid = value === '1; mode=block' || value === '0';
    result.score = 70;
    
    if (value === '1; mode=block') {
      result.score = 80;
    } else if (value === '0') {
      result.score = 90; // Disabling is better than default filtering
    } else {
      result.issues.push({
        severity: 'low',
        message: 'X-XSS-Protection has suboptimal configuration',
        recommendation: 'Set to "0" to disable problematic filtering',
      });
      result.score = 50;
    }
  }

  private validateReferrerPolicy(value: string, result: HeaderValidationResult): void {
    const validPolicies = [
      'no-referrer',
      'no-referrer-when-downgrade',
      'origin',
      'origin-when-cross-origin',
      'same-origin',
      'strict-origin',
      'strict-origin-when-cross-origin',
      'unsafe-url',
    ];
    
    result.valid = validPolicies.includes(value);
    result.score = result.valid ? 70 : 0;
    
    if (value === 'no-referrer' || value === 'strict-origin-when-cross-origin') {
      result.score = 100;
    } else if (value === 'unsafe-url') {
      result.score = 30;
      result.issues.push({
        severity: 'medium',
        message: 'Referrer policy "unsafe-url" may leak sensitive information',
        recommendation: 'Use "strict-origin-when-cross-origin" or "no-referrer"',
      });
    }
  }

  private calculateAssessment(results: HeaderValidationResult[]): SecurityHeadersAssessment {
    const totalScore = results.reduce((sum, result) => sum + result.score, 0);
    const overallScore = Math.round(totalScore / results.length);
    
    let grade: SecurityHeadersAssessment['grade'];
    if (overallScore >= 95) grade = 'A+';
    else if (overallScore >= 85) grade = 'A';
    else if (overallScore >= 75) grade = 'B';
    else if (overallScore >= 65) grade = 'C';
    else if (overallScore >= 50) grade = 'D';
    else grade = 'F';
    
    const criticalIssues = results
      .flatMap(r => r.issues.filter(i => i.severity === 'critical'))
      .map(i => i.message);
    
    const missingHeaders = results
      .filter(r => !r.present)
      .map(r => r.header);
    
    const weakHeaders = results
      .filter(r => r.present && r.score < 70)
      .map(r => r.header);
    
    const recommendations = [
      ...new Set(results.flatMap(r => r.issues.map(i => i.recommendation)))
    ];
    
    return {
      overallScore,
      grade,
      headers: results,
      recommendations,
      criticalIssues,
      missingHeaders,
      weakHeaders,
    };
  }

  private logHeaderApplication(headers: Record<string, string>): void {
    securityLogger.logEvent(
      SecurityEventType.SECURITY_EVENT,
      {
        type: 'security_headers_applied',
        environment: this.config.environment,
        securityLevel: this.config.securityLevel,
        headerCount: Object.keys(headers).length,
        appliedHeaders: Object.keys(headers),
      },
      {
        severity: SecuritySeverity.INFO,
      }
    );
  }

  private initializeSecurityHeaders(): void {
    console.log('🔧 Initializing security headers...');
    
    // Apply headers to current document if in browser
    if (typeof window !== 'undefined' && window.document) {
      // Note: Most security headers must be set by the server
      // This is for demonstration and client-side monitoring
      console.log('🌐 Browser environment detected - headers should be set by server');
    }
  }

  private setupCSPReporting(): void {
    // Set up CSP violation event listener
    if (typeof window !== 'undefined') {
      window.addEventListener('securitypolicyviolation', (event) => {
        const report: CSPViolationReport = {
          'document-uri': event.documentURI,
          referrer: event.referrer,
          'violated-directive': event.violatedDirective,
          'effective-directive': event.effectiveDirective,
          'original-policy': event.originalPolicy,
          disposition: event.disposition as 'enforce' | 'report',
          'blocked-uri': event.blockedURI,
          'line-number': event.lineNumber,
          'column-number': event.columnNumber,
          'source-file': event.sourceFile,
          'status-code': event.statusCode,
          'script-sample': event.sample,
        };
        
        this.handleCSPViolation(report);
      });
    }
  }

  private getConfigForLevel(level: SecurityLevel, environment: Environment): SecurityHeadersConfig {
    const baseConfig = this.getDefaultConfig();
    
    // Adjust configuration based on security level
    switch (level) {
      case SecurityLevel.STRICT:
        return this.getStrictConfig(environment);
      case SecurityLevel.MODERATE:
        return this.getModerateConfig(environment);
      case SecurityLevel.RELAXED:
        return this.getRelaxedConfig(environment);
      case SecurityLevel.DEVELOPMENT:
        return this.getDevelopmentConfig(environment);
      default:
        return baseConfig;
    }
  }

  private getDefaultConfig(): SecurityHeadersConfig {
    return {
      environment: Environment.PRODUCTION,
      securityLevel: SecurityLevel.MODERATE,
      headers: {
        [SecurityHeaderType.CONTENT_SECURITY_POLICY]: {
          enabled: true,
          reportOnly: false,
          config: {
            [CSPDirective.DEFAULT_SRC]: [CSPSource.SELF],
            [CSPDirective.SCRIPT_SRC]: [CSPSource.SELF, CSPSource.STRICT_DYNAMIC],
            [CSPDirective.STYLE_SRC]: [CSPSource.SELF, CSPSource.UNSAFE_INLINE],
            [CSPDirective.IMG_SRC]: [CSPSource.SELF, 'data:', 'https:'],
            [CSPDirective.CONNECT_SRC]: [CSPSource.SELF],
            [CSPDirective.FONT_SRC]: [CSPSource.SELF],
            [CSPDirective.OBJECT_SRC]: [CSPSource.NONE],
            [CSPDirective.FRAME_ANCESTORS]: [CSPSource.NONE],
            [CSPDirective.BASE_URI]: [CSPSource.SELF],
            [CSPDirective.FORM_ACTION]: [CSPSource.SELF],
            [CSPDirective.UPGRADE_INSECURE_REQUESTS]: true,
            [CSPDirective.BLOCK_ALL_MIXED_CONTENT]: true,
          },
        },
        [SecurityHeaderType.STRICT_TRANSPORT_SECURITY]: {
          enabled: true,
          value: 'max-age=31536000; includeSubDomains; preload',
          riskLevel: 'high',
        },
        [SecurityHeaderType.X_FRAME_OPTIONS]: {
          enabled: true,
          value: 'DENY',
          riskLevel: 'medium',
        },
        [SecurityHeaderType.X_CONTENT_TYPE_OPTIONS]: {
          enabled: true,
          value: 'nosniff',
          riskLevel: 'medium',
        },
        [SecurityHeaderType.X_XSS_PROTECTION]: {
          enabled: true,
          value: '0',
          riskLevel: 'low',
        },
        [SecurityHeaderType.REFERRER_POLICY]: {
          enabled: true,
          value: 'strict-origin-when-cross-origin',
          riskLevel: 'low',
        },
        [SecurityHeaderType.PERMISSIONS_POLICY]: {
          enabled: true,
          value: 'camera=(), microphone=(), geolocation=(), payment=()',
          riskLevel: 'low',
        },
        [SecurityHeaderType.CROSS_ORIGIN_EMBEDDER_POLICY]: {
          enabled: false,
          value: 'require-corp',
          riskLevel: 'low',
        },
        [SecurityHeaderType.CROSS_ORIGIN_OPENER_POLICY]: {
          enabled: true,
          value: 'same-origin',
          riskLevel: 'low',
        },
        [SecurityHeaderType.CROSS_ORIGIN_RESOURCE_POLICY]: {
          enabled: true,
          value: 'same-origin',
          riskLevel: 'low',
        },
        [SecurityHeaderType.EXPECT_CT]: {
          enabled: false,
          value: 'max-age=86400, enforce',
          riskLevel: 'low',
        },
        [SecurityHeaderType.CACHE_CONTROL]: {
          enabled: true,
          value: 'no-cache, no-store, must-revalidate',
          riskLevel: 'low',
        },
        [SecurityHeaderType.PRAGMA]: {
          enabled: true,
          value: 'no-cache',
          riskLevel: 'low',
        },
        [SecurityHeaderType.X_PERMITTED_CROSS_DOMAIN_POLICIES]: {
          enabled: true,
          value: 'none',
          riskLevel: 'low',
        },
        [SecurityHeaderType.X_ROBOTS_TAG]: {
          enabled: false,
          value: 'noindex, nofollow',
          riskLevel: 'low',
        },
        [SecurityHeaderType.X_DOWNLOAD_OPTIONS]: {
          enabled: true,
          value: 'noopen',
          riskLevel: 'low',
        },
        [SecurityHeaderType.X_DNS_PREFETCH_CONTROL]: {
          enabled: true,
          value: 'off',
          riskLevel: 'low',
        },
      },
      customHeaders: {},
      reporting: {
        cspReportEndpoint: '/api/security/csp-report',
        expectCtReportEndpoint: '/api/security/expect-ct-report',
        networkErrorLogging: false,
      },
    };
  }

  private getStrictConfig(environment: Environment): SecurityHeadersConfig {
    const config = this.getDefaultConfig();
    
    // Strictest CSP configuration
    config.headers[SecurityHeaderType.CONTENT_SECURITY_POLICY].config = {
      [CSPDirective.DEFAULT_SRC]: [CSPSource.NONE],
      [CSPDirective.SCRIPT_SRC]: [CSPSource.SELF, CSPSource.STRICT_DYNAMIC],
      [CSPDirective.STYLE_SRC]: [CSPSource.SELF],
      [CSPDirective.IMG_SRC]: [CSPSource.SELF],
      [CSPDirective.CONNECT_SRC]: [CSPSource.SELF],
      [CSPDirective.FONT_SRC]: [CSPSource.SELF],
      [CSPDirective.OBJECT_SRC]: [CSPSource.NONE],
      [CSPDirective.FRAME_SRC]: [CSPSource.NONE],
      [CSPDirective.FRAME_ANCESTORS]: [CSPSource.NONE],
      [CSPDirective.BASE_URI]: [CSPSource.NONE],
      [CSPDirective.FORM_ACTION]: [CSPSource.SELF],
      [CSPDirective.UPGRADE_INSECURE_REQUESTS]: true,
      [CSPDirective.BLOCK_ALL_MIXED_CONTENT]: true,
      [CSPDirective.REQUIRE_TRUSTED_TYPES_FOR]: ["'script'"],
    };
    
    // Enable all security headers
    Object.keys(config.headers).forEach(header => {
      config.headers[header as SecurityHeaderType].enabled = true;
    });
    
    config.environment = environment;
    config.securityLevel = SecurityLevel.STRICT;
    
    return config;
  }

  private getModerateConfig(environment: Environment): SecurityHeadersConfig {
    const config = this.getDefaultConfig();
    config.environment = environment;
    config.securityLevel = SecurityLevel.MODERATE;
    return config;
  }

  private getRelaxedConfig(environment: Environment): SecurityHeadersConfig {
    const config = this.getDefaultConfig();
    
    // More permissive CSP
    config.headers[SecurityHeaderType.CONTENT_SECURITY_POLICY].config = {
      [CSPDirective.DEFAULT_SRC]: [CSPSource.SELF],
      [CSPDirective.SCRIPT_SRC]: [CSPSource.SELF, CSPSource.UNSAFE_INLINE, 'https:'],
      [CSPDirective.STYLE_SRC]: [CSPSource.SELF, CSPSource.UNSAFE_INLINE, 'https:'],
      [CSPDirective.IMG_SRC]: [CSPSource.SELF, 'data:', 'https:'],
      [CSPDirective.CONNECT_SRC]: [CSPSource.SELF, 'https:'],
      [CSPDirective.FONT_SRC]: [CSPSource.SELF, 'https:'],
      [CSPDirective.OBJECT_SRC]: [CSPSource.SELF],
      [CSPDirective.FRAME_ANCESTORS]: [CSPSource.SELF],
      [CSPDirective.BASE_URI]: [CSPSource.SELF],
      [CSPDirective.FORM_ACTION]: [CSPSource.SELF],
    };
    
    config.environment = environment;
    config.securityLevel = SecurityLevel.RELAXED;
    
    return config;
  }

  private getDevelopmentConfig(environment: Environment): SecurityHeadersConfig {
    const config = this.getDefaultConfig();
    
    // Development-friendly CSP
    config.headers[SecurityHeaderType.CONTENT_SECURITY_POLICY].config = {
      [CSPDirective.DEFAULT_SRC]: [CSPSource.SELF],
      [CSPDirective.SCRIPT_SRC]: [CSPSource.SELF, CSPSource.UNSAFE_INLINE, CSPSource.UNSAFE_EVAL, 'localhost:*', '127.0.0.1:*'],
      [CSPDirective.STYLE_SRC]: [CSPSource.SELF, CSPSource.UNSAFE_INLINE, 'localhost:*', '127.0.0.1:*'],
      [CSPDirective.IMG_SRC]: [CSPSource.SELF, 'data:', 'https:', 'http:', 'localhost:*', '127.0.0.1:*'],
      [CSPDirective.CONNECT_SRC]: [CSPSource.SELF, 'localhost:*', '127.0.0.1:*', 'ws:', 'wss:'],
      [CSPDirective.FONT_SRC]: [CSPSource.SELF, 'localhost:*', '127.0.0.1:*'],
      [CSPDirective.OBJECT_SRC]: [CSPSource.SELF],
      [CSPDirective.FRAME_ANCESTORS]: [CSPSource.SELF, 'localhost:*', '127.0.0.1:*'],
      [CSPDirective.BASE_URI]: [CSPSource.SELF],
      [CSPDirective.FORM_ACTION]: [CSPSource.SELF],
    };
    
    // Use report-only mode in development
    config.headers[SecurityHeaderType.CONTENT_SECURITY_POLICY].reportOnly = true;
    
    // Disable HSTS in development
    config.headers[SecurityHeaderType.STRICT_TRANSPORT_SECURITY].enabled = false;
    
    config.environment = environment;
    config.securityLevel = SecurityLevel.DEVELOPMENT;
    
    return config;
  }
}

// Global instance
export const securityHeaders = SecurityHeadersService.getInstance();