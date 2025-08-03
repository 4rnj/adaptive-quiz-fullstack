/**
 * XSS Protection Utilities
 * Comprehensive Cross-Site Scripting protection mechanisms
 */

import DOMPurify from 'dompurify';
import { securityLogger, SecurityEventType, SecuritySeverity } from './securityLogging';
import { auditTrail, AuditCategory } from './auditTrail';

// XSS attack types
export enum XSSAttackType {
  REFLECTED = 'reflected',
  STORED = 'stored',
  DOM_BASED = 'dom_based',
  MUTATION_BASED = 'mutation_based',
  JAVASCRIPT_INJECTION = 'javascript_injection',
  HTML_INJECTION = 'html_injection',
  CSS_INJECTION = 'css_injection',
  ATTRIBUTE_INJECTION = 'attribute_injection',
}

// XSS threat levels
export enum XSSThreatLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// Content types for sanitization
export enum ContentType {
  HTML = 'html',
  TEXT = 'text',
  URL = 'url',
  CSS = 'css',
  JAVASCRIPT = 'javascript',
  JSON = 'json',
  XML = 'xml',
  MARKDOWN = 'markdown',
}

// XSS detection result
export interface XSSDetectionResult {
  isXSS: boolean;
  threatLevel: XSSThreatLevel;
  attackType: XSSAttackType[];
  maliciousPatterns: string[];
  sanitizedContent: string;
  confidence: number;
  recommendations: string[];
}

// Sanitization options
export interface SanitizationOptions {
  allowedTags?: string[];
  allowedAttributes?: Record<string, string[]>;
  allowedSchemes?: string[];
  stripComments?: boolean;
  stripWhitespace?: boolean;
  maxLength?: number;
  preserveEntities?: boolean;
  allowDataAttributes?: boolean;
  customRules?: Array<(content: string) => string>;
}

// XSS protection configuration
export interface XSSProtectionConfig {
  enableRealTimeDetection: boolean;
  enableContentSanitization: boolean;
  enableDOMProtection: boolean;
  enableAttributeValidation: boolean;
  blockSuspiciousContent: boolean;
  logDetections: boolean;
  alertOnCritical: boolean;
  maxContentLength: number;
  customPatterns: RegExp[];
  whitelistedDomains: string[];
  trustedSourceOrigins: string[];
}

/**
 * XSS Protection Service
 * Comprehensive Cross-Site Scripting protection and detection
 */
export class XSSProtectionService {
  private static instance: XSSProtectionService;
  private config: XSSProtectionConfig;
  private maliciousPatterns: Map<XSSAttackType, RegExp[]>;
  private blockedAttempts: Map<string, number>;
  private trustedContent: Set<string>;

  private constructor() {
    this.config = this.getDefaultConfig();
    this.maliciousPatterns = new Map();
    this.blockedAttempts = new Map();
    this.trustedContent = new Set();
    this.initializeMaliciousPatterns();
    this.setupDOMProtection();
  }

  public static getInstance(): XSSProtectionService {
    if (!XSSProtectionService.instance) {
      XSSProtectionService.instance = new XSSProtectionService();
    }
    return XSSProtectionService.instance;
  }

  /**
   * Configure XSS protection settings
   */
  public configure(config: Partial<XSSProtectionConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('🛡️ XSS Protection configured:', {
      realTimeDetection: this.config.enableRealTimeDetection,
      contentSanitization: this.config.enableContentSanitization,
      domProtection: this.config.enableDOMProtection,
    });
  }

  /**
   * Detect XSS attempts in content
   */
  public detectXSS(content: string, contentType: ContentType = ContentType.HTML): XSSDetectionResult {
    const startTime = performance.now();
    
    try {
      // Quick safety check
      if (!content || typeof content !== 'string') {
        return this.createSafeResult(content || '');
      }

      // Check content length
      if (content.length > this.config.maxContentLength) {
        return this.createThreatResult(
          content,
          XSSThreatLevel.MEDIUM,
          [XSSAttackType.HTML_INJECTION],
          ['Content exceeds maximum allowed length'],
          0.7
        );
      }

      // Detect malicious patterns
      const detectedAttacks: XSSAttackType[] = [];
      const maliciousPatterns: string[] = [];
      let confidence = 0;

      for (const [attackType, patterns] of this.maliciousPatterns) {
        for (const pattern of patterns) {
          const matches = content.match(pattern);
          if (matches) {
            detectedAttacks.push(attackType);
            maliciousPatterns.push(...matches);
            confidence += this.getAttackConfidence(attackType, matches);
          }
        }
      }

      // Determine threat level
      const threatLevel = this.calculateThreatLevel(detectedAttacks, confidence);
      
      // Sanitize content
      const sanitizedContent = this.sanitizeContent(content, contentType);

      // Log if malicious content detected
      if (detectedAttacks.length > 0) {
        this.logXSSAttempt(content, detectedAttacks, threatLevel, confidence);
      }

      const result: XSSDetectionResult = {
        isXSS: detectedAttacks.length > 0,
        threatLevel,
        attackType: detectedAttacks,
        maliciousPatterns,
        sanitizedContent,
        confidence: Math.min(confidence, 1.0),
        recommendations: this.generateRecommendations(detectedAttacks, threatLevel),
      };

      const duration = performance.now() - startTime;
      console.log(`🔍 XSS detection completed in ${duration.toFixed(2)}ms:`, {
        isXSS: result.isXSS,
        threatLevel: result.threatLevel,
        attackTypes: result.attackType.length,
      });

      return result;

    } catch (error) {
      console.error('❌ XSS detection failed:', error);
      
      // Return safe default on error
      return this.createSafeResult(content);
    }
  }

  /**
   * Sanitize content to remove XSS threats
   */
  public sanitizeContent(
    content: string, 
    contentType: ContentType = ContentType.HTML,
    options: SanitizationOptions = {}
  ): string {
    if (!content || typeof content !== 'string') {
      return '';
    }

    try {
      switch (contentType) {
        case ContentType.HTML:
          return this.sanitizeHTML(content, options);
        case ContentType.TEXT:
          return this.sanitizeText(content, options);
        case ContentType.URL:
          return this.sanitizeURL(content);
        case ContentType.CSS:
          return this.sanitizeCSS(content);
        case ContentType.JAVASCRIPT:
          return this.sanitizeJavaScript(content);
        case ContentType.JSON:
          return this.sanitizeJSON(content);
        case ContentType.MARKDOWN:
          return this.sanitizeMarkdown(content, options);
        default:
          return this.sanitizeText(content, options);
      }
    } catch (error) {
      console.error('❌ Content sanitization failed:', error);
      return '';
    }
  }

  /**
   * Validate and sanitize HTML attributes
   */
  public sanitizeAttribute(attributeName: string, attributeValue: string): string {
    if (!attributeName || !attributeValue) {
      return '';
    }

    // Block dangerous attributes
    const dangerousAttributes = [
      'onload', 'onerror', 'onclick', 'onmouseover', 'onfocus', 'onblur',
      'onchange', 'onsubmit', 'onreset', 'onselect', 'onabort',
      'javascript:', 'vbscript:', 'data:', 'livescript:', 'mocha:',
    ];

    const lowerAttr = attributeName.toLowerCase();
    const lowerValue = attributeValue.toLowerCase();

    // Check for dangerous attribute names
    if (dangerousAttributes.some(dangerous => lowerAttr.includes(dangerous))) {
      return '';
    }

    // Check for dangerous values
    if (dangerousAttributes.some(dangerous => lowerValue.includes(dangerous))) {
      return '';
    }

    // URL validation for href and src attributes
    if (['href', 'src', 'action', 'formaction'].includes(lowerAttr)) {
      return this.sanitizeURL(attributeValue);
    }

    // CSS validation for style attributes
    if (lowerAttr === 'style') {
      return this.sanitizeCSS(attributeValue);
    }

    return attributeValue;
  }

  /**
   * Protect against DOM-based XSS
   */
  public protectDOMManipulation(element: Element, content: string): boolean {
    if (!element || !content) {
      return false;
    }

    try {
      // Check if content is safe
      const detection = this.detectXSS(content);
      
      if (detection.isXSS && detection.threatLevel !== XSSThreatLevel.LOW) {
        console.warn('🚨 Blocked DOM manipulation attempt:', {
          element: element.tagName,
          threatLevel: detection.threatLevel,
          attackTypes: detection.attackType,
        });
        
        return false;
      }

      // Use sanitized content
      if (element instanceof HTMLElement) {
        element.innerHTML = detection.sanitizedContent;
      }

      return true;
    } catch (error) {
      console.error('❌ DOM protection failed:', error);
      return false;
    }
  }

  /**
   * Create trusted content that bypasses XSS detection
   */
  public createTrustedContent(content: string, reason: string): string {
    const hash = this.hashContent(content);
    this.trustedContent.add(hash);
    
    console.log('✅ Trusted content created:', { reason, hash: hash.substring(0, 8) });
    
    return content;
  }

  /**
   * Validate React props for XSS threats
   */
  public validateReactProps(props: Record<string, any>): Record<string, any> {
    const sanitizedProps: Record<string, any> = {};

    for (const [key, value] of Object.entries(props)) {
      if (typeof value === 'string') {
        // Special handling for dangerous props
        if (key === 'dangerouslySetInnerHTML') {
          if (value.__html) {
            const detection = this.detectXSS(value.__html);
            sanitizedProps[key] = {
              __html: detection.sanitizedContent,
            };
          }
        } else {
          sanitizedProps[key] = this.sanitizeContent(value, ContentType.TEXT);
        }
      } else if (typeof value === 'object' && value !== null) {
        sanitizedProps[key] = this.validateReactProps(value);
      } else {
        sanitizedProps[key] = value;
      }
    }

    return sanitizedProps;
  }

  /**
   * Get XSS protection statistics
   */
  public getProtectionStats(): {
    totalDetections: number;
    blockedAttempts: number;
    threatLevelDistribution: Record<XSSThreatLevel, number>;
    attackTypeDistribution: Record<XSSAttackType, number>;
    topBlockedIPs: Array<{ ip: string; attempts: number }>;
  } {
    const stats = {
      totalDetections: Array.from(this.blockedAttempts.values()).reduce((sum, count) => sum + count, 0),
      blockedAttempts: this.blockedAttempts.size,
      threatLevelDistribution: {
        [XSSThreatLevel.LOW]: 0,
        [XSSThreatLevel.MEDIUM]: 0,
        [XSSThreatLevel.HIGH]: 0,
        [XSSThreatLevel.CRITICAL]: 0,
      },
      attackTypeDistribution: {
        [XSSAttackType.REFLECTED]: 0,
        [XSSAttackType.STORED]: 0,
        [XSSAttackType.DOM_BASED]: 0,
        [XSSAttackType.MUTATION_BASED]: 0,
        [XSSAttackType.JAVASCRIPT_INJECTION]: 0,
        [XSSAttackType.HTML_INJECTION]: 0,
        [XSSAttackType.CSS_INJECTION]: 0,
        [XSSAttackType.ATTRIBUTE_INJECTION]: 0,
      },
      topBlockedIPs: Array.from(this.blockedAttempts.entries())
        .map(([ip, attempts]) => ({ ip, attempts }))
        .sort((a, b) => b.attempts - a.attempts)
        .slice(0, 10),
    };

    return stats;
  }

  /**
   * Private helper methods
   */

  private getDefaultConfig(): XSSProtectionConfig {
    return {
      enableRealTimeDetection: true,
      enableContentSanitization: true,
      enableDOMProtection: true,
      enableAttributeValidation: true,
      blockSuspiciousContent: true,
      logDetections: true,
      alertOnCritical: true,
      maxContentLength: 100000,
      customPatterns: [],
      whitelistedDomains: ['localhost', '127.0.0.1'],
      trustedSourceOrigins: [window.location.origin],
    };
  }

  private initializeMaliciousPatterns(): void {
    // JavaScript injection patterns
    this.maliciousPatterns.set(XSSAttackType.JAVASCRIPT_INJECTION, [
      /<script[^>]*>[\s\S]*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=\s*["'][^"']*["']/gi,
      /eval\s*\(/gi,
      /setTimeout\s*\(/gi,
      /setInterval\s*\(/gi,
      /Function\s*\(/gi,
      /new\s+Function/gi,
      /document\.write/gi,
      /document\.writeln/gi,
      /innerHTML\s*=/gi,
      /outerHTML\s*=/gi,
    ]);

    // HTML injection patterns
    this.maliciousPatterns.set(XSSAttackType.HTML_INJECTION, [
      /<iframe[^>]*>[\s\S]*?<\/iframe>/gi,
      /<object[^>]*>[\s\S]*?<\/object>/gi,
      /<embed[^>]*>/gi,
      /<form[^>]*>[\s\S]*?<\/form>/gi,
      /<input[^>]*>/gi,
      /<textarea[^>]*>[\s\S]*?<\/textarea>/gi,
      /<select[^>]*>[\s\S]*?<\/select>/gi,
      /<meta[^>]*>/gi,
      /<link[^>]*>/gi,
      /<base[^>]*>/gi,
    ]);

    // CSS injection patterns
    this.maliciousPatterns.set(XSSAttackType.CSS_INJECTION, [
      /expression\s*\(/gi,
      /javascript\s*:/gi,
      /vbscript\s*:/gi,
      /livescript\s*:/gi,
      /mocha\s*:/gi,
      /behavior\s*:/gi,
      /@import/gi,
      /binding\s*:/gi,
      /-moz-binding/gi,
    ]);

    // Attribute injection patterns
    this.maliciousPatterns.set(XSSAttackType.ATTRIBUTE_INJECTION, [
      /on\w+\s*=\s*[^>\s]+/gi,
      /style\s*=\s*["'][^"']*expression/gi,
      /href\s*=\s*["']javascript:/gi,
      /src\s*=\s*["']javascript:/gi,
      /action\s*=\s*["']javascript:/gi,
      /formaction\s*=\s*["']javascript:/gi,
    ]);

    // DOM-based XSS patterns
    this.maliciousPatterns.set(XSSAttackType.DOM_BASED, [
      /document\.location/gi,
      /document\.URL/gi,
      /document\.URLUnencoded/gi,
      /document\.referrer/gi,
      /window\.location/gi,
      /location\.href/gi,
      /location\.search/gi,
      /location\.hash/gi,
    ]);

    // Mutation-based XSS patterns
    this.maliciousPatterns.set(XSSAttackType.MUTATION_BASED, [
      /<!--[\s\S]*?-->/g,
      /<!\[CDATA\[[\s\S]*?\]\]>/g,
      /&[#x]?[a-zA-Z0-9]+;?/g,
      /%[0-9a-fA-F]{2}/g,
      /\\u[0-9a-fA-F]{4}/g,
      /\\x[0-9a-fA-F]{2}/g,
    ]);
  }

  private setupDOMProtection(): void {
    if (!this.config.enableDOMProtection || typeof window === 'undefined') {
      return;
    }

    // Override dangerous DOM methods
    const originalInnerHTML = Element.prototype.innerHTML;
    Element.prototype.innerHTML = function(this: Element, value?: string) {
      if (value !== undefined) {
        const xssService = XSSProtectionService.getInstance();
        const detection = xssService.detectXSS(value);
        
        if (detection.isXSS && detection.threatLevel !== XSSThreatLevel.LOW) {
          console.warn('🚨 Blocked innerHTML assignment:', {
            element: this.tagName,
            threatLevel: detection.threatLevel,
          });
          return;
        }
        
        originalInnerHTML.call(this, detection.sanitizedContent);
      }
      
      return originalInnerHTML.call(this);
    } as any;

    // Monitor script tag creation
    const originalCreateElement = document.createElement;
    document.createElement = function(tagName: string, options?: ElementCreationOptions) {
      const element = originalCreateElement.call(this, tagName, options);
      
      if (tagName.toLowerCase() === 'script') {
        console.warn('🚨 Script element created - monitoring for XSS');
        
        // Override src setter
        const originalSrcSet = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src')?.set;
        if (originalSrcSet) {
          Object.defineProperty(element, 'src', {
            set: function(value: string) {
              const xssService = XSSProtectionService.getInstance();
              const sanitizedSrc = xssService.sanitizeURL(value);
              
              if (sanitizedSrc !== value) {
                console.warn('🚨 Blocked malicious script src:', value);
                return;
              }
              
              originalSrcSet.call(this, value);
            },
            get: function() {
              return (this as HTMLScriptElement).getAttribute('src');
            },
          });
        }
      }
      
      return element;
    };
  }

  private sanitizeHTML(content: string, options: SanitizationOptions = {}): string {
    const config = {
      ALLOWED_TAGS: options.allowedTags || [
        'p', 'br', 'strong', 'em', 'u', 'b', 'i', 'span', 'div',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
        'a', 'img', 'table', 'tr', 'td', 'th', 'thead', 'tbody',
      ],
      ALLOWED_ATTR: options.allowedAttributes || {
        'a': ['href', 'title', 'target'],
        'img': ['src', 'alt', 'title', 'width', 'height'],
        'span': ['class'],
        'div': ['class'],
        'p': ['class'],
      },
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      STRIP_COMMENTS: options.stripComments !== false,
      STRIP_WHITESPACE: options.stripWhitespace === true,
      SANITIZE_DOM: true,
      KEEP_CONTENT: true,
    };

    let sanitized = DOMPurify.sanitize(content, config);

    // Apply custom rules
    if (options.customRules) {
      for (const rule of options.customRules) {
        sanitized = rule(sanitized);
      }
    }

    // Limit content length
    if (options.maxLength && sanitized.length > options.maxLength) {
      sanitized = sanitized.substring(0, options.maxLength) + '...';
    }

    return sanitized;
  }

  private sanitizeText(content: string, options: SanitizationOptions = {}): string {
    let sanitized = content
      .replace(/[<>]/g, '') // Remove HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');

    // Apply custom rules
    if (options.customRules) {
      for (const rule of options.customRules) {
        sanitized = rule(sanitized);
      }
    }

    // Limit content length
    if (options.maxLength && sanitized.length > options.maxLength) {
      sanitized = sanitized.substring(0, options.maxLength) + '...';
    }

    return sanitized;
  }

  private sanitizeURL(url: string): string {
    if (!url || typeof url !== 'string') {
      return '';
    }

    try {
      // Remove dangerous protocols
      const dangerousProtocols = [
        'javascript:', 'vbscript:', 'livescript:', 'mocha:',
        'data:', 'about:', 'chrome:', 'chrome-extension:',
      ];

      const lowerURL = url.toLowerCase().trim();
      
      for (const protocol of dangerousProtocols) {
        if (lowerURL.startsWith(protocol)) {
          return '';
        }
      }

      // Validate URL format
      const urlObj = new URL(url, window.location.origin);
      
      // Only allow safe protocols
      const allowedProtocols = ['http:', 'https:', 'mailto:', 'tel:', 'ftp:'];
      if (!allowedProtocols.includes(urlObj.protocol)) {
        return '';
      }

      return urlObj.toString();
    } catch {
      // Invalid URL format
      return '';
    }
  }

  private sanitizeCSS(css: string): string {
    if (!css || typeof css !== 'string') {
      return '';
    }

    return css
      .replace(/expression\s*\(/gi, '') // Remove CSS expressions
      .replace(/javascript\s*:/gi, '') // Remove javascript: in CSS
      .replace(/vbscript\s*:/gi, '') // Remove vbscript: in CSS
      .replace(/@import/gi, '') // Remove @import
      .replace(/behavior\s*:/gi, '') // Remove behavior property
      .replace(/-moz-binding/gi, '') // Remove -moz-binding
      .replace(/binding\s*:/gi, ''); // Remove binding property
  }

  private sanitizeJavaScript(js: string): string {
    // For security, we don't allow any JavaScript content
    // This should only be used in very specific trusted contexts
    console.warn('🚨 JavaScript content sanitization - content blocked');
    return '';
  }

  private sanitizeJSON(json: string): string {
    try {
      const parsed = JSON.parse(json);
      const sanitized = this.sanitizeObject(parsed);
      return JSON.stringify(sanitized);
    } catch {
      return '';
    }
  }

  private sanitizeObject(obj: any): any {
    if (typeof obj === 'string') {
      return this.sanitizeText(obj);
    } else if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    } else if (typeof obj === 'object' && obj !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[this.sanitizeText(key)] = this.sanitizeObject(value);
      }
      return sanitized;
    }
    return obj;
  }

  private sanitizeMarkdown(content: string, options: SanitizationOptions = {}): string {
    // Basic markdown sanitization - remove dangerous patterns
    let sanitized = content
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, ''); // Remove iframes

    // Apply additional HTML sanitization
    return this.sanitizeHTML(sanitized, options);
  }

  private getAttackConfidence(attackType: XSSAttackType, matches: RegExpMatchArray): number {
    const baseConfidence = {
      [XSSAttackType.JAVASCRIPT_INJECTION]: 0.3,
      [XSSAttackType.HTML_INJECTION]: 0.25,
      [XSSAttackType.CSS_INJECTION]: 0.2,
      [XSSAttackType.ATTRIBUTE_INJECTION]: 0.25,
      [XSSAttackType.DOM_BASED]: 0.35,
      [XSSAttackType.MUTATION_BASED]: 0.15,
      [XSSAttackType.REFLECTED]: 0.2,
      [XSSAttackType.STORED]: 0.3,
    };

    return (baseConfidence[attackType] || 0.2) * Math.min(matches.length, 3);
  }

  private calculateThreatLevel(attackTypes: XSSAttackType[], confidence: number): XSSThreatLevel {
    if (confidence >= 0.8) return XSSThreatLevel.CRITICAL;
    if (confidence >= 0.6) return XSSThreatLevel.HIGH;
    if (confidence >= 0.3) return XSSThreatLevel.MEDIUM;
    return XSSThreatLevel.LOW;
  }

  private generateRecommendations(attackTypes: XSSAttackType[], threatLevel: XSSThreatLevel): string[] {
    const recommendations: string[] = [];

    if (attackTypes.includes(XSSAttackType.JAVASCRIPT_INJECTION)) {
      recommendations.push('Implement strict Content Security Policy (CSP)');
      recommendations.push('Disable inline JavaScript execution');
      recommendations.push('Use trusted types for DOM manipulation');
    }

    if (attackTypes.includes(XSSAttackType.HTML_INJECTION)) {
      recommendations.push('Sanitize all HTML content before rendering');
      recommendations.push('Use a whitelist approach for allowed HTML tags');
    }

    if (attackTypes.includes(XSSAttackType.DOM_BASED)) {
      recommendations.push('Validate all DOM manipulation operations');
      recommendations.push('Avoid using dangerous DOM properties like innerHTML');
    }

    if (threatLevel === XSSThreatLevel.CRITICAL) {
      recommendations.push('Block the request immediately');
      recommendations.push('Alert security team');
      recommendations.push('Review application security measures');
    }

    return recommendations;
  }

  private createSafeResult(content: string): XSSDetectionResult {
    return {
      isXSS: false,
      threatLevel: XSSThreatLevel.LOW,
      attackType: [],
      maliciousPatterns: [],
      sanitizedContent: this.sanitizeContent(content, ContentType.TEXT),
      confidence: 0,
      recommendations: [],
    };
  }

  private createThreatResult(
    content: string,
    threatLevel: XSSThreatLevel,
    attackTypes: XSSAttackType[],
    patterns: string[],
    confidence: number
  ): XSSDetectionResult {
    return {
      isXSS: true,
      threatLevel,
      attackType: attackTypes,
      maliciousPatterns: patterns,
      sanitizedContent: this.sanitizeContent(content),
      confidence,
      recommendations: this.generateRecommendations(attackTypes, threatLevel),
    };
  }

  private async logXSSAttempt(
    content: string,
    attackTypes: XSSAttackType[],
    threatLevel: XSSThreatLevel,
    confidence: number
  ): Promise<void> {
    if (!this.config.logDetections) {
      return;
    }

    const clientIP = this.getClientIP();
    const currentAttempts = this.blockedAttempts.get(clientIP) || 0;
    this.blockedAttempts.set(clientIP, currentAttempts + 1);

    await securityLogger.logEvent(
      SecurityEventType.SECURITY_INCIDENT,
      {
        type: 'xss_attempt_detected',
        threatLevel,
        attackTypes,
        confidence,
        content: content.substring(0, 500), // Log first 500 chars
        clientIP,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      },
      {
        severity: threatLevel === XSSThreatLevel.CRITICAL ? SecuritySeverity.CRITICAL : SecuritySeverity.HIGH,
      }
    );

    await auditTrail.logAuditEvent(
      AuditCategory.SECURITY,
      'xss_protection_triggered',
      {
        actor: {
          type: 'user',
          id: clientIP,
        },
        target: {
          type: 'application',
          id: 'xss_protection',
          name: 'XSS Protection System',
        },
        result: 'blocked',
        context: {
          component: 'xss_protection',
          operation: 'content_sanitization',
          threatLevel,
          attackTypes: attackTypes.join(', '),
          confidence: confidence.toFixed(2),
        },
        riskLevel: threatLevel === XSSThreatLevel.CRITICAL ? 'critical' : 'high',
      }
    );

    if (threatLevel === XSSThreatLevel.CRITICAL && this.config.alertOnCritical) {
      console.error('🚨 CRITICAL XSS ATTEMPT DETECTED:', {
        threatLevel,
        attackTypes,
        confidence,
        clientIP,
      });
    }
  }

  private getClientIP(): string {
    // In a real application, this would be determined by the server
    return 'unknown';
  }

  private hashContent(content: string): string {
    // Simple hash function for content identification
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }
}

// React Hook for XSS Protection
export function useXSSProtection() {
  const xssService = XSSProtectionService.getInstance();

  const sanitize = (content: string, contentType: ContentType = ContentType.HTML) => {
    return xssService.sanitizeContent(content, contentType);
  };

  const detectXSS = (content: string, contentType: ContentType = ContentType.HTML) => {
    return xssService.detectXSS(content, contentType);
  };

  const validateProps = (props: Record<string, any>) => {
    return xssService.validateReactProps(props);
  };

  const protectDOM = (element: Element, content: string) => {
    return xssService.protectDOMManipulation(element, content);
  };

  return {
    sanitize,
    detectXSS,
    validateProps,
    protectDOM,
    service: xssService,
  };
}

// Safe HTML component for React
export interface SafeHTMLProps {
  content: string;
  contentType?: ContentType;
  sanitizationOptions?: SanitizationOptions;
  onXSSDetected?: (result: XSSDetectionResult) => void;
  fallbackContent?: string;
  className?: string;
  style?: React.CSSProperties;
}

// Global instance
export const xssProtection = XSSProtectionService.getInstance();