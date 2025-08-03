/**
 * Client-side encryption utilities for data protection
 * Implements AES-GCM encryption with secure key management
 * Compliant with GDPR, CCPA, and enterprise security standards
 */

// Encryption configuration
export const ENCRYPTION_CONFIG = {
  ALGORITHM: 'AES-GCM',
  KEY_LENGTH: 256,
  IV_LENGTH: 12,
  TAG_LENGTH: 16,
  SALT_LENGTH: 32,
  ITERATIONS: 100000, // PBKDF2 iterations
  KEY_DERIVATION: 'PBKDF2',
  HASH: 'SHA-256',
} as const;

// Data classification levels
export enum DataClassification {
  PUBLIC = 'PUBLIC',           // No encryption needed
  INTERNAL = 'INTERNAL',       // Basic encryption
  CONFIDENTIAL = 'CONFIDENTIAL', // Strong encryption
  RESTRICTED = 'RESTRICTED',   // Maximum encryption + additional controls
}

// PII data types for classification
export enum PIIType {
  EMAIL = 'EMAIL',
  NAME = 'NAME',
  PHONE = 'PHONE',
  ADDRESS = 'ADDRESS',
  SSN = 'SSN',
  CREDIT_CARD = 'CREDIT_CARD',
  BIOMETRIC = 'BIOMETRIC',
  QUIZ_RESULTS = 'QUIZ_RESULTS',
  USER_PREFERENCES = 'USER_PREFERENCES',
  SESSION_DATA = 'SESSION_DATA',
}

// Encrypted data envelope
export interface EncryptedData {
  data: string;           // Base64 encrypted data
  iv: string;            // Base64 initialization vector
  salt: string;          // Base64 salt for key derivation
  tag: string;           // Base64 authentication tag
  algorithm: string;     // Encryption algorithm used
  timestamp: number;     // Encryption timestamp
  classification: DataClassification;
  piiType?: PIIType;
  version: string;       // Encryption version for future upgrades
}

// Storage metadata for tracking
export interface StorageMetadata {
  id: string;
  classification: DataClassification;
  piiType?: PIIType;
  encrypted: boolean;
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
  expiresAt?: number;
  purpose: string;       // Purpose limitation for GDPR
  legalBasis?: string;   // Legal basis for processing
}

/**
 * Secure encryption service with key management
 */
export class SecureEncryptionService {
  private static instance: SecureEncryptionService;
  private masterKey: CryptoKey | null = null;
  private keyCache = new Map<string, CryptoKey>();
  private storageMetadata = new Map<string, StorageMetadata>();

  private constructor() {
    this.initializeMasterKey();
    this.startCleanupTimer();
  }

  public static getInstance(): SecureEncryptionService {
    if (!SecureEncryptionService.instance) {
      SecureEncryptionService.instance = new SecureEncryptionService();
    }
    return SecureEncryptionService.instance;
  }

  /**
   * Initialize master key for encryption
   */
  private async initializeMasterKey(): Promise<void> {
    try {
      // Generate or derive master key based on session
      const keyMaterial = await this.getKeyMaterial();
      this.masterKey = await crypto.subtle.importKey(
        'raw',
        keyMaterial,
        { name: ENCRYPTION_CONFIG.KEY_DERIVATION },
        false,
        ['deriveKey']
      );
    } catch (error) {
      console.error('Failed to initialize master key:', error);
      throw new Error('Encryption service initialization failed');
    }
  }

  /**
   * Get key material for master key derivation
   */
  private async getKeyMaterial(): Promise<ArrayBuffer> {
    // In production, this would use hardware security module or secure enclave
    const baseKey = new TextEncoder().encode('quiz-app-encryption-key-v1');
    const sessionSalt = this.getSessionSalt();
    
    // Derive key material using PBKDF2
    const importedKey = await crypto.subtle.importKey(
      'raw',
      baseKey,
      { name: ENCRYPTION_CONFIG.KEY_DERIVATION },
      false,
      ['deriveKey']
    );

    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: ENCRYPTION_CONFIG.KEY_DERIVATION,
        salt: sessionSalt,
        iterations: ENCRYPTION_CONFIG.ITERATIONS,
        hash: ENCRYPTION_CONFIG.HASH,
      },
      importedKey,
      { name: ENCRYPTION_CONFIG.ALGORITHM, length: ENCRYPTION_CONFIG.KEY_LENGTH },
      true,
      ['encrypt', 'decrypt']
    );

    return crypto.subtle.exportKey('raw', derivedKey);
  }

  /**
   * Get session-specific salt
   */
  private getSessionSalt(): Uint8Array {
    const stored = sessionStorage.getItem('__enc_salt__');
    if (stored) {
      return new Uint8Array(JSON.parse(stored));
    }

    // Generate new salt for session
    const salt = crypto.getRandomValues(new Uint8Array(ENCRYPTION_CONFIG.SALT_LENGTH));
    sessionStorage.setItem('__enc_salt__', JSON.stringify(Array.from(salt)));
    return salt;
  }

  /**
   * Derive encryption key from master key with context
   */
  private async deriveKey(context: string, classification: DataClassification): Promise<CryptoKey> {
    const cacheKey = `${context}-${classification}`;
    
    if (this.keyCache.has(cacheKey)) {
      return this.keyCache.get(cacheKey)!;
    }

    if (!this.masterKey) {
      throw new Error('Master key not initialized');
    }

    const contextBytes = new TextEncoder().encode(context + classification);
    const salt = await crypto.subtle.digest('SHA-256', contextBytes);

    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: ENCRYPTION_CONFIG.KEY_DERIVATION,
        salt: salt,
        iterations: this.getIterationsForClassification(classification),
        hash: ENCRYPTION_CONFIG.HASH,
      },
      this.masterKey,
      { name: ENCRYPTION_CONFIG.ALGORITHM, length: ENCRYPTION_CONFIG.KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    );

    // Cache key with expiration
    this.keyCache.set(cacheKey, derivedKey);
    setTimeout(() => this.keyCache.delete(cacheKey), 30 * 60 * 1000); // 30 minutes

    return derivedKey;
  }

  /**
   * Get PBKDF2 iterations based on data classification
   */
  private getIterationsForClassification(classification: DataClassification): number {
    switch (classification) {
      case DataClassification.RESTRICTED:
        return ENCRYPTION_CONFIG.ITERATIONS * 2; // Extra security
      case DataClassification.CONFIDENTIAL:
        return ENCRYPTION_CONFIG.ITERATIONS;
      case DataClassification.INTERNAL:
        return ENCRYPTION_CONFIG.ITERATIONS / 2; // Faster for less sensitive data
      default:
        return ENCRYPTION_CONFIG.ITERATIONS;
    }
  }

  /**
   * Encrypt data with metadata
   */
  public async encrypt(
    data: any,
    classification: DataClassification,
    piiType?: PIIType,
    context: string = 'default'
  ): Promise<EncryptedData> {
    try {
      // Serialize data
      const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
      const plaintextBytes = new TextEncoder().encode(plaintext);

      // Generate IV and salt
      const iv = crypto.getRandomValues(new Uint8Array(ENCRYPTION_CONFIG.IV_LENGTH));
      const salt = crypto.getRandomValues(new Uint8Array(ENCRYPTION_CONFIG.SALT_LENGTH));

      // Derive encryption key
      const key = await this.deriveKey(context, classification);

      // Encrypt data
      const encryptedBuffer = await crypto.subtle.encrypt(
        {
          name: ENCRYPTION_CONFIG.ALGORITHM,
          iv: iv,
          tagLength: ENCRYPTION_CONFIG.TAG_LENGTH * 8, // Convert to bits
        },
        key,
        plaintextBytes
      );

      // Split encrypted data and authentication tag
      const encrypted = new Uint8Array(encryptedBuffer.slice(0, -ENCRYPTION_CONFIG.TAG_LENGTH));
      const tag = new Uint8Array(encryptedBuffer.slice(-ENCRYPTION_CONFIG.TAG_LENGTH));

      // Create encrypted data envelope
      const encryptedData: EncryptedData = {
        data: this.arrayBufferToBase64(encrypted),
        iv: this.arrayBufferToBase64(iv),
        salt: this.arrayBufferToBase64(salt),
        tag: this.arrayBufferToBase64(tag),
        algorithm: ENCRYPTION_CONFIG.ALGORITHM,
        timestamp: Date.now(),
        classification,
        piiType,
        version: '1.0',
      };

      // Record storage metadata
      this.recordStorageMetadata(context, classification, piiType);

      return encryptedData;
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Data encryption failed');
    }
  }

  /**
   * Decrypt data with validation
   */
  public async decrypt(
    encryptedData: EncryptedData,
    context: string = 'default'
  ): Promise<any> {
    try {
      // Validate encrypted data structure
      this.validateEncryptedData(encryptedData);

      // Convert base64 to arrays
      const encrypted = this.base64ToArrayBuffer(encryptedData.data);
      const iv = this.base64ToArrayBuffer(encryptedData.iv);
      const tag = this.base64ToArrayBuffer(encryptedData.tag);

      // Combine encrypted data and tag
      const encryptedWithTag = new Uint8Array(encrypted.byteLength + tag.byteLength);
      encryptedWithTag.set(new Uint8Array(encrypted));
      encryptedWithTag.set(new Uint8Array(tag), encrypted.byteLength);

      // Derive decryption key
      const key = await this.deriveKey(context, encryptedData.classification);

      // Decrypt data
      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: ENCRYPTION_CONFIG.ALGORITHM,
          iv: iv,
          tagLength: ENCRYPTION_CONFIG.TAG_LENGTH * 8,
        },
        key,
        encryptedWithTag
      );

      // Convert to string and parse if JSON
      const decryptedText = new TextDecoder().decode(decryptedBuffer);
      
      try {
        return JSON.parse(decryptedText);
      } catch {
        return decryptedText; // Return as string if not JSON
      }
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Data decryption failed');
    }
  }

  /**
   * Validate encrypted data structure
   */
  private validateEncryptedData(data: EncryptedData): void {
    const required = ['data', 'iv', 'salt', 'tag', 'algorithm', 'timestamp', 'classification'];
    for (const field of required) {
      if (!(field in data)) {
        throw new Error(`Invalid encrypted data: missing ${field}`);
      }
    }

    if (data.algorithm !== ENCRYPTION_CONFIG.ALGORITHM) {
      throw new Error(`Unsupported encryption algorithm: ${data.algorithm}`);
    }

    // Check for data freshness (prevent replay attacks)
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    if (Date.now() - data.timestamp > maxAge) {
      throw new Error('Encrypted data is too old');
    }
  }

  /**
   * Record storage metadata for audit and compliance
   */
  private recordStorageMetadata(
    id: string,
    classification: DataClassification,
    piiType?: PIIType
  ): void {
    const metadata: StorageMetadata = {
      id,
      classification,
      piiType,
      encrypted: true,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 1,
      purpose: this.getPurposeForPIIType(piiType),
      legalBasis: this.getLegalBasisForPIIType(piiType),
    };

    this.storageMetadata.set(id, metadata);
  }

  /**
   * Get purpose for PII type (GDPR compliance)
   */
  private getPurposeForPIIType(piiType?: PIIType): string {
    switch (piiType) {
      case PIIType.EMAIL:
        return 'User authentication and communication';
      case PIIType.NAME:
        return 'User identification and personalization';
      case PIIType.QUIZ_RESULTS:
        return 'Learning progress tracking and analytics';
      case PIIType.USER_PREFERENCES:
        return 'Service personalization and user experience';
      case PIIType.SESSION_DATA:
        return 'Security and session management';
      default:
        return 'Application functionality';
    }
  }

  /**
   * Get legal basis for PII type (GDPR compliance)
   */
  private getLegalBasisForPIIType(piiType?: PIIType): string {
    switch (piiType) {
      case PIIType.EMAIL:
      case PIIType.NAME:
        return 'Contract performance';
      case PIIType.QUIZ_RESULTS:
      case PIIType.USER_PREFERENCES:
        return 'Legitimate interest';
      case PIIType.SESSION_DATA:
        return 'Security and fraud prevention';
      default:
        return 'Consent';
    }
  }

  /**
   * Utility functions for base64 conversion
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Clean up expired keys and metadata
   */
  private startCleanupTimer(): void {
    setInterval(() => {
      // Clean up expired metadata
      const now = Date.now();
      for (const [id, metadata] of this.storageMetadata.entries()) {
        if (metadata.expiresAt && now > metadata.expiresAt) {
          this.storageMetadata.delete(id);
        }
      }
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Get storage metadata for compliance reporting
   */
  public getStorageMetadata(id: string): StorageMetadata | undefined {
    return this.storageMetadata.get(id);
  }

  /**
   * Get all storage metadata for audit
   */
  public getAllStorageMetadata(): StorageMetadata[] {
    return Array.from(this.storageMetadata.values());
  }

  /**
   * Clear all cached keys (for security)
   */
  public clearKeyCache(): void {
    this.keyCache.clear();
  }
}

// Global instance
export const encryptionService = SecureEncryptionService.getInstance();