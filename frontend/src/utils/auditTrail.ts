/**
 * Comprehensive Audit Trail System
 * Immutable, tamper-evident logging for compliance and forensics
 */

import { 
  secureStorage, 
  DataClassification, 
  piiDetection,
  dataAnonymization 
} from './dataProtection';
import { securityLogger, SecurityEventType } from './securityLogging';

// Audit event categories
export enum AuditCategory {
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  DATA_ACCESS = 'DATA_ACCESS',
  DATA_MODIFICATION = 'DATA_MODIFICATION',
  CONFIGURATION_CHANGE = 'CONFIGURATION_CHANGE',
  PRIVACY_CONSENT = 'PRIVACY_CONSENT',
  SECURITY_EVENT = 'SECURITY_EVENT',
  SYSTEM_ACTION = 'SYSTEM_ACTION',
  USER_ACTION = 'USER_ACTION',
  COMPLIANCE_EVENT = 'COMPLIANCE_EVENT',
}

// Audit event structure
export interface AuditEvent {
  // Immutable identifiers
  id: string;
  timestamp: number;
  sequenceNumber: number;
  
  // Event classification
  category: AuditCategory;
  action: string;
  result: 'success' | 'failure' | 'partial';
  
  // Actor information
  actor: {
    type: 'user' | 'system' | 'service' | 'admin';
    id: string;
    name?: string;
    role?: string;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
  };
  
  // Target information
  target?: {
    type: string;
    id: string;
    name?: string;
    previousState?: any;
    newState?: any;
  };
  
  // Context and metadata
  context: {
    component: string;
    operation: string;
    reason?: string;
    justification?: string;
    approvedBy?: string;
  };
  
  // Compliance and privacy
  compliance: {
    regulations: string[]; // GDPR, HIPAA, etc.
    dataClassification: DataClassification;
    containsPII: boolean;
    piiTypes?: string[];
    retentionPeriod: number;
  };
  
  // Security metadata
  security: {
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    threatIndicators?: string[];
    mitigationApplied?: string[];
  };
  
  // Integrity protection
  integrity: {
    hash: string;
    previousHash: string;
    signature?: string;
  };
  
  // Additional evidence
  evidence?: {
    screenshots?: string[];
    logs?: string[];
    artifacts?: any[];
  };
}

// Audit query options
export interface AuditQuery {
  categories?: AuditCategory[];
  actors?: string[];
  targets?: string[];
  actions?: string[];
  startTime?: number;
  endTime?: number;
  results?: Array<'success' | 'failure' | 'partial'>;
  riskLevels?: Array<'low' | 'medium' | 'high' | 'critical'>;
  searchText?: string;
  limit?: number;
  offset?: number;
}

// Audit report format
export interface AuditReport {
  query: AuditQuery;
  events: AuditEvent[];
  summary: {
    totalEvents: number;
    eventsByCategory: Record<AuditCategory, number>;
    eventsByResult: Record<string, number>;
    uniqueActors: number;
    timeRange: { start: number; end: number };
    complianceStatus: {
      compliant: boolean;
      violations: string[];
    };
  };
  generated: {
    timestamp: number;
    by: string;
    purpose: string;
  };
}

/**
 * Audit Trail Service
 * Provides immutable, compliant audit logging
 */
export class AuditTrailService {
  private static instance: AuditTrailService;
  private sequenceNumber: number = 0;
  private lastHash: string = '0';
  private auditCache: Map<string, AuditEvent> = new Map();
  private readonly maxCacheSize = 10000;

  private constructor() {
    this.initializeService();
  }

  public static getInstance(): AuditTrailService {
    if (!AuditTrailService.instance) {
      AuditTrailService.instance = new AuditTrailService();
    }
    return AuditTrailService.instance;
  }

  /**
   * Log an audit event
   */
  public async logAuditEvent(
    category: AuditCategory,
    action: string,
    details: {
      actor: AuditEvent['actor'];
      target?: AuditEvent['target'];
      result: AuditEvent['result'];
      context: Partial<AuditEvent['context']>;
      riskLevel?: AuditEvent['security']['riskLevel'];
      evidence?: AuditEvent['evidence'];
    }
  ): Promise<AuditEvent> {
    // Generate unique ID and increment sequence
    const id = this.generateAuditId();
    const sequenceNumber = ++this.sequenceNumber;
    const timestamp = Date.now();

    // Detect PII in target data
    let containsPII = false;
    let piiTypes: string[] = [];
    
    if (details.target) {
      const piiDetected = piiDetection.detectPII(details.target);
      if (piiDetected.length > 0) {
        containsPII = true;
        piiTypes = piiDetected.map(p => p.type);
      }
    }

    // Create audit event
    const auditEvent: AuditEvent = {
      id,
      timestamp,
      sequenceNumber,
      category,
      action,
      result: details.result,
      actor: details.actor,
      target: details.target,
      context: {
        component: details.context.component || 'unknown',
        operation: details.context.operation || action,
        reason: details.context.reason,
        justification: details.context.justification,
        approvedBy: details.context.approvedBy,
      },
      compliance: {
        regulations: this.determineRegulations(category, containsPII),
        dataClassification: this.determineClassification(category, containsPII),
        containsPII,
        piiTypes: containsPII ? piiTypes : undefined,
        retentionPeriod: this.determineRetention(category),
      },
      security: {
        riskLevel: details.riskLevel || this.assessRiskLevel(category, details.result),
        threatIndicators: details.evidence?.logs?.filter(log => log.includes('threat')),
      },
      integrity: {
        hash: '',
        previousHash: this.lastHash,
      },
      evidence: details.evidence,
    };

    // Calculate integrity hash
    auditEvent.integrity.hash = await this.calculateHash(auditEvent);
    this.lastHash = auditEvent.integrity.hash;

    // Store audit event
    await this.storeAuditEvent(auditEvent);

    // Update cache
    this.auditCache.set(id, auditEvent);
    this.maintainCacheSize();

    // Log to security system if high risk
    if (auditEvent.security.riskLevel === 'high' || auditEvent.security.riskLevel === 'critical') {
      await securityLogger.logEvent(
        SecurityEventType.SECURITY_EVENT,
        {
          auditEventId: id,
          category,
          action,
          riskLevel: auditEvent.security.riskLevel,
        },
        {
          userId: details.actor.id,
          sessionId: details.actor.sessionId,
        }
      );
    }

    return auditEvent;
  }

  /**
   * Log authentication event
   */
  public async logAuthEvent(
    action: 'login' | 'logout' | 'password_change' | '2fa_enable' | '2fa_disable',
    actor: AuditEvent['actor'],
    result: AuditEvent['result'],
    details?: any
  ): Promise<void> {
    await this.logAuditEvent(AuditCategory.AUTHENTICATION, action, {
      actor,
      result,
      context: {
        component: 'auth_system',
        operation: action,
      },
      evidence: details ? { artifacts: [details] } : undefined,
    });
  }

  /**
   * Log data access event
   */
  public async logDataAccess(
    resource: string,
    operation: 'read' | 'list' | 'search' | 'export',
    actor: AuditEvent['actor'],
    details?: {
      filters?: any;
      fields?: string[];
      recordCount?: number;
    }
  ): Promise<void> {
    await this.logAuditEvent(AuditCategory.DATA_ACCESS, operation, {
      actor,
      target: {
        type: 'data_resource',
        id: resource,
        name: resource,
      },
      result: 'success',
      context: {
        component: 'data_access_layer',
        operation,
      },
      evidence: details ? { artifacts: [details] } : undefined,
    });
  }

  /**
   * Log privacy consent event
   */
  public async logConsentEvent(
    action: 'grant' | 'revoke' | 'update',
    consentType: string,
    actor: AuditEvent['actor'],
    details: {
      previousState?: any;
      newState: any;
    }
  ): Promise<void> {
    await this.logAuditEvent(AuditCategory.PRIVACY_CONSENT, `consent_${action}`, {
      actor,
      target: {
        type: 'consent',
        id: consentType,
        name: consentType,
        previousState: details.previousState,
        newState: details.newState,
      },
      result: 'success',
      context: {
        component: 'privacy_management',
        operation: `consent_${action}`,
        reason: 'user_request',
      },
    });
  }

  /**
   * Search audit events
   */
  public async searchAuditEvents(query: AuditQuery): Promise<AuditEvent[]> {
    // Start with cached events
    let events = Array.from(this.auditCache.values());

    // Load additional events if needed
    if (events.length < (query.limit || 100)) {
      const storedEvents = await this.loadStoredEvents(query);
      events = [...events, ...storedEvents];
    }

    // Apply filters
    if (query.categories && query.categories.length > 0) {
      events = events.filter(e => query.categories!.includes(e.category));
    }

    if (query.actors && query.actors.length > 0) {
      events = events.filter(e => query.actors!.includes(e.actor.id));
    }

    if (query.actions && query.actions.length > 0) {
      events = events.filter(e => query.actions!.includes(e.action));
    }

    if (query.startTime) {
      events = events.filter(e => e.timestamp >= query.startTime!);
    }

    if (query.endTime) {
      events = events.filter(e => e.timestamp <= query.endTime!);
    }

    if (query.results && query.results.length > 0) {
      events = events.filter(e => query.results!.includes(e.result));
    }

    if (query.riskLevels && query.riskLevels.length > 0) {
      events = events.filter(e => query.riskLevels!.includes(e.security.riskLevel));
    }

    if (query.searchText) {
      const searchLower = query.searchText.toLowerCase();
      events = events.filter(e => 
        JSON.stringify(e).toLowerCase().includes(searchLower)
      );
    }

    // Sort by timestamp descending
    events.sort((a, b) => b.timestamp - a.timestamp);

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 100;
    
    return events.slice(offset, offset + limit);
  }

  /**
   * Generate audit report
   */
  public async generateAuditReport(
    query: AuditQuery,
    purpose: string,
    requestedBy: string
  ): Promise<AuditReport> {
    const events = await this.searchAuditEvents(query);
    
    // Calculate summary statistics
    const eventsByCategory: Record<AuditCategory, number> = {} as any;
    const eventsByResult: Record<string, number> = {};
    const actors = new Set<string>();
    
    let minTime = Infinity;
    let maxTime = 0;
    const violations: string[] = [];

    events.forEach(event => {
      // Category counts
      eventsByCategory[event.category] = (eventsByCategory[event.category] || 0) + 1;
      
      // Result counts
      eventsByResult[event.result] = (eventsByResult[event.result] || 0) + 1;
      
      // Unique actors
      actors.add(event.actor.id);
      
      // Time range
      minTime = Math.min(minTime, event.timestamp);
      maxTime = Math.max(maxTime, event.timestamp);
      
      // Check for violations
      if (event.result === 'failure' && event.security.riskLevel === 'critical') {
        violations.push(`Critical failure: ${event.action} at ${new Date(event.timestamp).toISOString()}`);
      }
    });

    const report: AuditReport = {
      query,
      events,
      summary: {
        totalEvents: events.length,
        eventsByCategory,
        eventsByResult,
        uniqueActors: actors.size,
        timeRange: {
          start: minTime === Infinity ? 0 : minTime,
          end: maxTime,
        },
        complianceStatus: {
          compliant: violations.length === 0,
          violations,
        },
      },
      generated: {
        timestamp: Date.now(),
        by: requestedBy,
        purpose,
      },
    };

    // Log the report generation
    await this.logAuditEvent(AuditCategory.COMPLIANCE_EVENT, 'audit_report_generated', {
      actor: {
        type: 'user',
        id: requestedBy,
        name: requestedBy,
      },
      target: {
        type: 'audit_report',
        id: `report_${Date.now()}`,
        name: purpose,
      },
      result: 'success',
      context: {
        component: 'audit_system',
        operation: 'generate_report',
        reason: purpose,
      },
    });

    return report;
  }

  /**
   * Export audit trail for compliance
   */
  public async exportAuditTrail(
    format: 'json' | 'csv',
    query: AuditQuery,
    anonymize: boolean = false
  ): Promise<string> {
    let events = await this.searchAuditEvents(query);
    
    // Anonymize if requested
    if (anonymize) {
      events = events.map(event => this.anonymizeAuditEvent(event));
    }

    if (format === 'json') {
      return JSON.stringify({
        exportDate: new Date().toISOString(),
        query,
        events,
        totalEvents: events.length,
      }, null, 2);
    } else {
      // CSV format
      const headers = [
        'timestamp',
        'category',
        'action',
        'result',
        'actor_type',
        'actor_id',
        'target_type',
        'target_id',
        'risk_level',
        'contains_pii',
        'regulations',
      ];
      
      const rows = events.map(event => [
        new Date(event.timestamp).toISOString(),
        event.category,
        event.action,
        event.result,
        event.actor.type,
        event.actor.id,
        event.target?.type || '',
        event.target?.id || '',
        event.security.riskLevel,
        event.compliance.containsPII,
        event.compliance.regulations.join(';'),
      ]);
      
      return [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');
    }
  }

  /**
   * Verify audit trail integrity
   */
  public async verifyIntegrity(
    startTime?: number,
    endTime?: number
  ): Promise<{
    valid: boolean;
    errors: string[];
    eventsChecked: number;
  }> {
    const events = await this.searchAuditEvents({
      startTime,
      endTime,
      limit: 10000,
    });

    const errors: string[] = [];
    let previousHash = '0';

    // Sort by sequence number
    events.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    for (const event of events) {
      // Verify hash chain
      if (event.integrity.previousHash !== previousHash) {
        errors.push(`Hash chain broken at event ${event.id}`);
      }

      // Verify event hash
      const calculatedHash = await this.calculateHash(event);
      if (calculatedHash !== event.integrity.hash) {
        errors.push(`Hash mismatch for event ${event.id}`);
      }

      previousHash = event.integrity.hash;
    }

    return {
      valid: errors.length === 0,
      errors,
      eventsChecked: events.length,
    };
  }

  /**
   * Get user activity summary
   */
  public async getUserActivitySummary(
    userId: string,
    startTime: number,
    endTime: number
  ): Promise<{
    totalActions: number;
    actionsByCategory: Record<AuditCategory, number>;
    failureRate: number;
    riskEvents: number;
    timeline: Array<{ time: number; action: string; result: string }>;
  }> {
    const events = await this.searchAuditEvents({
      actors: [userId],
      startTime,
      endTime,
    });

    const actionsByCategory: Record<AuditCategory, number> = {} as any;
    let failures = 0;
    let riskEvents = 0;
    const timeline: Array<{ time: number; action: string; result: string }> = [];

    events.forEach(event => {
      actionsByCategory[event.category] = (actionsByCategory[event.category] || 0) + 1;
      
      if (event.result === 'failure') {
        failures++;
      }
      
      if (event.security.riskLevel === 'high' || event.security.riskLevel === 'critical') {
        riskEvents++;
      }
      
      timeline.push({
        time: event.timestamp,
        action: event.action,
        result: event.result,
      });
    });

    return {
      totalActions: events.length,
      actionsByCategory,
      failureRate: events.length > 0 ? failures / events.length : 0,
      riskEvents,
      timeline: timeline.slice(0, 50), // Last 50 actions
    };
  }

  /**
   * Private helper methods
   */

  private async initializeService(): Promise<void> {
    try {
      // Load last sequence number and hash
      const metadata = await secureStorage.retrieve('audit_metadata');
      if (metadata) {
        this.sequenceNumber = metadata.lastSequence || 0;
        this.lastHash = metadata.lastHash || '0';
      }

      // Load recent events into cache
      const recentEvents = await this.loadStoredEvents({
        limit: 1000,
        offset: 0,
      });
      
      recentEvents.forEach(event => {
        this.auditCache.set(event.id, event);
      });
    } catch (error) {
      console.error('Failed to initialize audit service:', error);
    }
  }

  private generateAuditId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async calculateHash(event: AuditEvent): Promise<string> {
    // Create deterministic string representation
    const eventData = {
      id: event.id,
      timestamp: event.timestamp,
      sequenceNumber: event.sequenceNumber,
      category: event.category,
      action: event.action,
      result: event.result,
      actor: event.actor,
      target: event.target,
      context: event.context,
      previousHash: event.integrity.previousHash,
    };

    const dataString = JSON.stringify(eventData);
    const encoder = new TextEncoder();
    const data = encoder.encode(dataString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private determineRegulations(category: AuditCategory, containsPII: boolean): string[] {
    const regulations: string[] = [];
    
    if (containsPII) {
      regulations.push('GDPR', 'CCPA');
    }
    
    if (category === AuditCategory.AUTHENTICATION || category === AuditCategory.AUTHORIZATION) {
      regulations.push('SOC2');
    }
    
    if (category === AuditCategory.DATA_ACCESS || category === AuditCategory.DATA_MODIFICATION) {
      regulations.push('HIPAA');
    }
    
    return regulations;
  }

  private determineClassification(category: AuditCategory, containsPII: boolean): DataClassification {
    if (containsPII) {
      return DataClassification.RESTRICTED;
    }
    
    if (category === AuditCategory.SECURITY_EVENT) {
      return DataClassification.CONFIDENTIAL;
    }
    
    if (category === AuditCategory.SYSTEM_ACTION) {
      return DataClassification.INTERNAL;
    }
    
    return DataClassification.INTERNAL;
  }

  private determineRetention(category: AuditCategory): number {
    const retentionPeriods: Partial<Record<AuditCategory, number>> = {
      [AuditCategory.AUTHENTICATION]: 2 * 365 * 24 * 60 * 60 * 1000, // 2 years
      [AuditCategory.AUTHORIZATION]: 2 * 365 * 24 * 60 * 60 * 1000,
      [AuditCategory.DATA_ACCESS]: 3 * 365 * 24 * 60 * 60 * 1000, // 3 years
      [AuditCategory.DATA_MODIFICATION]: 7 * 365 * 24 * 60 * 60 * 1000, // 7 years
      [AuditCategory.PRIVACY_CONSENT]: 7 * 365 * 24 * 60 * 60 * 1000,
      [AuditCategory.SECURITY_EVENT]: 5 * 365 * 24 * 60 * 60 * 1000, // 5 years
      [AuditCategory.COMPLIANCE_EVENT]: 7 * 365 * 24 * 60 * 60 * 1000,
    };
    
    return retentionPeriods[category] || 365 * 24 * 60 * 60 * 1000; // Default 1 year
  }

  private assessRiskLevel(category: AuditCategory, result: AuditEvent['result']): AuditEvent['security']['riskLevel'] {
    if (result === 'failure') {
      if (category === AuditCategory.AUTHENTICATION || category === AuditCategory.AUTHORIZATION) {
        return 'high';
      }
      if (category === AuditCategory.SECURITY_EVENT) {
        return 'critical';
      }
      return 'medium';
    }
    
    if (category === AuditCategory.DATA_MODIFICATION || category === AuditCategory.CONFIGURATION_CHANGE) {
      return 'medium';
    }
    
    return 'low';
  }

  private async storeAuditEvent(event: AuditEvent): Promise<void> {
    try {
      await secureStorage.store(`audit_${event.id}`, event, {
        classification: event.compliance.dataClassification,
        purpose: 'Audit trail and compliance',
        legalBasis: 'Legal obligation',
        expiresIn: event.compliance.retentionPeriod,
      });

      // Update metadata
      await secureStorage.store('audit_metadata', {
        lastSequence: this.sequenceNumber,
        lastHash: this.lastHash,
        lastUpdate: Date.now(),
      }, {
        classification: DataClassification.INTERNAL,
        purpose: 'Audit system metadata',
      });
    } catch (error) {
      console.error('Failed to store audit event:', error);
      // In production, this should trigger an alert
    }
  }

  private async loadStoredEvents(query: AuditQuery): Promise<AuditEvent[]> {
    try {
      const keys = secureStorage.list();
      const auditKeys = keys
        .filter(key => key.startsWith('audit_') && !key.includes('metadata'))
        .slice(0, query.limit || 1000);
      
      const events: AuditEvent[] = [];
      
      for (const key of auditKeys) {
        const event = await secureStorage.retrieve(key);
        if (event && this.matchesQuery(event, query)) {
          events.push(event);
        }
      }
      
      return events.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error('Failed to load stored audit events:', error);
      return [];
    }
  }

  private matchesQuery(event: AuditEvent, query: AuditQuery): boolean {
    if (query.startTime && event.timestamp < query.startTime) return false;
    if (query.endTime && event.timestamp > query.endTime) return false;
    if (query.categories && !query.categories.includes(event.category)) return false;
    if (query.actors && !query.actors.includes(event.actor.id)) return false;
    if (query.results && !query.results.includes(event.result)) return false;
    
    return true;
  }

  private anonymizeAuditEvent(event: AuditEvent): AuditEvent {
    const anonymized = { ...event };
    
    // Anonymize actor
    anonymized.actor = {
      ...event.actor,
      id: dataAnonymization.anonymize({ id: event.actor.id }).id,
      name: event.actor.name ? dataAnonymization.anonymize({ name: event.actor.name }).name : undefined,
      ipAddress: event.actor.ipAddress ? '***.***.***.' + event.actor.ipAddress.split('.').pop() : undefined,
    };
    
    // Anonymize target if contains PII
    if (event.target && event.compliance.containsPII) {
      anonymized.target = {
        ...event.target,
        previousState: event.target.previousState ? dataAnonymization.anonymize(event.target.previousState) : undefined,
        newState: event.target.newState ? dataAnonymization.anonymize(event.target.newState) : undefined,
      };
    }
    
    return anonymized;
  }

  private maintainCacheSize(): void {
    if (this.auditCache.size > this.maxCacheSize) {
      // Remove oldest entries
      const entries = Array.from(this.auditCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = entries.slice(0, this.auditCache.size - this.maxCacheSize);
      toRemove.forEach(([key]) => this.auditCache.delete(key));
    }
  }
}

// Global instance
export const auditTrail = AuditTrailService.getInstance();