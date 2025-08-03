/**
 * Data Protection and Privacy Utilities
 * Implements PII protection, data anonymization, and GDPR compliance
 */

import { 
  encryptionService, 
  DataClassification, 
  PIIType, 
  EncryptedData,
  StorageMetadata 
} from './encryption';

// Data retention policies
export const DATA_RETENTION = {
  USER_PROFILE: 3 * 365 * 24 * 60 * 60 * 1000, // 3 years
  QUIZ_RESULTS: 2 * 365 * 24 * 60 * 60 * 1000, // 2 years
  SESSION_DATA: 30 * 24 * 60 * 60 * 1000,      // 30 days
  AUDIT_LOGS: 7 * 365 * 24 * 60 * 60 * 1000,   // 7 years
  PREFERENCES: 5 * 365 * 24 * 60 * 60 * 1000,  // 5 years
} as const;

// GDPR rights implementation
export enum GDPRRight {
  ACCESS = 'ACCESS',           // Right to access
  RECTIFICATION = 'RECTIFICATION', // Right to rectification
  ERASURE = 'ERASURE',         // Right to erasure (right to be forgotten)
  PORTABILITY = 'PORTABILITY', // Right to data portability
  RESTRICTION = 'RESTRICTION', // Right to restriction of processing
  OBJECTION = 'OBJECTION',     // Right to object
}

// PII detection patterns
const PII_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^[\+]?[1-9][\d]{0,15}$/,
  SSN: /^\d{3}-?\d{2}-?\d{4}$/,
  CREDIT_CARD: /^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}$/,
  IP_ADDRESS: /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
};

// Data processing record for GDPR compliance
export interface DataProcessingRecord {
  id: string;
  userId: string;
  dataType: PIIType;
  classification: DataClassification;
  purpose: string;
  legalBasis: string;
  processingDate: number;
  retentionPeriod: number;
  consentGiven: boolean;
  consentWithdrawn?: number;
  dataSource: string;
  recipients?: string[];
  transferredToThirdCountry?: boolean;
  securityMeasures: string[];
}

/**
 * PII Detection and Classification Service
 */
export class PIIDetectionService {
  /**
   * Detect PII in data object
   */
  static detectPII(data: any): { field: string; type: PIIType; confidence: number }[] {
    const detected: { field: string; type: PIIType; confidence: number }[] = [];
    
    if (typeof data === 'object' && data !== null) {
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'string') {
          const piiType = this.classifyString(key, value);
          if (piiType) {
            detected.push({
              field: key,
              type: piiType.type,
              confidence: piiType.confidence
            });
          }
        }
      }
    }
    
    return detected;
  }

  /**
   * Classify string data as PII type
   */
  private static classifyString(key: string, value: string): { type: PIIType; confidence: number } | null {
    const lowerKey = key.toLowerCase();
    const trimmedValue = value.trim();

    // Email detection
    if ((lowerKey.includes('email') || lowerKey.includes('mail')) && PII_PATTERNS.EMAIL.test(trimmedValue)) {
      return { type: PIIType.EMAIL, confidence: 0.95 };
    }

    // Name detection
    if ((lowerKey.includes('name') || lowerKey.includes('first') || lowerKey.includes('last')) && 
        trimmedValue.length > 1 && /^[a-zA-Z\s]+$/.test(trimmedValue)) {
      return { type: PIIType.NAME, confidence: 0.8 };
    }

    // Phone detection
    if ((lowerKey.includes('phone') || lowerKey.includes('mobile') || lowerKey.includes('tel')) && 
        PII_PATTERNS.PHONE.test(trimmedValue.replace(/[\s\-\(\)]/g, ''))) {
      return { type: PIIType.PHONE, confidence: 0.9 };
    }

    // SSN detection
    if ((lowerKey.includes('ssn') || lowerKey.includes('social')) && PII_PATTERNS.SSN.test(trimmedValue)) {
      return { type: PIIType.SSN, confidence: 0.95 };
    }

    // Credit card detection
    if ((lowerKey.includes('card') || lowerKey.includes('credit')) && 
        PII_PATTERNS.CREDIT_CARD.test(trimmedValue.replace(/[\s\-]/g, ''))) {
      return { type: PIIType.CREDIT_CARD, confidence: 0.9 };
    }

    // Address detection
    if (lowerKey.includes('address') || lowerKey.includes('street') || lowerKey.includes('city')) {
      return { type: PIIType.ADDRESS, confidence: 0.7 };
    }

    return null;
  }

  /**
   * Get data classification based on PII types present
   */
  static getDataClassification(piiTypes: PIIType[]): DataClassification {
    if (piiTypes.includes(PIIType.SSN) || piiTypes.includes(PIIType.CREDIT_CARD) || piiTypes.includes(PIIType.BIOMETRIC)) {
      return DataClassification.RESTRICTED;
    }
    
    if (piiTypes.includes(PIIType.EMAIL) || piiTypes.includes(PIIType.NAME) || piiTypes.includes(PIIType.PHONE)) {
      return DataClassification.CONFIDENTIAL;
    }
    
    if (piiTypes.includes(PIIType.QUIZ_RESULTS) || piiTypes.includes(PIIType.USER_PREFERENCES)) {
      return DataClassification.INTERNAL;
    }
    
    return DataClassification.PUBLIC;
  }
}

/**
 * Data Anonymization Service
 */
export class DataAnonymizationService {
  /**
   * Anonymize data by removing or masking PII
   */
  static anonymize(data: any, options: { preserveFormat?: boolean; hashSalt?: string } = {}): any {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const anonymized = { ...data };
    const piiFields = PIIDetectionService.detectPII(data);

    for (const pii of piiFields) {
      const originalValue = anonymized[pii.field];
      
      switch (pii.type) {
        case PIIType.EMAIL:
          anonymized[pii.field] = this.anonymizeEmail(originalValue, options.preserveFormat);
          break;
        case PIIType.NAME:
          anonymized[pii.field] = this.anonymizeName(originalValue);
          break;
        case PIIType.PHONE:
          anonymized[pii.field] = this.anonymizePhone(originalValue, options.preserveFormat);
          break;
        case PIIType.SSN:
          anonymized[pii.field] = this.anonymizeSSN(originalValue);
          break;
        case PIIType.CREDIT_CARD:
          anonymized[pii.field] = this.anonymizeCreditCard(originalValue);
          break;
        case PIIType.ADDRESS:
          anonymized[pii.field] = this.anonymizeAddress(originalValue);
          break;
        default:
          // Generic anonymization
          anonymized[pii.field] = this.genericAnonymize(originalValue, options.hashSalt);
      }
    }

    return anonymized;
  }

  /**
   * Pseudonymize data (reversible anonymization)
   */
  static async pseudonymize(data: any, context: string): Promise<any> {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const pseudonymized = { ...data };
    const piiFields = PIIDetectionService.detectPII(data);

    for (const pii of piiFields) {
      const originalValue = pseudonymized[pii.field];
      
      // Encrypt PII values for pseudonymization
      const encrypted = await encryptionService.encrypt(
        originalValue,
        DataClassification.CONFIDENTIAL,
        pii.type,
        `pseudo_${context}_${pii.field}`
      );
      
      // Create a pseudonym (hash of encrypted data)
      const pseudonym = await this.createPseudonym(encrypted.data, pii.type);
      pseudonymized[pii.field] = pseudonym;
    }

    return pseudonymized;
  }

  /**
   * Create pseudonym from encrypted data
   */
  private static async createPseudonym(encryptedData: string, type: PIIType): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(encryptedData);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hash));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Add type prefix for identification
    const prefix = type.substring(0, 3).toLowerCase();
    return `${prefix}_${hashHex.substring(0, 16)}`;
  }

  /**
   * Anonymization methods for specific PII types
   */
  private static anonymizeEmail(email: string, preserveFormat: boolean = true): string {
    if (!preserveFormat) return '***@***.***';
    
    const [local, domain] = email.split('@');
    const anonymizedLocal = local.length > 2 
      ? local[0] + '*'.repeat(local.length - 2) + local[local.length - 1]
      : '***';
    
    const [domainName, tld] = domain.split('.');
    const anonymizedDomain = domainName.length > 2
      ? domainName[0] + '*'.repeat(domainName.length - 2) + domainName[domainName.length - 1]
      : '***';
    
    return `${anonymizedLocal}@${anonymizedDomain}.${tld}`;
  }

  private static anonymizeName(name: string): string {
    const parts = name.split(' ');
    return parts.map(part => 
      part.length > 1 ? part[0] + '*'.repeat(part.length - 1) : '*'
    ).join(' ');
  }

  private static anonymizePhone(phone: string, preserveFormat: boolean = true): string {
    if (!preserveFormat) return '***-***-****';
    
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `***-***-${cleaned.slice(-4)}`;
    }
    return '***-***-****';
  }

  private static anonymizeSSN(ssn: string): string {
    return '***-**-****';
  }

  private static anonymizeCreditCard(card: string): string {
    const cleaned = card.replace(/\D/g, '');
    if (cleaned.length === 16) {
      return `****-****-****-${cleaned.slice(-4)}`;
    }
    return '****-****-****-****';
  }

  private static anonymizeAddress(address: string): string {
    return '[REDACTED ADDRESS]';
  }

  private static genericAnonymize(value: string, salt?: string): string {
    if (salt) {
      // Create a consistent hash for the same input
      const combined = value + salt;
      let hash = 0;
      for (let i = 0; i < combined.length; i++) {
        const char = combined.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return `anon_${Math.abs(hash).toString(36)}`;
    }
    
    return '[REDACTED]';
  }
}

/**
 * Secure Storage Service with encryption at rest
 */
export class SecureStorageService {
  private storagePrefix = '__secure_store__';
  private processingRecords = new Map<string, DataProcessingRecord>();

  /**
   * Store data securely with encryption
   */
  async store(
    key: string,
    data: any,
    options: {
      classification?: DataClassification;
      piiType?: PIIType;
      expiresIn?: number;
      purpose?: string;
      legalBasis?: string;
      requireConsent?: boolean;
    } = {}
  ): Promise<void> {
    try {
      // Detect PII if not specified
      const detectedPII = PIIDetectionService.detectPII(data);
      const classification = options.classification || 
        (detectedPII.length > 0 ? PIIDetectionService.getDataClassification(detectedPII.map(p => p.type)) : DataClassification.INTERNAL);

      // Check consent if required
      if (options.requireConsent && !this.hasValidConsent(key)) {
        throw new Error('Consent required for storing this data');
      }

      // Encrypt data
      const encrypted = await encryptionService.encrypt(
        data,
        classification,
        options.piiType,
        key
      );

      // Add expiration
      if (options.expiresIn) {
        (encrypted as any).expiresAt = Date.now() + options.expiresIn;
      }

      // Store encrypted data
      const storageKey = this.getStorageKey(key);
      sessionStorage.setItem(storageKey, JSON.stringify(encrypted));

      // Record data processing for GDPR compliance
      this.recordDataProcessing(key, data, classification, options);

    } catch (error) {
      console.error('Secure storage failed:', error);
      throw new Error('Failed to store data securely');
    }
  }

  /**
   * Retrieve and decrypt data
   */
  async retrieve(key: string): Promise<any> {
    try {
      const storageKey = this.getStorageKey(key);
      const stored = sessionStorage.getItem(storageKey);
      
      if (!stored) {
        return null;
      }

      const encrypted: EncryptedData & { expiresAt?: number } = JSON.parse(stored);

      // Check expiration
      if (encrypted.expiresAt && Date.now() > encrypted.expiresAt) {
        this.remove(key);
        return null;
      }

      // Decrypt data
      const decrypted = await encryptionService.decrypt(encrypted, key);

      // Update access metadata
      this.updateAccessMetadata(key);

      return decrypted;
    } catch (error) {
      console.error('Secure retrieval failed:', error);
      return null;
    }
  }

  /**
   * Remove data securely
   */
  remove(key: string): void {
    const storageKey = this.getStorageKey(key);
    sessionStorage.removeItem(storageKey);
    
    // Remove processing record
    this.processingRecords.delete(key);
  }

  /**
   * List all stored keys
   */
  list(): string[] {
    const keys: string[] = [];
    const prefix = this.storagePrefix;
    
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(prefix)) {
        keys.push(key.substring(prefix.length));
      }
    }
    
    return keys;
  }

  /**
   * Clear all secure storage
   */
  clear(): void {
    const keys = this.list();
    keys.forEach(key => this.remove(key));
  }

  /**
   * Get data processing records for GDPR compliance
   */
  getProcessingRecords(userId?: string): DataProcessingRecord[] {
    const records = Array.from(this.processingRecords.values());
    return userId ? records.filter(r => r.userId === userId) : records;
  }

  /**
   * Export user data for GDPR portability
   */
  async exportUserData(userId: string): Promise<any> {
    const userRecords = this.getProcessingRecords(userId);
    const exportData: any = {};

    for (const record of userRecords) {
      try {
        const data = await this.retrieve(record.id);
        if (data) {
          exportData[record.id] = {
            data,
            metadata: record,
            exported: new Date().toISOString(),
          };
        }
      } catch (error) {
        console.error(`Failed to export data for key ${record.id}:`, error);
      }
    }

    return exportData;
  }

  /**
   * Delete user data for GDPR erasure
   */
  deleteUserData(userId: string): void {
    const userRecords = this.getProcessingRecords(userId);
    
    for (const record of userRecords) {
      this.remove(record.id);
    }
  }

  /**
   * Private helper methods
   */
  private getStorageKey(key: string): string {
    return `${this.storagePrefix}${key}`;
  }

  private hasValidConsent(key: string): boolean {
    // In a real implementation, this would check consent management system
    const consent = localStorage.getItem(`consent_${key}`);
    return consent === 'granted';
  }

  private recordDataProcessing(
    key: string,
    data: any,
    classification: DataClassification,
    options: any
  ): void {
    const detectedPII = PIIDetectionService.detectPII(data);
    const piiType = options.piiType || (detectedPII.length > 0 ? detectedPII[0].type : undefined);

    const record: DataProcessingRecord = {
      id: key,
      userId: this.extractUserId(data),
      dataType: piiType || PIIType.SESSION_DATA,
      classification,
      purpose: options.purpose || 'Application functionality',
      legalBasis: options.legalBasis || 'Legitimate interest',
      processingDate: Date.now(),
      retentionPeriod: this.getRetentionPeriod(piiType),
      consentGiven: options.requireConsent ? this.hasValidConsent(key) : false,
      dataSource: 'User input',
      securityMeasures: ['AES-GCM encryption', 'Secure key derivation', 'Memory-only keys'],
    };

    this.processingRecords.set(key, record);
  }

  private extractUserId(data: any): string {
    // Try to extract user ID from data
    if (typeof data === 'object' && data !== null) {
      return data.userId || data.id || data.email || 'anonymous';
    }
    return 'anonymous';
  }

  private getRetentionPeriod(piiType?: PIIType): number {
    switch (piiType) {
      case PIIType.QUIZ_RESULTS:
        return DATA_RETENTION.QUIZ_RESULTS;
      case PIIType.USER_PREFERENCES:
        return DATA_RETENTION.PREFERENCES;
      case PIIType.SESSION_DATA:
        return DATA_RETENTION.SESSION_DATA;
      default:
        return DATA_RETENTION.USER_PROFILE;
    }
  }

  private updateAccessMetadata(key: string): void {
    const record = this.processingRecords.get(key);
    if (record) {
      record.lastAccessed = Date.now();
      record.accessCount = (record.accessCount || 0) + 1;
    }
  }
}

// Global instances
export const piiDetection = PIIDetectionService;
export const dataAnonymization = DataAnonymizationService;
export const secureStorage = new SecureStorageService();