/**
 * Content Security Policy (CSP) Implementation
 * Advanced CSP configuration and management system
 */

import { securityLogger, SecurityEventType, SecuritySeverity } from './securityLogging';
import { auditTrail, AuditCategory } from './auditTrail';

// CSP directive types (from securityHeaders.ts)
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
  SANDBOX = 'sandbox',
  REPORT_URI = 'report-uri',
  CHILD_SRC = 'child-src',
  FORM_ACTION = 'form-action',
  FRAME_ANCESTORS = 'frame-ancestors',
  PLUGIN_TYPES = 'plugin-types',
  BASE_URI = 'base-uri',
  REPORT_TO = 'report-to',
  WORKER_SRC = 'worker-src',
  MANIFEST_SRC = 'manifest-src',
  PREFETCH_SRC = 'prefetch-src',
  NAVIGATE_TO = 'navigate-to',
  SCRIPT_SRC_ELEM = 'script-src-elem',
  SCRIPT_SRC_ATTR = 'script-src-attr',
  STYLE_SRC_ELEM = 'style-src-elem',
  STYLE_SRC_ATTR = 'style-src-attr',
}

// CSP source keywords
export enum CSPSource {
  SELF = "'self'",
  UNSAFE_INLINE = "'unsafe-inline'",
  UNSAFE_EVAL = "'unsafe-eval'",
  NONE = "'none'",
  STRICT_DYNAMIC = "'strict-dynamic'",
  REPORT_SAMPLE = "'report-sample'",
  UNSAFE_HASHES = "'unsafe-hashes'",
  UNSAFE_ALLOW_REDIRECTS = "'unsafe-allow-redirects'",
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
  'line-number'?: number;
  'column-number'?: number;
  'source-file'?: string;
  'status-code': number;
  'script-sample'?: string;
}

// CSP nonce configuration
export interface CSPNonceConfig {
  length: number;
  refreshInterval: number; // in milliseconds
  includeInResponse: boolean;
  algorithm: 'random' | 'crypto';
}

// CSP hash configuration
export interface CSPHashConfig {
  algorithm: 'sha256' | 'sha384' | 'sha512';
  autoGenerate: boolean;
  trackInlineScripts: boolean;
  trackInlineStyles: boolean;
}

// CSP configuration
export interface CSPConfiguration {
  enforceMode: boolean; // true for enforce, false for report-only
  directives: Partial<Record<CSPDirective, string[]>>;
  reportEndpoint: string;
  enableNonces: boolean;
  nonceConfig: CSPNonceConfig;
  enableHashes: boolean;
  hashConfig: CSPHashConfig;
  enableViolationReporting: boolean;
  allowUnsafeInline: boolean;
  allowUnsafeEval: boolean;
  strictDynamic: boolean;
  reportUri?: string;
  reportTo?: string;
  customDirectives: Record<string, string[]>;
}

// CSP analysis result
export interface CSPAnalysisResult {
  isSecure: boolean;
  securityScore: number;
  weaknesses: string[];
  recommendations: string[];
  directive_analysis: Record<CSPDirective, {
    secure: boolean;
    issues: string[];
    suggestions: string[];
  }>;
  violationRisk: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * CSP Implementation Service
 * Advanced Content Security Policy management and enforcement
 */
export class CSPImplementationService {
  private static instance: CSPImplementationService;
  private config: CSPConfiguration;
  private activeNonces: Map<string, { nonce: string; expiry: number }>;
  private inlineHashes: Set<string>;
  private violationReports: CSPViolationReport[];
  private reportingEndpoint: string;

  private constructor() {
    this.config = this.getDefaultConfig();
    this.activeNonces = new Map();
    this.inlineHashes = new Set();
    this.violationReports = [];
    this.reportingEndpoint = '/api/csp-violation-report';
    this.setupViolationReporting();
    this.setupNonceRotation();
  }

  public static getInstance(): CSPImplementationService {
    if (!CSPImplementationService.instance) {
      CSPImplementationService.instance = new CSPImplementationService();
    }
    return CSPImplementationService.instance;
  }

  /**
   * Configure CSP settings
   */
  public configure(config: Partial<CSPConfiguration>): void {
    this.config = { ...this.config, ...config };
    console.log('🛡️ CSP Implementation configured:', {
      enforceMode: this.config.enforceMode,
      enableNonces: this.config.enableNonces,
      enableHashes: this.config.enableHashes,
      violationReporting: this.config.enableViolationReporting,
      strictDynamic: this.config.strictDynamic,
    });
  }

  /**
   * Generate CSP header value
   */
  public generateCSPHeader(): { name: string; value: string } {
    const directives: string[] = [];

    // Process each directive
    for (const [directive, sources] of Object.entries(this.config.directives)) {
      if (sources && sources.length > 0) {
        const processedSources = this.processDirectiveSources(directive as CSPDirective, sources);
        directives.push(`${directive} ${processedSources.join(' ')}`);
      }
    }

    // Add custom directives
    for (const [directive, sources] of Object.entries(this.config.customDirectives)) {
      if (sources && sources.length > 0) {
        directives.push(`${directive} ${sources.join(' ')}`);
      }
    }

    // Add reporting
    if (this.config.enableViolationReporting) {
      if (this.config.reportUri) {
        directives.push(`report-uri ${this.config.reportUri}`);
      }
      if (this.config.reportTo) {
        directives.push(`report-to ${this.config.reportTo}`);
      }
    }

    const headerName = this.config.enforceMode ? 
                      'Content-Security-Policy' : 
                      'Content-Security-Policy-Report-Only';
    
    const headerValue = directives.join('; ');

    console.log(`🔒 Generated ${headerName}:`, headerValue);

    return { name: headerName, value: headerValue };
  }

  /**
   * Generate nonce for scripts/styles
   */
  public generateNonce(sessionId: string = 'default'): string {
    if (!this.config.enableNonces) {
      throw new Error('Nonces are disabled in CSP configuration');
    }

    const nonce = this.generateSecureNonce();
    const expiry = Date.now() + this.config.nonceConfig.refreshInterval;

    this.activeNonces.set(sessionId, { nonce, expiry });

    console.log('🔑 CSP nonce generated:', {
      sessionId: sessionId.substring(0, 8),
      nonce: nonce.substring(0, 8),
      expiry: new Date(expiry).toISOString(),
    });

    return nonce;
  }

  /**
   * Get current nonce for session
   */
  public getNonce(sessionId: string = 'default'): string | null {
    const nonceData = this.activeNonces.get(sessionId);
    
    if (!nonceData) {
      return null;
    }

    // Check if nonce is expired
    if (Date.now() > nonceData.expiry) {
      this.activeNonces.delete(sessionId);
      return null;
    }

    return nonceData.nonce;
  }

  /**
   * Generate hash for inline content
   */
  public generateContentHash(content: string, algorithm: 'sha256' | 'sha384' | 'sha512' = 'sha256'): string {
    if (!this.config.enableHashes) {
      throw new Error('Hashes are disabled in CSP configuration');
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    
    return crypto.subtle.digest(algorithm.toUpperCase(), data).then(hashBuffer => {
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashBase64 = btoa(String.fromCharCode.apply(null, hashArray));
      const hash = `'${algorithm}-${hashBase64}'`;
      
      this.inlineHashes.add(hash);
      
      console.log('🔗 Content hash generated:', {
        algorithm,
        hash: hash.substring(0, 20) + '...',
        contentLength: content.length,
      });
      
      return hash;
    });
  }

  /**
   * Analyze CSP for security weaknesses
   */
  public analyzeCSPSecurity(): CSPAnalysisResult {
    const analysis: CSPAnalysisResult = {
      isSecure: true,
      securityScore: 100,
      weaknesses: [],
      recommendations: [],
      directive_analysis: {} as any,
      violationRisk: 'low',
    };

    let totalDeductions = 0;

    // Analyze each directive
    for (const directive of Object.values(CSPDirective)) {
      const sources = this.config.directives[directive] || [];
      const directiveAnalysis = this.analyzeDirective(directive, sources);
      
      analysis.directive_analysis[directive] = directiveAnalysis;
      
      if (!directiveAnalysis.secure) {
        analysis.isSecure = false;
        analysis.weaknesses.push(...directiveAnalysis.issues);
        analysis.recommendations.push(...directiveAnalysis.suggestions);
        totalDeductions += this.getDirectiveWeight(directive);
      }
    }

    // Calculate security score
    analysis.securityScore = Math.max(0, 100 - totalDeductions);

    // Determine violation risk
    if (analysis.securityScore < 40) {
      analysis.violationRisk = 'critical';
    } else if (analysis.securityScore < 60) {
      analysis.violationRisk = 'high';
    } else if (analysis.securityScore < 80) {
      analysis.violationRisk = 'medium';
    } else {
      analysis.violationRisk = 'low';
    }

    console.log('📊 CSP Security Analysis:', {
      isSecure: analysis.isSecure,
      score: analysis.securityScore,
      risk: analysis.violationRisk,
      weaknesses: analysis.weaknesses.length,
    });

    return analysis;
  }

  /**
   * Handle CSP violation report
   */
  public async handleViolationReport(report: CSPViolationReport): Promise<void> {
    this.violationReports.push(report);

    // Log violation
    console.warn('🚨 CSP Violation detected:', {
      violatedDirective: report['violated-directive'],
      blockedUri: report['blocked-uri'],
      documentUri: report['document-uri'],
      disposition: report.disposition,
    });

    // Log to security logger
    await securityLogger.logEvent(
      SecurityEventType.SECURITY_INCIDENT,
      {
        type: 'csp_violation',
        violatedDirective: report['violated-directive'],
        effectiveDirective: report['effective-directive'],
        blockedUri: report['blocked-uri'],
        documentUri: report['document-uri'],
        disposition: report.disposition,
        sourceFile: report['source-file'],
        lineNumber: report['line-number'],
        columnNumber: report['column-number'],
        scriptSample: report['script-sample'],
      },
      {
        severity: this.getViolationSeverity(report),
      }
    );

    // Log to audit trail
    await auditTrail.logAuditEvent(
      AuditCategory.SECURITY,
      'csp_violation_detected',
      {
        actor: {
          type: 'browser',
          id: 'unknown',
        },
        target: {
          type: 'csp_policy',
          id: 'content_security_policy',
          name: 'Content Security Policy',
        },
        result: 'violation',
        context: {
          component: 'csp_implementation',
          operation: 'policy_enforcement',
          violatedDirective: report['violated-directive'],
          blockedUri: report['blocked-uri'],
          disposition: report.disposition,
        },
        riskLevel: this.getViolationRiskLevel(report),
      }
    );

    // Auto-adjust policy if in learning mode
    if (this.shouldAutoAdjust(report)) {
      await this.suggestPolicyAdjustment(report);
    }
  }

  /**
   * Get CSP violation statistics
   */
  public getViolationStats(): {
    totalViolations: number;
    byDirective: Record<string, number>;
    byBlockedUri: Record<string, number>;
    recentViolations: CSPViolationReport[];
    topViolatedDirectives: Array<{ directive: string; count: number }>;
    commonBlockedUris: Array<{ uri: string; count: number }>;
  } {
    const byDirective: Record<string, number> = {};
    const byBlockedUri: Record<string, number> = {};

    this.violationReports.forEach(report => {
      const directive = report['violated-directive'];
      const uri = report['blocked-uri'];

      byDirective[directive] = (byDirective[directive] || 0) + 1;
      byBlockedUri[uri] = (byBlockedUri[uri] || 0) + 1;
    });

    // Get recent violations (last 100)
    const recentViolations = this.violationReports.slice(-100);

    // Sort top violated directives
    const topViolatedDirectives = Object.entries(byDirective)
      .map(([directive, count]) => ({ directive, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Sort common blocked URIs
    const commonBlockedUris = Object.entries(byBlockedUri)
      .map(([uri, count]) => ({ uri, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalViolations: this.violationReports.length,
      byDirective,
      byBlockedUri,
      recentViolations,
      topViolatedDirectives,
      commonBlockedUris,
    };
  }

  /**
   * Get default CSP configuration
   */
  public getSecureDefaultPolicy(): CSPConfiguration {
    return {
      enforceMode: true,
      directives: {
        [CSPDirective.DEFAULT_SRC]: [CSPSource.SELF],
        [CSPDirective.SCRIPT_SRC]: [CSPSource.SELF, CSPSource.STRICT_DYNAMIC],
        [CSPDirective.STYLE_SRC]: [CSPSource.SELF, CSPSource.UNSAFE_INLINE],
        [CSPDirective.IMG_SRC]: [CSPSource.SELF, 'data:', 'https:'],
        [CSPDirective.CONNECT_SRC]: [CSPSource.SELF],
        [CSPDirective.FONT_SRC]: [CSPSource.SELF, 'https:', 'data:'],
        [CSPDirective.OBJECT_SRC]: [CSPSource.NONE],
        [CSPDirective.MEDIA_SRC]: [CSPSource.SELF],
        [CSPDirective.FRAME_SRC]: [CSPSource.NONE],
        [CSPDirective.CHILD_SRC]: [CSPSource.SELF],
        [CSPDirective.FORM_ACTION]: [CSPSource.SELF],
        [CSPDirective.FRAME_ANCESTORS]: [CSPSource.NONE],
        [CSPDirective.BASE_URI]: [CSPSource.SELF],
        [CSPDirective.MANIFEST_SRC]: [CSPSource.SELF],
      },
      reportEndpoint: '/api/csp-violation-report',
      enableNonces: true,
      nonceConfig: {
        length: 16,
        refreshInterval: 900000, // 15 minutes
        includeInResponse: true,
        algorithm: 'crypto',
      },
      enableHashes: true,
      hashConfig: {
        algorithm: 'sha256',
        autoGenerate: true,
        trackInlineScripts: true,
        trackInlineStyles: true,
      },
      enableViolationReporting: true,
      allowUnsafeInline: false,
      allowUnsafeEval: false,
      strictDynamic: true,
      customDirectives: {},
    };
  }

  /**
   * Private helper methods
   */

  private getDefaultConfig(): CSPConfiguration {
    return this.getSecureDefaultPolicy();
  }

  private processDirectiveSources(directive: CSPDirective, sources: string[]): string[] {
    const processedSources = [...sources];

    // Add nonces for script and style directives
    if (this.config.enableNonces && 
        [CSPDirective.SCRIPT_SRC, CSPDirective.STYLE_SRC].includes(directive)) {
      const currentNonce = this.getNonce();
      if (currentNonce) {
        processedSources.push(`'nonce-${currentNonce}'`);
      }
    }

    // Add hashes for inline content
    if (this.config.enableHashes && this.inlineHashes.size > 0 &&
        [CSPDirective.SCRIPT_SRC, CSPDirective.STYLE_SRC].includes(directive)) {
      processedSources.push(...Array.from(this.inlineHashes));
    }

    return processedSources;
  }

  private generateSecureNonce(): string {
    const array = new Uint8Array(this.config.nonceConfig.length);
    
    if (this.config.nonceConfig.algorithm === 'crypto') {
      crypto.getRandomValues(array);
    } else {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }

    return btoa(String.fromCharCode.apply(null, array as any)).replace(/[+/=]/g, '');
  }

  private analyzeDirective(directive: CSPDirective, sources: string[]): {
    secure: boolean;
    issues: string[];
    suggestions: string[];
  } {
    const analysis = {
      secure: true,
      issues: [] as string[],
      suggestions: [] as string[],
    };

    // Check for unsafe directives
    if (sources.includes(CSPSource.UNSAFE_INLINE)) {
      analysis.secure = false;
      analysis.issues.push(`${directive} allows 'unsafe-inline'`);
      analysis.suggestions.push(`Remove 'unsafe-inline' from ${directive} and use nonces or hashes`);
    }

    if (sources.includes(CSPSource.UNSAFE_EVAL)) {
      analysis.secure = false;
      analysis.issues.push(`${directive} allows 'unsafe-eval'`);
      analysis.suggestions.push(`Remove 'unsafe-eval' from ${directive}`);
    }

    // Check for wildcard usage
    if (sources.includes('*')) {
      analysis.secure = false;
      analysis.issues.push(`${directive} uses wildcard (*)`);
      analysis.suggestions.push(`Replace wildcard with specific domains in ${directive}`);
    }

    // Check for data: scheme in non-img directives
    if (sources.includes('data:') && directive !== CSPDirective.IMG_SRC && directive !== CSPDirective.FONT_SRC) {
      analysis.secure = false;
      analysis.issues.push(`${directive} allows data: scheme`);
      analysis.suggestions.push(`Consider removing data: scheme from ${directive}`);
    }

    // Directive-specific checks
    switch (directive) {
      case CSPDirective.OBJECT_SRC:
        if (!sources.includes(CSPSource.NONE)) {
          analysis.issues.push('object-src should be set to \'none\'');
          analysis.suggestions.push('Set object-src to \'none\' to prevent Flash/plugin vulnerabilities');
        }
        break;

      case CSPDirective.FRAME_ANCESTORS:
        if (sources.length === 0) {
          analysis.issues.push('frame-ancestors directive is missing');
          analysis.suggestions.push('Add frame-ancestors directive to prevent clickjacking');
        }
        break;

      case CSPDirective.BASE_URI:
        if (!sources.includes(CSPSource.SELF) && !sources.includes(CSPSource.NONE)) {
          analysis.issues.push('base-uri should be restricted');
          analysis.suggestions.push('Set base-uri to \'self\' or \'none\'');
        }
        break;
    }

    return analysis;
  }

  private getDirectiveWeight(directive: CSPDirective): number {
    // Different directives have different security impact
    const weights: Record<CSPDirective, number> = {
      [CSPDirective.SCRIPT_SRC]: 25,
      [CSPDirective.OBJECT_SRC]: 20,
      [CSPDirective.FRAME_ANCESTORS]: 15,
      [CSPDirective.BASE_URI]: 15,
      [CSPDirective.DEFAULT_SRC]: 10,
      [CSPDirective.STYLE_SRC]: 5,
      [CSPDirective.IMG_SRC]: 3,
      [CSPDirective.FONT_SRC]: 2,
      [CSPDirective.CONNECT_SRC]: 5,
      [CSPDirective.MEDIA_SRC]: 2,
      [CSPDirective.FRAME_SRC]: 10,
      [CSPDirective.CHILD_SRC]: 8,
      [CSPDirective.FORM_ACTION]: 10,
      [CSPDirective.MANIFEST_SRC]: 2,
      [CSPDirective.WORKER_SRC]: 8,
      [CSPDirective.PREFETCH_SRC]: 3,
      [CSPDirective.NAVIGATE_TO]: 5,
      [CSPDirective.SCRIPT_SRC_ELEM]: 20,
      [CSPDirective.SCRIPT_SRC_ATTR]: 15,
      [CSPDirective.STYLE_SRC_ELEM]: 5,
      [CSPDirective.STYLE_SRC_ATTR]: 5,
      [CSPDirective.SANDBOX]: 10,
      [CSPDirective.REPORT_URI]: 0,
      [CSPDirective.REPORT_TO]: 0,
      [CSPDirective.PLUGIN_TYPES]: 5,
    };

    return weights[directive] || 5;
  }

  private getViolationSeverity(report: CSPViolationReport): SecuritySeverity {
    const directive = report['violated-directive'];
    
    if (directive.includes('script-src')) {
      return SecuritySeverity.HIGH;
    } else if (directive.includes('object-src') || directive.includes('frame-ancestors')) {
      return SecuritySeverity.HIGH;
    } else if (directive.includes('style-src') || directive.includes('img-src')) {
      return SecuritySeverity.MEDIUM;
    } else {
      return SecuritySeverity.LOW;
    }
  }

  private getViolationRiskLevel(report: CSPViolationReport): string {
    const directive = report['violated-directive'];
    
    if (directive.includes('script-src') || directive.includes('object-src')) {
      return 'high';
    } else if (directive.includes('frame-ancestors') || directive.includes('base-uri')) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private shouldAutoAdjust(report: CSPViolationReport): boolean {
    // Only auto-adjust in report-only mode and for certain low-risk violations
    return !this.config.enforceMode && 
           this.getViolationRiskLevel(report) === 'low';
  }

  private async suggestPolicyAdjustment(report: CSPViolationReport): Promise<void> {
    const suggestion = this.generatePolicyAdjustment(report);
    
    console.log('💡 CSP Policy Adjustment Suggested:', suggestion);
    
    // Log suggestion
    await securityLogger.logEvent(
      SecurityEventType.SECURITY_EVENT,
      {
        type: 'csp_policy_suggestion',
        violatedDirective: report['violated-directive'],
        blockedUri: report['blocked-uri'],
        suggestion,
      },
      {
        severity: SecuritySeverity.INFO,
      }
    );
  }

  private generatePolicyAdjustment(report: CSPViolationReport): string {
    const directive = report['violated-directive'];
    const blockedUri = report['blocked-uri'];
    
    if (blockedUri === 'inline') {
      return `Consider adding a nonce or hash for inline ${directive}`;
    } else if (blockedUri.startsWith('https://')) {
      const domain = new URL(blockedUri).origin;
      return `Consider adding '${domain}' to ${directive}`;
    } else {
      return `Review and potentially whitelist '${blockedUri}' in ${directive}`;
    }
  }

  private setupViolationReporting(): void {
    // Set up CSP violation reporting endpoint
    if (typeof window !== 'undefined' && this.config.enableViolationReporting) {
      document.addEventListener('securitypolicyviolation', (event) => {
        const report: CSPViolationReport = {
          'document-uri': document.location.href,
          referrer: document.referrer,
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

        this.handleViolationReport(report);
      });
    }
  }

  private setupNonceRotation(): void {
    if (this.config.enableNonces) {
      setInterval(() => {
        const now = Date.now();
        for (const [sessionId, nonceData] of this.activeNonces.entries()) {
          if (now > nonceData.expiry) {
            this.activeNonces.delete(sessionId);
          }
        }
      }, 60000); // Check every minute
    }
  }
}

// React Hook for CSP
export function useCSP() {
  const cspService = CSPImplementationService.getInstance();

  const generateNonce = (sessionId?: string) => {
    return cspService.generateNonce(sessionId);
  };

  const getNonce = (sessionId?: string) => {
    return cspService.getNonce(sessionId);
  };

  const generateHash = async (content: string, algorithm?: 'sha256' | 'sha384' | 'sha512') => {
    return cspService.generateContentHash(content, algorithm);
  };

  const analyzeCSP = () => {
    return cspService.analyzeCSPSecurity();
  };

  return {
    generateNonce,
    getNonce,
    generateHash,
    analyzeCSP,
    service: cspService,
  };
}

// Global instance
export const cspImplementation = CSPImplementationService.getInstance();