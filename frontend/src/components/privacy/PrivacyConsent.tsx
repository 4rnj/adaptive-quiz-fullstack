/**
 * Privacy Consent Component
 * GDPR-compliant consent management with granular permissions
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheckIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  TrashIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useSecureStorageManager, useDataProcessingMonitor } from '@/hooks/useSecureStorage';
import { PIIType, DataClassification, GDPRRight } from '@/utils/dataProtection';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'react-hot-toast';
import { cn } from '@/utils/cn';

interface ConsentItem {
  id: string;
  title: string;
  description: string;
  piiTypes: PIIType[];
  required: boolean;
  enabled: boolean;
}

interface PrivacyConsentProps {
  onConsentChange?: (consents: Record<string, boolean>) => void;
  showDataProcessing?: boolean;
  compact?: boolean;
}

const DEFAULT_CONSENTS: ConsentItem[] = [
  {
    id: 'essential',
    title: 'Essential Functionality',
    description: 'Required for basic app functionality, authentication, and security.',
    piiTypes: [PIIType.EMAIL, PIIType.SESSION_DATA],
    required: true,
    enabled: true,
  },
  {
    id: 'analytics',
    title: 'Learning Analytics',
    description: 'Track your quiz performance and learning progress to provide personalized recommendations.',
    piiTypes: [PIIType.QUIZ_RESULTS],
    required: false,
    enabled: false,
  },
  {
    id: 'personalization',
    title: 'Personalization',
    description: 'Remember your preferences, settings, and customize your experience.',
    piiTypes: [PIIType.USER_PREFERENCES],
    required: false,
    enabled: false,
  },
  {
    id: 'communication',
    title: 'Communication',
    description: 'Send you important updates, notifications, and educational content.',
    piiTypes: [PIIType.EMAIL, PIIType.NAME],
    required: false,
    enabled: false,
  },
];

export const PrivacyConsent: React.FC<PrivacyConsentProps> = ({
  onConsentChange,
  showDataProcessing = false,
  compact = false
}) => {
  const [consents, setConsents] = useState<ConsentItem[]>(DEFAULT_CONSENTS);
  const [showDetails, setShowDetails] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const { user } = useAuthStore();
  const { 
    exportUserData, 
    deleteAllUserData, 
    isLoading: storageLoading 
  } = useSecureStorageManager();
  const { 
    records, 
    categorizedRecords, 
    isLoading: recordsLoading,
    refreshRecords 
  } = useDataProcessingMonitor();

  /**
   * Load saved consents from localStorage
   */
  useEffect(() => {
    try {
      const saved = localStorage.getItem('privacy_consents');
      if (saved) {
        const savedConsents = JSON.parse(saved);
        setConsents(current => 
          current.map(consent => ({
            ...consent,
            enabled: consent.required || savedConsents[consent.id] || false
          }))
        );
      }
    } catch (error) {
      console.error('Failed to load saved consents:', error);
    }
  }, []);

  /**
   * Handle consent toggle
   */
  const handleConsentToggle = (id: string, enabled: boolean) => {
    const updatedConsents = consents.map(consent =>
      consent.id === id ? { ...consent, enabled } : consent
    );
    
    setConsents(updatedConsents);
    
    // Save to localStorage
    const consentMap = updatedConsents.reduce((acc, consent) => ({
      ...acc,
      [consent.id]: consent.enabled
    }), {});
    
    localStorage.setItem('privacy_consents', JSON.stringify(consentMap));
    localStorage.setItem(`consent_timestamp_${id}`, Date.now().toString());
    
    // Notify parent component
    onConsentChange?.(consentMap);
    
    toast.success(`Privacy preference updated for ${updatedConsents.find(c => c.id === id)?.title}`);
  };

  /**
   * Accept all non-required consents
   */
  const handleAcceptAll = () => {
    const updatedConsents = consents.map(consent => ({
      ...consent,
      enabled: true
    }));
    
    setConsents(updatedConsents);
    
    const consentMap = updatedConsents.reduce((acc, consent) => ({
      ...acc,
      [consent.id]: true
    }), {});
    
    localStorage.setItem('privacy_consents', JSON.stringify(consentMap));
    
    // Save timestamp for all consents
    updatedConsents.forEach(consent => {
      localStorage.setItem(`consent_timestamp_${consent.id}`, Date.now().toString());
    });
    
    onConsentChange?.(consentMap);
    toast.success('All privacy preferences accepted');
  };

  /**
   * Reject all non-required consents
   */
  const handleRejectAll = () => {
    const updatedConsents = consents.map(consent => ({
      ...consent,
      enabled: consent.required
    }));
    
    setConsents(updatedConsents);
    
    const consentMap = updatedConsents.reduce((acc, consent) => ({
      ...acc,
      [consent.id]: consent.enabled
    }), {});
    
    localStorage.setItem('privacy_consents', JSON.stringify(consentMap));
    onConsentChange?.(consentMap);
    toast.success('Non-essential privacy preferences rejected');
  };

  /**
   * Exercise GDPR rights
   */
  const handleExerciseRight = async (right: GDPRRight) => {
    if (!user) {
      toast.error('Please log in to exercise your data rights');
      return;
    }

    setIsProcessing(true);
    
    try {
      switch (right) {
        case GDPRRight.ACCESS:
          await exportUserData();
          toast.success('Your data has been exported and downloaded');
          break;
          
        case GDPRRight.ERASURE:
          if (window.confirm('This will permanently delete all your data. This action cannot be undone.')) {
            await deleteAllUserData();
            toast.success('Your data has been permanently deleted');
          }
          break;
          
        case GDPRRight.PORTABILITY:
          await exportUserData();
          toast.success('Your data export is ready for download');
          break;
          
        default:
          toast.info('This right can be exercised by contacting support');
      }
    } catch (error) {
      toast.error('Failed to process your request. Please try again.');
      console.error('GDPR right exercise failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Get classification color
   */
  const getClassificationColor = (classification: DataClassification) => {
    switch (classification) {
      case DataClassification.RESTRICTED:
        return 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800';
      case DataClassification.CONFIDENTIAL:
        return 'text-orange-600 bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800';
      case DataClassification.INTERNAL:
        return 'text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-600';
    }
  };

  if (compact) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold">Privacy Settings</h3>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {consents.map((consent) => (
            <div key={consent.id} className="flex items-center justify-between">
              <div className="flex-1">
                <h4 className="font-medium text-sm">{consent.title}</h4>
                <p className="text-xs text-gray-600 dark:text-gray-400">{consent.description}</p>
              </div>
              <Switch
                checked={consent.enabled}
                onCheckedChange={(enabled) => handleConsentToggle(consent.id, enabled)}
                disabled={consent.required}
                className="ml-4"
              />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main Consent Panel */}
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center gap-3">
            <ShieldCheckIcon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Privacy Preferences
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Control how your data is collected and used
              </p>
            </div>
          </div>
          
          <div className="flex gap-2 mt-4">
            <Button onClick={handleAcceptAll} variant="default" size="sm">
              Accept All
            </Button>
            <Button onClick={handleRejectAll} variant="outline" size="sm">
              Reject Non-Essential
            </Button>
            <Button 
              onClick={() => setShowDetails(!showDetails)} 
              variant="ghost" 
              size="sm"
              className="ml-auto"
            >
              <InformationCircleIcon className="w-4 h-4 mr-1" />
              {showDetails ? 'Hide' : 'Show'} Details
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {consents.map((consent) => (
            <motion.div
              key={consent.id}
              initial={false}
              animate={{ opacity: 1 }}
              className={cn(
                "p-4 border rounded-lg transition-colors",
                consent.enabled 
                  ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                  : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                      {consent.title}
                    </h3>
                    {consent.required && (
                      <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                        Required
                      </span>
                    )}
                    {consent.enabled && (
                      <CheckCircleIcon className="w-4 h-4 text-green-600" />
                    )}
                  </div>
                  
                  <p className="text-gray-600 dark:text-gray-400 mb-2">
                    {consent.description}
                  </p>
                  
                  {showDetails && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="text-sm text-gray-500 dark:text-gray-400"
                    >
                      <strong>Data types:</strong>{' '}
                      {consent.piiTypes.map(type => type.replace('_', ' ')).join(', ')}
                    </motion.div>
                  )}
                </div>
                
                <Switch
                  checked={consent.enabled}
                  onCheckedChange={(enabled) => handleConsentToggle(consent.id, enabled)}
                  disabled={consent.required}
                  className="ml-4"
                />
              </div>
            </motion.div>
          ))}
        </CardContent>
      </Card>

      {/* GDPR Rights Panel */}
      {user && (
        <Card className="w-full">
          <CardHeader>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Your Data Rights
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Exercise your rights under GDPR and other privacy regulations
            </p>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button
                onClick={() => handleExerciseRight(GDPRRight.ACCESS)}
                disabled={isProcessing || storageLoading}
                variant="outline"
                className="h-auto p-4 flex flex-col items-center gap-2"
              >
                <EyeIcon className="w-6 h-6" />
                <div className="text-center">
                  <div className="font-medium">Access Data</div>
                  <div className="text-sm text-gray-600">Download your data</div>
                </div>
              </Button>
              
              <Button
                onClick={() => handleExerciseRight(GDPRRight.PORTABILITY)}
                disabled={isProcessing || storageLoading}
                variant="outline"
                className="h-auto p-4 flex flex-col items-center gap-2"
              >
                <ArrowDownTrayIcon className="w-6 h-6" />
                <div className="text-center">
                  <div className="font-medium">Export Data</div>
                  <div className="text-sm text-gray-600">Portable format</div>
                </div>
              </Button>
              
              <Button
                onClick={() => handleExerciseRight(GDPRRight.ERASURE)}
                disabled={isProcessing || storageLoading}
                variant="outline"
                className="h-auto p-4 flex flex-col items-center gap-2 text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50"
              >
                <TrashIcon className="w-6 h-6" />
                <div className="text-center">
                  <div className="font-medium">Delete Data</div>
                  <div className="text-sm">Permanent removal</div>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data Processing Records */}
      {showDataProcessing && user && (
        <Card className="w-full">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Data Processing Records
              </h3>
              <Button onClick={refreshRecords} variant="ghost" size="sm">
                Refresh
              </Button>
            </div>
            <p className="text-gray-600 dark:text-gray-400">
              Transparency into how your data is being processed
            </p>
          </CardHeader>
          
          <CardContent>
            {recordsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : records.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No data processing records found
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(categorizedRecords).map(([category, categoryRecords]) => (
                  categoryRecords.length > 0 && (
                    <div key={category} className="space-y-2">
                      <h4 className="font-medium text-gray-900 dark:text-gray-100 capitalize">
                        {category} Data ({categoryRecords.length})
                      </h4>
                      <div className="space-y-2">
                        {categoryRecords.map((record) => (
                          <div
                            key={record.id}
                            className={cn(
                              "p-3 rounded-lg border text-sm",
                              getClassificationColor(record.classification)
                            )}
                          >
                            <div className="flex justify-between items-start mb-1">
                              <span className="font-medium">{record.purpose}</span>
                              <span className="text-xs opacity-75">
                                {record.classification}
                              </span>
                            </div>
                            <div className="text-xs opacity-75">
                              Legal basis: {record.legalBasis} • 
                              Processed: {new Date(record.processingDate).toLocaleDateString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};