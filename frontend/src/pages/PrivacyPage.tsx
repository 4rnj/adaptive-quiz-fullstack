/**
 * Privacy Settings Page
 * Comprehensive privacy management with GDPR compliance
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheckIcon,
  CogIcon,
  DocumentTextIcon,
  ChartBarIcon,
  TrashIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { PrivacyConsent } from '@/components/privacy/PrivacyConsent';
import { useSecureUserPreferences, useSecureStorageManager } from '@/hooks/useSecureStorage';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'react-hot-toast';
import { cn } from '@/utils/cn';

interface PrivacyPageProps {
  className?: string;
}

type TabType = 'consent' | 'data' | 'security' | 'export';

export const PrivacyPage: React.FC<PrivacyPageProps> = ({ className }) => {
  const [activeTab, setActiveTab] = useState<TabType>('consent');
  const [showDeletionConfirm, setShowDeletionConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const { user, clearUserData } = useAuthStore();
  const { data: preferences, store: savePreferences } = useSecureUserPreferences();
  const { 
    exportUserData, 
    deleteAllUserData, 
    getProcessingRecords, 
    isLoading: storageLoading 
  } = useSecureStorageManager();

  /**
   * Handle privacy consent changes
   */
  const handleConsentChange = async (consents: Record<string, boolean>) => {
    try {
      const updatedPreferences = {
        ...preferences,
        privacyConsents: consents,
        lastUpdated: Date.now(),
      };
      
      await savePreferences(updatedPreferences);
      toast.success('Privacy preferences saved');
    } catch (error) {
      toast.error('Failed to save privacy preferences');
      console.error('Privacy preference save failed:', error);
    }
  };

  /**
   * Handle data export
   */
  const handleDataExport = async () => {
    try {
      await exportUserData();
      toast.success('Your data has been exported and downloaded');
    } catch (error) {
      toast.error('Failed to export data');
      console.error('Data export failed:', error);
    }
  };

  /**
   * Handle account deletion
   */
  const handleAccountDeletion = async () => {
    if (!user) return;
    
    setIsDeleting(true);
    
    try {
      // Delete all user data from secure storage
      await deleteAllUserData();
      await clearUserData();
      
      toast.success('All your data has been permanently deleted');
      setShowDeletionConfirm(false);
      
      // Note: In a real app, this would also delete the account from the backend
      
    } catch (error) {
      toast.error('Failed to delete data. Please contact support.');
      console.error('Data deletion failed:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  /**
   * Get processing records summary
   */
  const getDataSummary = () => {
    const records = getProcessingRecords();
    const summary = {
      totalRecords: records.length,
      personalData: records.filter(r => r.dataType.includes('EMAIL') || r.dataType.includes('NAME')).length,
      behavioralData: records.filter(r => r.dataType.includes('QUIZ') || r.dataType.includes('PREFERENCES')).length,
      sessionData: records.filter(r => r.dataType.includes('SESSION')).length,
    };
    
    return summary;
  };

  const dataSummary = getDataSummary();

  /**
   * Tab navigation
   */
  const tabs = [
    { id: 'consent' as TabType, label: 'Privacy Consent', icon: ShieldCheckIcon },
    { id: 'data' as TabType, label: 'My Data', icon: DocumentTextIcon },
    { id: 'security' as TabType, label: 'Security Settings', icon: CogIcon },
    { id: 'export' as TabType, label: 'Data Rights', icon: ChartBarIcon },
  ];

  /**
   * Render tab content
   */
  const renderTabContent = () => {
    switch (activeTab) {
      case 'consent':
        return (
          <PrivacyConsent 
            onConsentChange={handleConsentChange}
            showDataProcessing={false}
          />
        );
        
      case 'data':
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <h3 className="text-xl font-semibold">Data Processing Overview</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Summary of data we process about you
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{dataSummary.totalRecords}</div>
                    <div className="text-sm text-blue-800 dark:text-blue-200">Total Records</div>
                  </div>
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{dataSummary.personalData}</div>
                    <div className="text-sm text-green-800 dark:text-green-200">Personal Data</div>
                  </div>
                  <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">{dataSummary.behavioralData}</div>
                    <div className="text-sm text-purple-800 dark:text-purple-200">Learning Data</div>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="text-2xl font-bold text-gray-600">{dataSummary.sessionData}</div>
                    <div className="text-sm text-gray-700 dark:text-gray-300">Session Data</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <PrivacyConsent 
              onConsentChange={handleConsentChange}
              showDataProcessing={true}
              compact={false}
            />
          </div>
        );
        
      case 'security':
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <h3 className="text-xl font-semibold">Security Information</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Your data protection and security measures
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <div>
                      <h4 className="font-medium text-green-800 dark:text-green-200">End-to-End Encryption</h4>
                      <p className="text-sm text-green-600 dark:text-green-300">All sensitive data is encrypted using AES-256 encryption</p>
                    </div>
                    <ShieldCheckIcon className="w-6 h-6 text-green-600" />
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div>
                      <h4 className="font-medium text-blue-800 dark:text-blue-200">Secure Session Management</h4>
                      <p className="text-sm text-blue-600 dark:text-blue-300">Sessions automatically expire after 30 minutes of inactivity</p>
                    </div>
                    <CogIcon className="w-6 h-6 text-blue-600" />
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                    <div>
                      <h4 className="font-medium text-purple-800 dark:text-purple-200">Data Minimization</h4>
                      <p className="text-sm text-purple-600 dark:text-purple-300">We only collect and process data necessary for functionality</p>
                    </div>
                    <DocumentTextIcon className="w-6 h-6 text-purple-600" />
                  </div>
                </div>
                
                <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <h4 className="font-medium mb-2">Security Features</h4>
                  <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <li>• Memory-only token storage (no localStorage)</li>
                    <li>• PBKDF2 key derivation with 100,000 iterations</li>
                    <li>• Client-side data encryption before storage</li>
                    <li>• Automatic data expiration and cleanup</li>
                    <li>• Rate limiting and brute-force protection</li>
                    <li>• Emergency logout: Ctrl+Shift+L</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        );
        
      case 'export':
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <h3 className="text-xl font-semibold">Your Data Rights</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Exercise your rights under GDPR and privacy regulations
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4">
                  <Button
                    onClick={handleDataExport}
                    disabled={storageLoading}
                    variant="outline"
                    className="h-auto p-6 flex items-center gap-4 text-left"
                  >
                    <ChartBarIcon className="w-8 h-8 text-blue-600" />
                    <div>
                      <h4 className="font-medium">Export My Data</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Download all your data in a portable format
                      </p>
                    </div>
                  </Button>
                  
                  <Button
                    onClick={() => setShowDeletionConfirm(true)}
                    disabled={storageLoading}
                    variant="outline"
                    className="h-auto p-6 flex items-center gap-4 text-left border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
                  >
                    <TrashIcon className="w-8 h-8 text-red-600" />
                    <div>
                      <h4 className="font-medium text-red-600">Delete All My Data</h4>
                      <p className="text-sm text-red-500">
                        Permanently remove all your data (cannot be undone)
                      </p>
                    </div>
                  </Button>
                </div>
                
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <div className="flex items-start gap-3">
                    <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600 mt-0.5" />
                    <div className="text-sm">
                      <h4 className="font-medium text-yellow-800 dark:text-yellow-200">Important Information</h4>
                      <p className="text-yellow-700 dark:text-yellow-300 mt-1">
                        Data exports include all personal information, quiz results, and preferences. 
                        Data deletion is permanent and cannot be reversed.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
        
      default:
        return null;
    }
  };

  return (
    <div className={cn("min-h-screen bg-gray-50 dark:bg-gray-900", className)}>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Privacy Settings
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage your privacy preferences and data protection settings
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 mb-8 bg-gray-200 dark:bg-gray-800 rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {renderTabContent()}
        </motion.div>

        {/* Deletion Confirmation Modal */}
        {showDeletionConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full"
            >
              <div className="flex items-center gap-3 mb-4">
                <ExclamationTriangleIcon className="w-8 h-8 text-red-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Confirm Data Deletion
                </h3>
              </div>
              
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                This action will permanently delete all your data including:
              </p>
              
              <ul className="text-sm text-gray-600 dark:text-gray-400 mb-6 space-y-1">
                <li>• Profile information and preferences</li>
                <li>• Quiz results and learning progress</li>
                <li>• Session data and analytics</li>
                <li>• All encrypted stored data</li>
              </ul>
              
              <p className="text-red-600 dark:text-red-400 text-sm font-medium mb-6">
                This action cannot be undone.
              </p>
              
              <div className="flex gap-3">
                <Button
                  onClick={() => setShowDeletionConfirm(false)}
                  variant="outline"
                  className="flex-1"
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAccountDeletion}
                  variant="destructive"
                  className="flex-1"
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete All Data'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
};