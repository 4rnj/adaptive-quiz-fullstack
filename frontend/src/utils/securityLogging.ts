/**
 * Security Logging System
 * Comprehensive security event logging with structured data and analytics
 */

import { secureStorage, DataClassification, PIIType } from './dataProtection';

// Security event types for comprehensive monitoring
export enum SecurityEventType {
  // Authentication Events
  LOGIN_ATTEMPT = 'LOGIN_ATTEMPT',
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  
  // Authorization Events
  ACCESS_GRANTED = 'ACCESS_GRANTED',
  ACCESS_DENIED = 'ACCESS_DENIED',
  PERMISSION_CHANGE = 'PERMISSION_CHANGE',
  ROLE_CHANGE = 'ROLE_CHANGE',
  
  // Security Violations
  INVALID_TOKEN = 'INVALID_TOKEN',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  BRUTE_FORCE_DETECTED = 'BRUTE_FORCE_DETECTED',
  XSS_ATTEMPT = 'XSS_ATTEMPT',
  INJECTION_ATTEMPT = 'INJECTION_ATTEMPT',
  CSRF_VIOLATION = 'CSRF_VIOLATION',
  
  // Data Security Events
  DATA_ACCESS = 'DATA_ACCESS',
  DATA_MODIFICATION = 'DATA_MODIFICATION',
  DATA_DELETION = 'DATA_DELETION',
  DATA_EXPORT = 'DATA_EXPORT',
  ENCRYPTION_FAILURE = 'ENCRYPTION_FAILURE',
  DECRYPTION_FAILURE = 'DECRYPTION_FAILURE',
  
  // Privacy Events
  CONSENT_GRANTED = 'CONSENT_GRANTED',
  CONSENT_REVOKED = 'CONSENT_REVOKED',
  GDPR_REQUEST = 'GDPR_REQUEST',
  PII_ACCESS = 'PII_ACCESS',
  PII_MODIFICATION = 'PII_MODIFICATION',
  
  // System Security Events
  SECURITY_CONFIG_CHANGE = 'SECURITY_CONFIG_CHANGE',
  CERTIFICATE_ERROR = 'CERTIFICATE_ERROR',
  NETWORK_ANOMALY = 'NETWORK_ANOMALY',
  PERFORMANCE_ANOMALY = 'PERFORMANCE_ANOMALY',
  
  // User Behavior Events
  UNUSUAL_LOCATION = 'UNUSUAL_LOCATION',
  UNUSUAL_DEVICE = 'UNUSUAL_DEVICE',
  UNUSUAL_TIME = 'UNUSUAL_TIME',
  RAPID_REQUESTS = 'RAPID_REQUESTS',
  PATTERN_ANOMALY = 'PATTERN_ANOMALY',
}

// Security event severity levels
export enum SecuritySeverity {
  INFO = 'INFO',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

// Risk score thresholds
export const RISK_THRESHOLDS = {
  LOW: 0.3,
  MEDIUM: 0.5,
  HIGH: 0.7,
  CRITICAL: 0.9,
} as const;

// Security log entry structure
export interface SecurityLogEntry {
  id: string;
  timestamp: number;
  eventType: SecurityEventType;
  severity: SecuritySeverity;
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  deviceId?: string;
  location?: {
    country?: string;
    region?: string;
    city?: string;
    coordinates?: { lat: number; lng: number };
  };
  details: Record<string, any>;
  metadata: {
    component?: string;
    action?: string;
    resource?: string;
    result?: 'success' | 'failure' | 'blocked';
    errorCode?: string;
    errorMessage?: string;
  };
  riskScore?: number;
  anomalyIndicators?: string[];
  mitigationActions?: string[];
  correlationId?: string;
  parentEventId?: string;
}

// Security metrics for analytics
export interface SecurityMetrics {
  totalEvents: number;
  eventsByType: Record<SecurityEventType, number>;
  eventsBySeverity: Record<SecuritySeverity, number>;
  failedLogins: number;
  successfulLogins: number;
  suspiciousActivities: number;
  blockedRequests: number;
  averageRiskScore: number;
  peakRiskScore: number;
  uniqueUsers: number;
  uniqueIPs: number;
  topThreats: Array<{ type: string; count: number }>;
  timeRange: {
    start: number;
    end: number;
  };
}

/**
 * Security Logging Service
 * Handles security event logging, storage, and analysis
 */
export class SecurityLoggingService {
  private static instance: SecurityLoggingService;
  private logs: SecurityLogEntry[] = [];
  private maxLogsInMemory = 1000;
  private logRotationInterval = 60 * 60 * 1000; // 1 hour
  private metricsCache: Map<string, SecurityMetrics> = new Map();
  
  private constructor() {
    this.startLogRotation();
    this.loadPersistedLogs();
  }

  public static getInstance(): SecurityLoggingService {
    if (!SecurityLoggingService.instance) {
      SecurityLoggingService.instance = new SecurityLoggingService();
    }
    return SecurityLoggingService.instance;
  }

  /**
   * Log a security event
   */
  public async logEvent(
    eventType: SecurityEventType,
    details: Record<string, any>,
    options: {
      severity?: SecuritySeverity;
      userId?: string;
      sessionId?: string;
      metadata?: SecurityLogEntry['metadata'];
    } = {}
  ): Promise<SecurityLogEntry> {
    const severity = options.severity || this.determineSeverity(eventType);
    const riskScore = await this.calculateRiskScore(eventType, details);
    const anomalyIndicators = await this.detectAnomalies(eventType, details);
    
    const logEntry: SecurityLogEntry = {
      id: this.generateEventId(),
      timestamp: Date.now(),
      eventType,
      severity,
      userId: options.userId,
      sessionId: options.sessionId,
      ipAddress: this.getClientIP(),
      userAgent: this.getUserAgent(),
      deviceId: this.getDeviceId(),
      location: await this.getLocation(),
      details,
      metadata: options.metadata || {},
      riskScore,
      anomalyIndicators,
      mitigationActions: this.suggestMitigations(eventType, severity, riskScore),
    };

    // Add to memory logs
    this.logs.push(logEntry);
    
    // Trim logs if exceeding limit
    if (this.logs.length > this.maxLogsInMemory) {
      this.logs = this.logs.slice(-this.maxLogsInMemory);
    }

    // Persist critical events immediately
    if (severity === SecuritySeverity.CRITICAL || severity === SecuritySeverity.HIGH) {
      await this.persistLog(logEntry);
    }

    // Send to monitoring systems
    this.sendToMonitoring(logEntry);

    // Trigger alerts if needed
    this.checkAlertConditions(logEntry);

    // Invalidate metrics cache
    this.metricsCache.clear();

    return logEntry;
  }

  /**
   * Log authentication event
   */
  public async logAuthEvent(
    type: 'login' | 'logout' | 'refresh',
    success: boolean,
    details: Record<string, any>
  ): Promise<void> {
    const eventType = this.mapAuthEventType(type, success);
    await this.logEvent(eventType, details, {
      severity: success ? SecuritySeverity.INFO : SecuritySeverity.MEDIUM,
      userId: details.userId,
      sessionId: details.sessionId,
    });
  }

  /**
   * Log data access event
   */
  public async logDataAccess(
    operation: 'read' | 'write' | 'delete',
    resource: string,
    success: boolean,
    details: Record<string, any>
  ): Promise<void> {
    const eventType = this.mapDataEventType(operation);
    await this.logEvent(eventType, {
      ...details,
      resource,
      operation,
    }, {
      severity: success ? SecuritySeverity.LOW : SecuritySeverity.MEDIUM,
      metadata: {
        resource,
        action: operation,
        result: success ? 'success' : 'failure',
      },
    });
  }

  /**
   * Log security violation
   */
  public async logSecurityViolation(
    violationType: string,
    details: Record<string, any>,
    severity: SecuritySeverity = SecuritySeverity.HIGH
  ): Promise<void> {
    const eventType = this.mapViolationType(violationType);
    await this.logEvent(eventType, details, {
      severity,
      metadata: {
        action: 'security_violation',
        result: 'blocked',
      },
    });
  }

  /**
   * Get security metrics for a time range
   */
  public async getMetrics(
    startTime: number,
    endTime: number,
    filters?: {
      userId?: string;
      eventTypes?: SecurityEventType[];
      severities?: SecuritySeverity[];
    }
  ): Promise<SecurityMetrics> {
    const cacheKey = `${startTime}-${endTime}-${JSON.stringify(filters)}`;
    
    if (this.metricsCache.has(cacheKey)) {
      return this.metricsCache.get(cacheKey)!;
    }

    // Filter logs by time range
    let filteredLogs = this.logs.filter(
      log => log.timestamp >= startTime && log.timestamp <= endTime
    );

    // Apply additional filters
    if (filters) {
      if (filters.userId) {
        filteredLogs = filteredLogs.filter(log => log.userId === filters.userId);
      }
      if (filters.eventTypes && filters.eventTypes.length > 0) {
        filteredLogs = filteredLogs.filter(log => filters.eventTypes!.includes(log.eventType));
      }
      if (filters.severities && filters.severities.length > 0) {
        filteredLogs = filteredLogs.filter(log => filters.severities!.includes(log.severity));
      }
    }

    // Calculate metrics
    const metrics: SecurityMetrics = {
      totalEvents: filteredLogs.length,
      eventsByType: this.countByProperty(filteredLogs, 'eventType'),
      eventsBySeverity: this.countByProperty(filteredLogs, 'severity'),
      failedLogins: filteredLogs.filter(log => log.eventType === SecurityEventType.LOGIN_FAILURE).length,
      successfulLogins: filteredLogs.filter(log => log.eventType === SecurityEventType.LOGIN_SUCCESS).length,
      suspiciousActivities: filteredLogs.filter(log => log.eventType === SecurityEventType.SUSPICIOUS_ACTIVITY).length,
      blockedRequests: filteredLogs.filter(log => log.metadata.result === 'blocked').length,
      averageRiskScore: this.calculateAverageRiskScore(filteredLogs),
      peakRiskScore: Math.max(...filteredLogs.map(log => log.riskScore || 0), 0),
      uniqueUsers: new Set(filteredLogs.map(log => log.userId).filter(Boolean)).size,
      uniqueIPs: new Set(filteredLogs.map(log => log.ipAddress).filter(Boolean)).size,
      topThreats: this.getTopThreats(filteredLogs),
      timeRange: { start: startTime, end: endTime },
    };

    // Cache metrics
    this.metricsCache.set(cacheKey, metrics);

    return metrics;
  }

  /**
   * Get recent security events
   */
  public getRecentEvents(
    limit: number = 100,
    filters?: {
      severity?: SecuritySeverity[];
      eventTypes?: SecurityEventType[];
      userId?: string;
    }
  ): SecurityLogEntry[] {
    let events = [...this.logs].reverse();

    if (filters) {
      if (filters.severity && filters.severity.length > 0) {
        events = events.filter(log => filters.severity!.includes(log.severity));
      }
      if (filters.eventTypes && filters.eventTypes.length > 0) {
        events = events.filter(log => filters.eventTypes!.includes(log.eventType));
      }
      if (filters.userId) {
        events = events.filter(log => log.userId === filters.userId);
      }
    }

    return events.slice(0, limit);
  }

  /**
   * Get user activity timeline
   */
  public getUserActivityTimeline(
    userId: string,
    startTime: number,
    endTime: number
  ): SecurityLogEntry[] {
    return this.logs
      .filter(log => 
        log.userId === userId && 
        log.timestamp >= startTime && 
        log.timestamp <= endTime
      )
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Search logs with complex queries
   */
  public searchLogs(query: {
    eventTypes?: SecurityEventType[];
    severities?: SecuritySeverity[];
    userIds?: string[];
    ipAddresses?: string[];
    timeRange?: { start: number; end: number };
    riskScoreMin?: number;
    hasAnomalies?: boolean;
    searchText?: string;
  }): SecurityLogEntry[] {
    let results = [...this.logs];

    // Apply filters
    if (query.eventTypes && query.eventTypes.length > 0) {
      results = results.filter(log => query.eventTypes!.includes(log.eventType));
    }
    
    if (query.severities && query.severities.length > 0) {
      results = results.filter(log => query.severities!.includes(log.severity));
    }
    
    if (query.userIds && query.userIds.length > 0) {
      results = results.filter(log => log.userId && query.userIds!.includes(log.userId));
    }
    
    if (query.ipAddresses && query.ipAddresses.length > 0) {
      results = results.filter(log => log.ipAddress && query.ipAddresses!.includes(log.ipAddress));
    }
    
    if (query.timeRange) {
      results = results.filter(log => 
        log.timestamp >= query.timeRange!.start && 
        log.timestamp <= query.timeRange!.end
      );
    }
    
    if (query.riskScoreMin !== undefined) {
      results = results.filter(log => (log.riskScore || 0) >= query.riskScoreMin!);
    }
    
    if (query.hasAnomalies) {
      results = results.filter(log => log.anomalyIndicators && log.anomalyIndicators.length > 0);
    }
    
    if (query.searchText) {
      const searchLower = query.searchText.toLowerCase();
      results = results.filter(log => 
        JSON.stringify(log).toLowerCase().includes(searchLower)
      );
    }

    return results.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Export logs for analysis
   */
  public async exportLogs(
    format: 'json' | 'csv',
    filters?: Parameters<typeof this.searchLogs>[0]
  ): Promise<string> {
    const logs = filters ? this.searchLogs(filters) : this.logs;
    
    if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    } else {
      // CSV export
      const headers = [
        'timestamp',
        'eventType',
        'severity',
        'userId',
        'ipAddress',
        'riskScore',
        'result',
        'details'
      ];
      
      const csv = [
        headers.join(','),
        ...logs.map(log => [
          new Date(log.timestamp).toISOString(),
          log.eventType,
          log.severity,
          log.userId || '',
          log.ipAddress || '',
          log.riskScore || 0,
          log.metadata.result || '',
          JSON.stringify(log.details).replace(/"/g, '""')
        ].join(','))
      ].join('\n');
      
      return csv;
    }
  }

  /**
   * Private helper methods
   */
  
  private generateEventId(): string {
    return `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private determineSeverity(eventType: SecurityEventType): SecuritySeverity {
    const severityMap: Partial<Record<SecurityEventType, SecuritySeverity>> = {
      [SecurityEventType.LOGIN_SUCCESS]: SecuritySeverity.INFO,
      [SecurityEventType.LOGIN_FAILURE]: SecuritySeverity.LOW,
      [SecurityEventType.RATE_LIMIT_EXCEEDED]: SecuritySeverity.MEDIUM,
      [SecurityEventType.SUSPICIOUS_ACTIVITY]: SecuritySeverity.HIGH,
      [SecurityEventType.BRUTE_FORCE_DETECTED]: SecuritySeverity.CRITICAL,
      [SecurityEventType.XSS_ATTEMPT]: SecuritySeverity.CRITICAL,
      [SecurityEventType.INJECTION_ATTEMPT]: SecuritySeverity.CRITICAL,
    };
    
    return severityMap[eventType] || SecuritySeverity.INFO;
  }

  private async calculateRiskScore(
    eventType: SecurityEventType,
    details: Record<string, any>
  ): Promise<number> {
    let score = 0;
    
    // Base score by event type
    const baseScores: Partial<Record<SecurityEventType, number>> = {
      [SecurityEventType.LOGIN_FAILURE]: 0.2,
      [SecurityEventType.RATE_LIMIT_EXCEEDED]: 0.4,
      [SecurityEventType.SUSPICIOUS_ACTIVITY]: 0.6,
      [SecurityEventType.BRUTE_FORCE_DETECTED]: 0.8,
      [SecurityEventType.XSS_ATTEMPT]: 0.9,
      [SecurityEventType.INJECTION_ATTEMPT]: 0.9,
    };
    
    score = baseScores[eventType] || 0.1;
    
    // Adjust based on patterns
    if (details.failedAttempts && details.failedAttempts > 5) {
      score += 0.2;
    }
    
    if (details.unusualLocation) {
      score += 0.1;
    }
    
    if (details.unusualTime) {
      score += 0.1;
    }
    
    return Math.min(score, 1.0);
  }

  private async detectAnomalies(
    eventType: SecurityEventType,
    details: Record<string, any>
  ): Promise<string[]> {
    const anomalies: string[] = [];
    
    // Check for rapid requests
    const recentEvents = this.logs
      .filter(log => log.userId === details.userId)
      .filter(log => log.timestamp > Date.now() - 60000); // Last minute
    
    if (recentEvents.length > 30) {
      anomalies.push('rapid_requests');
    }
    
    // Check for unusual patterns
    if (details.unusualLocation) {
      anomalies.push('unusual_location');
    }
    
    if (details.unusualDevice) {
      anomalies.push('unusual_device');
    }
    
    // Check for suspicious patterns
    const failedLogins = recentEvents.filter(
      log => log.eventType === SecurityEventType.LOGIN_FAILURE
    );
    
    if (failedLogins.length >= 3) {
      anomalies.push('multiple_failed_logins');
    }
    
    return anomalies;
  }

  private suggestMitigations(
    eventType: SecurityEventType,
    severity: SecuritySeverity,
    riskScore: number
  ): string[] {
    const mitigations: string[] = [];
    
    if (eventType === SecurityEventType.BRUTE_FORCE_DETECTED) {
      mitigations.push('block_ip_address');
      mitigations.push('require_captcha');
      mitigations.push('notify_user');
    }
    
    if (eventType === SecurityEventType.SUSPICIOUS_ACTIVITY) {
      mitigations.push('require_2fa');
      mitigations.push('monitor_closely');
    }
    
    if (riskScore > RISK_THRESHOLDS.HIGH) {
      mitigations.push('escalate_to_security_team');
    }
    
    return mitigations;
  }

  private async persistLog(log: SecurityLogEntry): Promise<void> {
    try {
      const key = `security_log_${log.id}`;
      await secureStorage.store(key, log, {
        classification: DataClassification.RESTRICTED,
        purpose: 'Security monitoring and compliance',
        legalBasis: 'Security and fraud prevention',
        expiresIn: 90 * 24 * 60 * 60 * 1000, // 90 days
      });
    } catch (error) {
      console.error('Failed to persist security log:', error);
    }
  }

  private async loadPersistedLogs(): Promise<void> {
    try {
      const keys = secureStorage.list();
      const logKeys = keys.filter(key => key.startsWith('security_log_'));
      
      for (const key of logKeys) {
        const log = await secureStorage.retrieve(key);
        if (log && !this.logs.find(l => l.id === log.id)) {
          this.logs.push(log);
        }
      }
      
      // Sort by timestamp
      this.logs.sort((a, b) => a.timestamp - b.timestamp);
      
      // Trim to max size
      if (this.logs.length > this.maxLogsInMemory) {
        this.logs = this.logs.slice(-this.maxLogsInMemory);
      }
    } catch (error) {
      console.error('Failed to load persisted logs:', error);
    }
  }

  private startLogRotation(): void {
    setInterval(async () => {
      try {
        // Persist important logs
        const importantLogs = this.logs.filter(
          log => log.severity === SecuritySeverity.HIGH || 
                 log.severity === SecuritySeverity.CRITICAL
        );
        
        for (const log of importantLogs) {
          await this.persistLog(log);
        }
        
        // Clean up old logs
        const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
        this.logs = this.logs.filter(log => log.timestamp > cutoffTime);
        
      } catch (error) {
        console.error('Log rotation failed:', error);
      }
    }, this.logRotationInterval);
  }

  private sendToMonitoring(log: SecurityLogEntry): void {
    // In production, send to monitoring service
    if (log.severity === SecuritySeverity.CRITICAL || log.severity === SecuritySeverity.HIGH) {
      console.warn('Security Alert:', log);
    }
  }

  private checkAlertConditions(log: SecurityLogEntry): void {
    // Dispatch custom events for alert conditions
    if (log.severity === SecuritySeverity.CRITICAL) {
      window.dispatchEvent(new CustomEvent('securityAlert', {
        detail: { log, type: 'critical' }
      }));
    }
    
    if (log.anomalyIndicators && log.anomalyIndicators.length > 0) {
      window.dispatchEvent(new CustomEvent('securityAnomaly', {
        detail: { log, anomalies: log.anomalyIndicators }
      }));
    }
  }

  private countByProperty<T extends keyof SecurityLogEntry>(
    logs: SecurityLogEntry[],
    property: T
  ): Record<string, number> {
    return logs.reduce((acc, log) => {
      const value = String(log[property]);
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private calculateAverageRiskScore(logs: SecurityLogEntry[]): number {
    const scores = logs.map(log => log.riskScore || 0).filter(score => score > 0);
    return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  }

  private getTopThreats(logs: SecurityLogEntry[]): Array<{ type: string; count: number }> {
    const threats = logs.filter(log => 
      log.severity === SecuritySeverity.HIGH || 
      log.severity === SecuritySeverity.CRITICAL
    );
    
    const threatCounts = this.countByProperty(threats, 'eventType');
    
    return Object.entries(threatCounts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  private mapAuthEventType(type: string, success: boolean): SecurityEventType {
    const map: Record<string, SecurityEventType> = {
      'login:true': SecurityEventType.LOGIN_SUCCESS,
      'login:false': SecurityEventType.LOGIN_FAILURE,
      'logout:true': SecurityEventType.LOGOUT,
      'refresh:true': SecurityEventType.TOKEN_REFRESH,
      'refresh:false': SecurityEventType.TOKEN_EXPIRED,
    };
    
    return map[`${type}:${success}`] || SecurityEventType.LOGIN_ATTEMPT;
  }

  private mapDataEventType(operation: string): SecurityEventType {
    const map: Record<string, SecurityEventType> = {
      'read': SecurityEventType.DATA_ACCESS,
      'write': SecurityEventType.DATA_MODIFICATION,
      'delete': SecurityEventType.DATA_DELETION,
    };
    
    return map[operation] || SecurityEventType.DATA_ACCESS;
  }

  private mapViolationType(type: string): SecurityEventType {
    const map: Record<string, SecurityEventType> = {
      'xss': SecurityEventType.XSS_ATTEMPT,
      'injection': SecurityEventType.INJECTION_ATTEMPT,
      'csrf': SecurityEventType.CSRF_VIOLATION,
      'brute_force': SecurityEventType.BRUTE_FORCE_DETECTED,
    };
    
    return map[type] || SecurityEventType.SUSPICIOUS_ACTIVITY;
  }

  private getClientIP(): string {
    // In production, get from request headers
    return '127.0.0.1';
  }

  private getUserAgent(): string {
    return navigator.userAgent;
  }

  private getDeviceId(): string {
    // Generate/retrieve persistent device ID
    let deviceId = localStorage.getItem('device_id');
    if (!deviceId) {
      deviceId = `dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('device_id', deviceId);
    }
    return deviceId;
  }

  private async getLocation(): Promise<SecurityLogEntry['location']> {
    // In production, use IP geolocation service
    return {
      country: 'Unknown',
      region: 'Unknown',
      city: 'Unknown',
    };
  }
}

// Global instance
export const securityLogger = SecurityLoggingService.getInstance();