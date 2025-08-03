/**
 * React hooks for secure storage operations
 * Provides encrypted storage with automatic PII detection and GDPR compliance
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  secureStorage, 
  DataClassification, 
  PIIType, 
  DataProcessingRecord 
} from '@/utils/dataProtection';
import { useAuthStore } from '@/store/authStore';

interface SecureStorageOptions {
  classification?: DataClassification;
  piiType?: PIIType;
  expiresIn?: number;
  purpose?: string;
  legalBasis?: string;
  requireConsent?: boolean;
  autoRefresh?: boolean;
}

interface UseSecureStorageReturn<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  store: (value: T, options?: SecureStorageOptions) => Promise<boolean>;
  remove: () => void;
  refresh: () => Promise<void>;
  isExpired: boolean;
  processingRecord: DataProcessingRecord | null;
}

/**
 * Hook for secure storage with encryption and PII protection
 */
export function useSecureStorage<T = any>(
  key: string,
  defaultOptions?: SecureStorageOptions
): UseSecureStorageReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [processingRecord, setProcessingRecord] = useState<DataProcessingRecord | null>(null);
  
  const { user } = useAuthStore();

  /**
   * Load data from secure storage
   */
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const stored = await secureStorage.retrieve(key);
      setData(stored);
      
      // Check processing record
      const records = secureStorage.getProcessingRecords(user?.id);
      const record = records.find(r => r.id === key);
      setProcessingRecord(record || null);
      
      // Check expiration
      if (record && record.retentionPeriod) {
        const expiryTime = record.processingDate + record.retentionPeriod;
        setIsExpired(Date.now() > expiryTime);
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [key, user?.id]);

  /**
   * Store data securely with encryption
   */
  const store = useCallback(async (
    value: T, 
    options: SecureStorageOptions = {}
  ): Promise<boolean> => {
    try {
      setError(null);
      
      const finalOptions = {
        ...defaultOptions,
        ...options,
      };
      
      await secureStorage.store(key, value, finalOptions);
      setData(value);
      
      // Update processing record
      const records = secureStorage.getProcessingRecords(user?.id);
      const record = records.find(r => r.id === key);
      setProcessingRecord(record || null);
      
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to store data');
      return false;
    }
  }, [key, defaultOptions, user?.id]);

  /**
   * Remove data from secure storage
   */
  const remove = useCallback(() => {
    try {
      secureStorage.remove(key);
      setData(null);
      setProcessingRecord(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove data');
    }
  }, [key]);

  /**
   * Refresh data from storage
   */
  const refresh = useCallback(async () => {
    await loadData();
  }, [loadData]);

  // Load data on mount and when key changes
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh if enabled
  useEffect(() => {
    if (defaultOptions?.autoRefresh) {
      const interval = setInterval(loadData, 30000); // 30 seconds
      return () => clearInterval(interval);
    }
  }, [defaultOptions?.autoRefresh, loadData]);

  return {
    data,
    isLoading,
    error,
    store,
    remove,
    refresh,
    isExpired,
    processingRecord,
  };
}

/**
 * Hook for managing user preferences with encryption
 */
export function useSecureUserPreferences() {
  const { user } = useAuthStore();
  const userKey = user ? `user_preferences_${user.id}` : 'user_preferences_anonymous';

  return useSecureStorage(userKey, {
    classification: DataClassification.INTERNAL,
    piiType: PIIType.USER_PREFERENCES,
    purpose: 'User experience personalization',
    legalBasis: 'Legitimate interest',
    expiresIn: 5 * 365 * 24 * 60 * 60 * 1000, // 5 years
  });
}

/**
 * Hook for managing quiz results with encryption
 */
export function useSecureQuizResults() {
  const { user } = useAuthStore();
  const userKey = user ? `quiz_results_${user.id}` : null;

  return useSecureStorage(userKey || 'quiz_results_anonymous', {
    classification: DataClassification.CONFIDENTIAL,
    piiType: PIIType.QUIZ_RESULTS,
    purpose: 'Learning progress tracking and analytics',
    legalBasis: 'Contract performance',
    expiresIn: 2 * 365 * 24 * 60 * 60 * 1000, // 2 years
    requireConsent: true,
  });
}

/**
 * Hook for managing session data with encryption
 */
export function useSecureSessionData() {
  const { user } = useAuthStore();
  const sessionKey = user ? `session_data_${user.id}` : 'session_data_anonymous';

  return useSecureStorage(sessionKey, {
    classification: DataClassification.INTERNAL,
    piiType: PIIType.SESSION_DATA,
    purpose: 'Security and session management',
    legalBasis: 'Security and fraud prevention',
    expiresIn: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}

/**
 * Hook for bulk secure storage operations
 */
export function useSecureStorageManager() {
  const { user } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Export all user data for GDPR compliance
   */
  const exportUserData = useCallback(async () => {
    if (!user?.id) {
      throw new Error('User not authenticated');
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const exportData = await secureStorage.exportUserData(user.id);
      
      // Create downloadable file
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `user_data_export_${user.id}_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      
      URL.revokeObjectURL(url);
      
      return exportData;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Export failed';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  /**
   * Delete all user data for GDPR compliance
   */
  const deleteAllUserData = useCallback(async () => {
    if (!user?.id) {
      throw new Error('User not authenticated');
    }

    try {
      setIsLoading(true);
      setError(null);
      
      secureStorage.deleteUserData(user.id);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Deletion failed';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  /**
   * Get all processing records for user
   */
  const getProcessingRecords = useCallback(() => {
    if (!user?.id) {
      return [];
    }
    return secureStorage.getProcessingRecords(user.id);
  }, [user?.id]);

  /**
   * Clear all secure storage
   */
  const clearAllStorage = useCallback(() => {
    try {
      setError(null);
      secureStorage.clear();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clear failed');
      throw err;
    }
  }, []);

  return {
    isLoading,
    error,
    exportUserData,
    deleteAllUserData,
    getProcessingRecords,
    clearAllStorage,
  };
}

/**
 * Hook for monitoring data processing compliance
 */
export function useDataProcessingMonitor() {
  const { user } = useAuthStore();
  const [records, setRecords] = useState<DataProcessingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshRecords = useCallback(() => {
    try {
      setIsLoading(true);
      const userRecords = user?.id 
        ? secureStorage.getProcessingRecords(user.id)
        : secureStorage.getProcessingRecords();
      setRecords(userRecords);
    } catch (error) {
      console.error('Failed to load processing records:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    refreshRecords();
  }, [refreshRecords]);

  // Categorize records by type
  const categorizedRecords = {
    personal: records.filter(r => [PIIType.EMAIL, PIIType.NAME, PIIType.PHONE].includes(r.dataType)),
    behavioral: records.filter(r => [PIIType.QUIZ_RESULTS, PIIType.USER_PREFERENCES].includes(r.dataType)),
    session: records.filter(r => r.dataType === PIIType.SESSION_DATA),
    other: records.filter(r => ![PIIType.EMAIL, PIIType.NAME, PIIType.PHONE, PIIType.QUIZ_RESULTS, PIIType.USER_PREFERENCES, PIIType.SESSION_DATA].includes(r.dataType)),
  };

  return {
    records,
    categorizedRecords,
    isLoading,
    refreshRecords,
  };
}