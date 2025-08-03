/**
 * Threat Detection Engine
 * Real-time threat detection with machine learning-inspired anomaly detection
 */

import { 
  SecurityEventType, 
  SecuritySeverity, 
  securityLogger,
  SecurityLogEntry,
  RISK_THRESHOLDS
} from './securityLogging';

// Threat patterns and signatures
export interface ThreatPattern {
  id: string;
  name: string;
  description: string;
  patterns: {
    eventSequence?: SecurityEventType[];
    timeWindow?: number; // milliseconds
    threshold?: number;
    conditions?: Array<(events: SecurityLogEntry[]) => boolean>;
  };
  severity: SecuritySeverity;
  riskMultiplier: number;
  mitigations: string[];
}

// User behavior baseline
export interface UserBehaviorBaseline {
  userId: string;
  normalLoginTimes: { start: number; end: number }[];
  normalLocations: string[];
  normalDevices: string[];
  avgRequestsPerMinute: number;
  commonResources: string[];
  lastUpdated: number;
}

// Anomaly detection results
export interface AnomalyDetectionResult {
  isAnomaly: boolean;
  anomalyScore: number;
  anomalyTypes: string[];
  confidence: number;
  suggestedActions: string[];
  relatedEvents?: SecurityLogEntry[];
}

// Threat intelligence feed
export interface ThreatIntelligence {
  blockedIPs: Set<string>;
  knownMaliciousPatterns: RegExp[];
  suspiciousUserAgents: string[];
  commonAttackVectors: string[];
  lastUpdated: number;
}

/**
 * Threat Detection Engine
 * Implements real-time threat detection and anomaly analysis
 */
export class ThreatDetectionEngine {
  private static instance: ThreatDetectionEngine;
  private threatPatterns: Map<string, ThreatPattern> = new Map();
  private userBaselines: Map<string, UserBehaviorBaseline> = new Map();
  private threatIntelligence: ThreatIntelligence;
  private detectionThresholds = {
    loginFailureThreshold: 3,
    requestRateThreshold: 60, // requests per minute
    anomalyScoreThreshold: 0.7,
    baselineLearningPeriod: 7 * 24 * 60 * 60 * 1000, // 7 days
  };

  private constructor() {
    this.initializeThreatPatterns();
    this.threatIntelligence = this.initializeThreatIntelligence();
    this.startContinuousMonitoring();
  }

  public static getInstance(): ThreatDetectionEngine {
    if (!ThreatDetectionEngine.instance) {
      ThreatDetectionEngine.instance = new ThreatDetectionEngine();
    }
    return ThreatDetectionEngine.instance;
  }

  /**
   * Analyze security event for threats
   */
  public async analyzeEvent(event: SecurityLogEntry): Promise<AnomalyDetectionResult> {
    const anomalies: string[] = [];
    let anomalyScore = 0;
    const suggestedActions: string[] = [];
    const relatedEvents: SecurityLogEntry[] = [];

    // Check against threat intelligence
    const threatIntelResult = this.checkThreatIntelligence(event);
    if (threatIntelResult.isThreat) {
      anomalies.push(...threatIntelResult.threats);
      anomalyScore += 0.5;
    }

    // Check for known attack patterns
    const patternResult = await this.checkThreatPatterns(event);
    if (patternResult.matches.length > 0) {
      anomalies.push(...patternResult.matches.map(p => p.name));
      anomalyScore += patternResult.totalRisk;
      suggestedActions.push(...patternResult.mitigations);
    }

    // Behavioral analysis for authenticated users
    if (event.userId) {
      const behaviorResult = await this.analyzeBehavior(event);
      if (behaviorResult.isAnomaly) {
        anomalies.push(...behaviorResult.anomalies);
        anomalyScore += behaviorResult.score;
        relatedEvents.push(...behaviorResult.relatedEvents);
      }
    }

    // Statistical anomaly detection
    const statisticalResult = await this.detectStatisticalAnomalies(event);
    if (statisticalResult.isAnomaly) {
      anomalies.push(...statisticalResult.anomalies);
      anomalyScore += statisticalResult.score;
    }

    // Normalize anomaly score
    anomalyScore = Math.min(anomalyScore, 1.0);

    // Determine suggested actions based on score
    if (anomalyScore >= RISK_THRESHOLDS.CRITICAL) {
      suggestedActions.push('immediate_block', 'notify_security_team', 'force_logout');
    } else if (anomalyScore >= RISK_THRESHOLDS.HIGH) {
      suggestedActions.push('require_2fa', 'monitor_closely', 'rate_limit');
    } else if (anomalyScore >= RISK_THRESHOLDS.MEDIUM) {
      suggestedActions.push('log_activity', 'send_warning');
    }

    // Log threat detection results
    if (anomalyScore >= this.detectionThresholds.anomalyScoreThreshold) {
      await securityLogger.logEvent(
        SecurityEventType.SUSPICIOUS_ACTIVITY,
        {
          originalEvent: event.id,
          anomalyScore,
          anomalies,
          suggestedActions,
        },
        {
          severity: this.calculateSeverityFromScore(anomalyScore),
          userId: event.userId,
          sessionId: event.sessionId,
        }
      );
    }

    return {
      isAnomaly: anomalyScore >= this.detectionThresholds.anomalyScoreThreshold,
      anomalyScore,
      anomalyTypes: anomalies,
      confidence: this.calculateConfidence(anomalies.length, anomalyScore),
      suggestedActions,
      relatedEvents,
    };
  }

  /**
   * Update user behavior baseline
   */
  public async updateUserBaseline(userId: string): Promise<void> {
    const userEvents = await this.getUserEvents(userId, this.detectionThresholds.baselineLearningPeriod);
    
    if (userEvents.length < 100) {
      // Not enough data for baseline
      return;
    }

    const baseline: UserBehaviorBaseline = {
      userId,
      normalLoginTimes: this.extractNormalLoginTimes(userEvents),
      normalLocations: this.extractNormalLocations(userEvents),
      normalDevices: this.extractNormalDevices(userEvents),
      avgRequestsPerMinute: this.calculateAvgRequestRate(userEvents),
      commonResources: this.extractCommonResources(userEvents),
      lastUpdated: Date.now(),
    };

    this.userBaselines.set(userId, baseline);
  }

  /**
   * Check for brute force attacks
   */
  public async detectBruteForce(
    identifier: string,
    timeWindow: number = 5 * 60 * 1000 // 5 minutes
  ): Promise<boolean> {
    const recentEvents = await this.getRecentEvents(timeWindow);
    const failedLogins = recentEvents.filter(
      event => 
        event.eventType === SecurityEventType.LOGIN_FAILURE &&
        (event.userId === identifier || event.ipAddress === identifier)
    );

    if (failedLogins.length >= this.detectionThresholds.loginFailureThreshold) {
      await securityLogger.logEvent(
        SecurityEventType.BRUTE_FORCE_DETECTED,
        {
          identifier,
          attempts: failedLogins.length,
          timeWindow,
          firstAttempt: failedLogins[0].timestamp,
          lastAttempt: failedLogins[failedLogins.length - 1].timestamp,
        },
        {
          severity: SecuritySeverity.CRITICAL,
        }
      );
      return true;
    }

    return false;
  }

  /**
   * Detect injection attempts
   */
  public detectInjectionAttempt(input: string): {
    isInjection: boolean;
    type?: string;
    confidence: number;
  } {
    const patterns = {
      sql: [
        /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b.*\b(from|where|table|database)\b)/i,
        /('|")\s*;\s*(drop|delete|update|insert|select)/i,
        /\b(or|and)\s+\d+\s*=\s*\d+/i,
        /'\s*(or|and)\s+'[^']*'\s*=\s*'[^']*'/i,
      ],
      xss: [
        /<script[^>]*>[\s\S]*?<\/script>/gi,
        /<iframe[^>]*>[\s\S]*?<\/iframe>/gi,
        /javascript:\s*[^"]*/gi,
        /on\w+\s*=\s*["'][^"']*["']/gi,
        /<img[^>]+src[\\s]*=[\\s]*["']javascript:/gi,
      ],
      command: [
        /;\s*(ls|cat|rm|cp|mv|chmod|chown|wget|curl|nc|netcat)\s/i,
        /\|\s*(ls|cat|rm|cp|mv|chmod|chown|wget|curl|nc|netcat)\s/i,
        /`[^`]*`/g,
        /\$\([^)]+\)/g,
      ],
      path: [
        /\.\.[\/\\]/g,
        /\/etc\/(passwd|shadow|hosts)/i,
        /\/proc\/self/i,
        /\/var\/log/i,
      ],
    };

    for (const [type, typePatterns] of Object.entries(patterns)) {
      for (const pattern of typePatterns) {
        if (pattern.test(input)) {
          return {
            isInjection: true,
            type,
            confidence: 0.9,
          };
        }
      }
    }

    // Check for suspicious encoding
    if (this.hasSuspiciousEncoding(input)) {
      return {
        isInjection: true,
        type: 'encoding',
        confidence: 0.7,
      };
    }

    return {
      isInjection: false,
      confidence: 0,
    };
  }

  /**
   * Detect rate limit violations
   */
  public async detectRateLimitViolation(
    identifier: string,
    timeWindow: number = 60 * 1000 // 1 minute
  ): Promise<boolean> {
    const recentEvents = await this.getRecentEvents(timeWindow);
    const userRequests = recentEvents.filter(
      event => event.userId === identifier || event.ipAddress === identifier
    );

    const requestRate = userRequests.length;
    
    if (requestRate > this.detectionThresholds.requestRateThreshold) {
      await securityLogger.logEvent(
        SecurityEventType.RATE_LIMIT_EXCEEDED,
        {
          identifier,
          requestCount: requestRate,
          timeWindow,
          threshold: this.detectionThresholds.requestRateThreshold,
        },
        {
          severity: SecuritySeverity.MEDIUM,
        }
      );
      return true;
    }

    return false;
  }

  /**
   * Get threat assessment for a user
   */
  public async getUserThreatAssessment(userId: string): Promise<{
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    riskScore: number;
    recentThreats: string[];
    recommendations: string[];
  }> {
    const timeWindow = 24 * 60 * 60 * 1000; // 24 hours
    const userEvents = await this.getUserEvents(userId, timeWindow);
    
    let riskScore = 0;
    const threats: string[] = [];
    const recommendations: string[] = [];

    // Calculate risk based on recent events
    const suspiciousEvents = userEvents.filter(
      event => event.severity === SecuritySeverity.HIGH || 
               event.severity === SecuritySeverity.CRITICAL
    );

    if (suspiciousEvents.length > 0) {
      riskScore += suspiciousEvents.length * 0.2;
      threats.push(`${suspiciousEvents.length} suspicious events`);
    }

    // Check for failed logins
    const failedLogins = userEvents.filter(
      event => event.eventType === SecurityEventType.LOGIN_FAILURE
    );

    if (failedLogins.length > 2) {
      riskScore += 0.3;
      threats.push(`${failedLogins.length} failed login attempts`);
      recommendations.push('Enable two-factor authentication');
    }

    // Check for anomalies
    const anomalousEvents = userEvents.filter(
      event => event.anomalyIndicators && event.anomalyIndicators.length > 0
    );

    if (anomalousEvents.length > 0) {
      riskScore += anomalousEvents.length * 0.1;
      threats.push(`${anomalousEvents.length} anomalous behaviors`);
      recommendations.push('Review recent activity');
    }

    // Normalize risk score
    riskScore = Math.min(riskScore, 1.0);

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (riskScore >= RISK_THRESHOLDS.CRITICAL) {
      riskLevel = 'critical';
      recommendations.push('Immediate security review required');
    } else if (riskScore >= RISK_THRESHOLDS.HIGH) {
      riskLevel = 'high';
      recommendations.push('Monitor account closely');
    } else if (riskScore >= RISK_THRESHOLDS.MEDIUM) {
      riskLevel = 'medium';
      recommendations.push('Review security settings');
    } else {
      riskLevel = 'low';
    }

    return {
      riskLevel,
      riskScore,
      recentThreats: threats,
      recommendations,
    };
  }

  /**
   * Private helper methods
   */

  private initializeThreatPatterns(): void {
    // Brute force pattern
    this.threatPatterns.set('brute_force', {
      id: 'brute_force',
      name: 'Brute Force Attack',
      description: 'Multiple failed login attempts',
      patterns: {
        eventSequence: [SecurityEventType.LOGIN_FAILURE],
        timeWindow: 5 * 60 * 1000,
        threshold: 3,
      },
      severity: SecuritySeverity.HIGH,
      riskMultiplier: 1.5,
      mitigations: ['block_ip', 'require_captcha'],
    });

    // Credential stuffing pattern
    this.threatPatterns.set('credential_stuffing', {
      id: 'credential_stuffing',
      name: 'Credential Stuffing',
      description: 'Rapid login attempts from multiple IPs',
      patterns: {
        timeWindow: 10 * 60 * 1000,
        conditions: [(events) => {
          const uniqueIPs = new Set(events.map(e => e.ipAddress));
          const loginAttempts = events.filter(e => 
            e.eventType === SecurityEventType.LOGIN_ATTEMPT ||
            e.eventType === SecurityEventType.LOGIN_FAILURE
          );
          return uniqueIPs.size > 5 && loginAttempts.length > 20;
        }],
      },
      severity: SecuritySeverity.CRITICAL,
      riskMultiplier: 2.0,
      mitigations: ['enable_2fa', 'notify_user'],
    });

    // Session hijacking pattern
    this.threatPatterns.set('session_hijack', {
      id: 'session_hijack',
      name: 'Session Hijacking Attempt',
      description: 'Session used from different location/device',
      patterns: {
        conditions: [(events) => {
          const sessions = new Map<string, Set<string>>();
          events.forEach(event => {
            if (event.sessionId && event.ipAddress) {
              if (!sessions.has(event.sessionId)) {
                sessions.set(event.sessionId, new Set());
              }
              sessions.get(event.sessionId)!.add(event.ipAddress);
            }
          });
          return Array.from(sessions.values()).some(ips => ips.size > 1);
        }],
      },
      severity: SecuritySeverity.CRITICAL,
      riskMultiplier: 2.5,
      mitigations: ['invalidate_session', 'force_reauth'],
    });

    // Data exfiltration pattern
    this.threatPatterns.set('data_exfiltration', {
      id: 'data_exfiltration',
      name: 'Data Exfiltration Attempt',
      description: 'Unusual data access patterns',
      patterns: {
        timeWindow: 15 * 60 * 1000,
        conditions: [(events) => {
          const dataEvents = events.filter(e => 
            e.eventType === SecurityEventType.DATA_ACCESS ||
            e.eventType === SecurityEventType.DATA_EXPORT
          );
          return dataEvents.length > 50;
        }],
      },
      severity: SecuritySeverity.HIGH,
      riskMultiplier: 1.8,
      mitigations: ['rate_limit', 'alert_admin'],
    });
  }

  private initializeThreatIntelligence(): ThreatIntelligence {
    return {
      blockedIPs: new Set([
        // Known malicious IPs would be loaded from threat feeds
      ]),
      knownMaliciousPatterns: [
        /\beval\s*\(/gi,
        /\bexec\s*\(/gi,
        /\bsystem\s*\(/gi,
        /__proto__/gi,
        /constructor\s*\[/gi,
      ],
      suspiciousUserAgents: [
        'sqlmap',
        'nikto',
        'nmap',
        'metasploit',
        'burpsuite',
      ],
      commonAttackVectors: [
        '../',
        '<script',
        'javascript:',
        'onerror=',
        'onload=',
      ],
      lastUpdated: Date.now(),
    };
  }

  private async checkThreatPatterns(event: SecurityLogEntry): Promise<{
    matches: ThreatPattern[];
    totalRisk: number;
    mitigations: string[];
  }> {
    const matches: ThreatPattern[] = [];
    let totalRisk = 0;
    const mitigations = new Set<string>();

    for (const pattern of this.threatPatterns.values()) {
      if (await this.matchesPattern(event, pattern)) {
        matches.push(pattern);
        totalRisk += pattern.riskMultiplier * 0.2;
        pattern.mitigations.forEach(m => mitigations.add(m));
      }
    }

    return {
      matches,
      totalRisk: Math.min(totalRisk, 0.5),
      mitigations: Array.from(mitigations),
    };
  }

  private async matchesPattern(event: SecurityLogEntry, pattern: ThreatPattern): Promise<boolean> {
    const { patterns } = pattern;
    
    if (patterns.eventSequence && patterns.timeWindow && patterns.threshold) {
      const recentEvents = await this.getRecentEvents(patterns.timeWindow);
      const matchingEvents = recentEvents.filter(e => 
        patterns.eventSequence!.includes(e.eventType) &&
        (e.userId === event.userId || e.ipAddress === event.ipAddress)
      );
      
      if (matchingEvents.length >= patterns.threshold) {
        return true;
      }
    }

    if (patterns.conditions) {
      const recentEvents = await this.getRecentEvents(patterns.timeWindow || 60000);
      const relevantEvents = recentEvents.filter(e => 
        e.userId === event.userId || e.ipAddress === event.ipAddress
      );
      
      return patterns.conditions.every(condition => condition(relevantEvents));
    }

    return false;
  }

  private checkThreatIntelligence(event: SecurityLogEntry): {
    isThreat: boolean;
    threats: string[];
  } {
    const threats: string[] = [];

    // Check blocked IPs
    if (event.ipAddress && this.threatIntelligence.blockedIPs.has(event.ipAddress)) {
      threats.push('blocked_ip');
    }

    // Check user agent
    if (event.userAgent) {
      const userAgentLower = event.userAgent.toLowerCase();
      if (this.threatIntelligence.suspiciousUserAgents.some(ua => userAgentLower.includes(ua))) {
        threats.push('suspicious_user_agent');
      }
    }

    // Check for malicious patterns in event details
    const detailsStr = JSON.stringify(event.details);
    if (this.threatIntelligence.knownMaliciousPatterns.some(pattern => pattern.test(detailsStr))) {
      threats.push('malicious_pattern');
    }

    return {
      isThreat: threats.length > 0,
      threats,
    };
  }

  private async analyzeBehavior(event: SecurityLogEntry): Promise<{
    isAnomaly: boolean;
    anomalies: string[];
    score: number;
    relatedEvents: SecurityLogEntry[];
  }> {
    if (!event.userId) {
      return { isAnomaly: false, anomalies: [], score: 0, relatedEvents: [] };
    }

    const baseline = this.userBaselines.get(event.userId);
    if (!baseline) {
      // No baseline yet, can't detect anomalies
      return { isAnomaly: false, anomalies: [], score: 0, relatedEvents: [] };
    }

    const anomalies: string[] = [];
    let score = 0;

    // Check login time
    if (event.eventType === SecurityEventType.LOGIN_SUCCESS) {
      const hour = new Date(event.timestamp).getHours();
      const isNormalTime = baseline.normalLoginTimes.some(
        range => hour >= range.start && hour <= range.end
      );
      
      if (!isNormalTime) {
        anomalies.push('unusual_login_time');
        score += 0.2;
      }
    }

    // Check location
    if (event.location && baseline.normalLocations.length > 0) {
      const location = `${event.location.country}-${event.location.region}`;
      if (!baseline.normalLocations.includes(location)) {
        anomalies.push('unusual_location');
        score += 0.3;
      }
    }

    // Check device
    if (event.deviceId && !baseline.normalDevices.includes(event.deviceId)) {
      anomalies.push('unusual_device');
      score += 0.2;
    }

    // Check request rate
    const recentEvents = await this.getUserEvents(event.userId, 60000); // Last minute
    const currentRate = recentEvents.length;
    if (currentRate > baseline.avgRequestsPerMinute * 3) {
      anomalies.push('abnormal_request_rate');
      score += 0.3;
    }

    return {
      isAnomaly: anomalies.length > 0,
      anomalies,
      score: Math.min(score, 0.5),
      relatedEvents: recentEvents,
    };
  }

  private async detectStatisticalAnomalies(event: SecurityLogEntry): Promise<{
    isAnomaly: boolean;
    anomalies: string[];
    score: number;
  }> {
    const anomalies: string[] = [];
    let score = 0;

    // Time-based anomalies
    const hour = new Date(event.timestamp).getHours();
    if (hour >= 2 && hour <= 5) {
      anomalies.push('unusual_hour');
      score += 0.1;
    }

    // Weekend activity
    const dayOfWeek = new Date(event.timestamp).getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      if (event.eventType === SecurityEventType.DATA_EXPORT) {
        anomalies.push('weekend_data_export');
        score += 0.2;
      }
    }

    // Rapid event succession
    const recentEvents = await this.getRecentEvents(1000); // Last second
    if (recentEvents.length > 10) {
      anomalies.push('rapid_events');
      score += 0.3;
    }

    return {
      isAnomaly: anomalies.length > 0,
      anomalies,
      score: Math.min(score, 0.3),
    };
  }

  private calculateSeverityFromScore(score: number): SecuritySeverity {
    if (score >= RISK_THRESHOLDS.CRITICAL) return SecuritySeverity.CRITICAL;
    if (score >= RISK_THRESHOLDS.HIGH) return SecuritySeverity.HIGH;
    if (score >= RISK_THRESHOLDS.MEDIUM) return SecuritySeverity.MEDIUM;
    if (score >= RISK_THRESHOLDS.LOW) return SecuritySeverity.LOW;
    return SecuritySeverity.INFO;
  }

  private calculateConfidence(anomalyCount: number, score: number): number {
    // More anomalies and higher score = higher confidence
    const baseConfidence = Math.min(anomalyCount * 0.2, 0.6);
    const scoreConfidence = score * 0.4;
    return Math.min(baseConfidence + scoreConfidence, 1.0);
  }

  private hasSuspiciousEncoding(input: string): boolean {
    // Check for various encoding attempts
    const encodingPatterns = [
      /%[0-9a-fA-F]{2}/g, // URL encoding
      /\\x[0-9a-fA-F]{2}/g, // Hex encoding
      /\\u[0-9a-fA-F]{4}/g, // Unicode encoding
      /&#x?[0-9]+;/g, // HTML entity encoding
    ];

    let encodedCount = 0;
    for (const pattern of encodingPatterns) {
      const matches = input.match(pattern);
      if (matches) {
        encodedCount += matches.length;
      }
    }

    // If more than 20% of the input appears to be encoded, it's suspicious
    return encodedCount > input.length * 0.2;
  }

  private async getRecentEvents(timeWindow: number): Promise<SecurityLogEntry[]> {
    const cutoff = Date.now() - timeWindow;
    return securityLogger.getRecentEvents(1000).filter(
      event => event.timestamp >= cutoff
    );
  }

  private async getUserEvents(userId: string, timeWindow: number): Promise<SecurityLogEntry[]> {
    const cutoff = Date.now() - timeWindow;
    return securityLogger.getUserActivityTimeline(userId, cutoff, Date.now());
  }

  private extractNormalLoginTimes(events: SecurityLogEntry[]): UserBehaviorBaseline['normalLoginTimes'] {
    const loginEvents = events.filter(e => e.eventType === SecurityEventType.LOGIN_SUCCESS);
    const hours = loginEvents.map(e => new Date(e.timestamp).getHours());
    
    if (hours.length === 0) return [];
    
    // Simple clustering of login hours
    const minHour = Math.min(...hours);
    const maxHour = Math.max(...hours);
    
    return [{
      start: Math.max(minHour - 1, 0),
      end: Math.min(maxHour + 1, 23),
    }];
  }

  private extractNormalLocations(events: SecurityLogEntry[]): string[] {
    const locations = new Set<string>();
    events.forEach(event => {
      if (event.location) {
        locations.add(`${event.location.country}-${event.location.region}`);
      }
    });
    return Array.from(locations);
  }

  private extractNormalDevices(events: SecurityLogEntry[]): string[] {
    const devices = new Set<string>();
    events.forEach(event => {
      if (event.deviceId) {
        devices.add(event.deviceId);
      }
    });
    return Array.from(devices);
  }

  private calculateAvgRequestRate(events: SecurityLogEntry[]): number {
    if (events.length === 0) return 0;
    
    const timeSpan = events[events.length - 1].timestamp - events[0].timestamp;
    const minutes = timeSpan / (60 * 1000);
    
    return minutes > 0 ? events.length / minutes : 0;
  }

  private extractCommonResources(events: SecurityLogEntry[]): string[] {
    const resourceCounts = new Map<string, number>();
    
    events.forEach(event => {
      if (event.metadata.resource) {
        const count = resourceCounts.get(event.metadata.resource) || 0;
        resourceCounts.set(event.metadata.resource, count + 1);
      }
    });

    // Get top 10 most accessed resources
    return Array.from(resourceCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([resource]) => resource);
  }

  private startContinuousMonitoring(): void {
    // Check for threats every 30 seconds
    setInterval(async () => {
      try {
        // Get recent events
        const recentEvents = await this.getRecentEvents(30000);
        
        // Analyze each event
        for (const event of recentEvents) {
          await this.analyzeEvent(event);
        }
        
        // Update baselines for active users
        const activeUsers = new Set(recentEvents.map(e => e.userId).filter(Boolean));
        for (const userId of activeUsers) {
          await this.updateUserBaseline(userId);
        }
        
      } catch (error) {
        console.error('Threat detection monitoring error:', error);
      }
    }, 30000);
  }
}

// Global instance
export const threatDetector = ThreatDetectionEngine.getInstance();