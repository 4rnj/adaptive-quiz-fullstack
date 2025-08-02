/**
 * Session Review Component - Final review before creating session
 * Shows complete configuration summary and allows session creation
 */

import React from 'react';
import { motion } from 'framer-motion';
import { 
  CheckCircleIcon,
  ClockIcon,
  AcademicCapIcon,
  CogIcon,
  GlobeAltIcon,
  LightBulbIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { useSessionCreationStore } from '@/store/sessionStore';
import clsx from 'clsx';

export const SessionReview: React.FC = () => {
  const {
    sessionName,
    selectedSources,
    settings,
    isValid,
    errors,
    getSessionConfig,
  } = useSessionCreationStore();

  const config = getSessionConfig();
  
  const getTotalQuestions = () => {
    return selectedSources.reduce((total, source) => total + source.questionCount, 0);
  };

  const getEstimatedTime = () => {
    return Math.round(getTotalQuestions() * 2); // 2 minutes per question
  };

  const getSourcesByCategory = () => {
    const grouped = selectedSources.reduce((acc, source) => {
      if (!acc[source.category]) {
        acc[source.category] = [];
      }
      acc[source.category].push(source);
      return acc;
    }, {} as Record<string, typeof selectedSources>);
    
    return grouped;
  };

  const sourcesByCategory = getSourcesByCategory();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Review Your Session</h2>
        <p className="text-gray-600">
          Review your configuration before creating the adaptive quiz session.
        </p>
      </div>

      {/* Validation Status */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={clsx('border rounded-lg p-4', {
          'border-green-200 bg-green-50': isValid,
          'border-red-200 bg-red-50': !isValid,
        })}
      >
        <div className="flex items-center space-x-3">
          {isValid ? (
            <CheckCircleIcon className="w-6 h-6 text-green-600" />
          ) : (
            <ExclamationTriangleIcon className="w-6 h-6 text-red-600" />
          )}
          <div>
            <h3 className={clsx('font-semibold', {
              'text-green-800': isValid,
              'text-red-800': !isValid,
            })}>
              {isValid ? 'Configuration Valid' : 'Configuration Issues'}
            </h3>
            <p className={clsx('text-sm', {
              'text-green-600': isValid,
              'text-red-600': !isValid,
            })}>
              {isValid 
                ? 'Your session is ready to be created!'
                : `${Object.keys(errors).length} error${Object.keys(errors).length > 1 ? 's' : ''} need to be fixed.`
              }
            </p>
          </div>
        </div>

        {!isValid && Object.keys(errors).length > 0 && (
          <div className="mt-4 pl-9">
            <ul className="text-sm text-red-700 space-y-1">
              {Object.entries(errors).map(([key, message]) => (
                <li key={key}>• {message}</li>
              ))}
            </ul>
          </div>
        )}
      </motion.div>

      {/* Session Overview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white border border-gray-200 rounded-lg p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Session Overview</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mx-auto mb-2">
              <AcademicCapIcon className="w-6 h-6 text-primary-600" />
            </div>
            <div className="text-2xl font-bold text-gray-900">{getTotalQuestions()}</div>
            <div className="text-sm text-gray-600">Total Questions</div>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-2">
              <ClockIcon className="w-6 h-6 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-gray-900">~{getEstimatedTime()}</div>
            <div className="text-sm text-gray-600">Minutes</div>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-2">
              <GlobeAltIcon className="w-6 h-6 text-green-600" />
            </div>
            <div className="text-2xl font-bold text-gray-900">{selectedSources.length}</div>
            <div className="text-sm text-gray-600">Sources</div>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-2">
              <CogIcon className="w-6 h-6 text-purple-600" />
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {Object.keys(sourcesByCategory).length}
            </div>
            <div className="text-sm text-gray-600">Categories</div>
          </div>
        </div>
      </motion.div>

      {/* Session Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Basic Information */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white border border-gray-200 rounded-lg p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Session Information</h3>
          
          <div className="space-y-3">
            <div>
              <span className="text-sm font-medium text-gray-700">Session Name:</span>
              <div className="mt-1 text-gray-900">{sessionName}</div>
            </div>

            <div>
              <span className="text-sm font-medium text-gray-700">Estimated Duration:</span>
              <div className="mt-1 text-gray-900">
                {getEstimatedTime()} minutes ({Math.round(getEstimatedTime() / 60)} hours)
              </div>
            </div>

            <div>
              <span className="text-sm font-medium text-gray-700">Question Distribution:</span>
              <div className="mt-1 space-y-1">
                {Object.entries(sourcesByCategory).map(([category, sources]) => {
                  const categoryTotal = sources.reduce((sum, s) => sum + s.questionCount, 0);
                  return (
                    <div key={category} className="flex justify-between text-sm">
                      <span className="text-gray-600 capitalize">{category}:</span>
                      <span className="font-medium">{categoryTotal} questions</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Adaptive Learning Settings */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white border border-gray-200 rounded-lg p-6"
        >
          <div className="flex items-center space-x-2 mb-4">
            <LightBulbIcon className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900">Learning Configuration</h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Adaptive Learning:</span>
              <span className={clsx('text-sm font-medium', {
                'text-green-600': settings.adaptiveLearning,
                'text-gray-500': !settings.adaptiveLearning,
              })}>
                {settings.adaptiveLearning ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            {settings.adaptiveLearning && (
              <div className="bg-primary-50 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-2">
                  <ArrowPathIcon className="w-4 h-4 text-primary-600" />
                  <span className="text-sm font-medium text-primary-800">Review Strategy</span>
                </div>
                <div className="text-sm text-primary-700">
                  <strong>{settings.wrongAnswerPercentage}%</strong> of questions will come from your wrong answer pool
                </div>
                <div className="text-xs text-primary-600 mt-1">
                  Questions answered incorrectly will be asked again immediately with shuffled answers
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Question Order:</span>
              <span className="text-sm font-medium text-gray-900">
                {settings.randomizeQuestions ? 'Randomized' : 'Sequential'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Time Limit:</span>
              <span className="text-sm font-medium text-gray-900">
                {settings.timeLimit ? `${settings.timeLimit} minutes` : 'None'}
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Sources Detail */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white border border-gray-200 rounded-lg p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Selected Sources</h3>
        
        <div className="space-y-4">
          {Object.entries(sourcesByCategory).map(([category, sources]) => (
            <div key={category} className="border border-gray-100 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-3 capitalize">{category}</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sources.map((source, index) => (
                  <div key={`${source.provider}-${source.certificate}-${index}`} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                    <div>
                      <div className="font-medium text-gray-900 text-sm">
                        {source.provider} - {source.certificate}
                      </div>
                      <div className="text-xs text-gray-600">
                        Language: {source.language}
                      </div>
                    </div>
                    <div className="text-sm font-medium text-primary-600">
                      {source.questionCount} questions
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Final Notes */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-blue-50 border border-blue-200 rounded-lg p-4"
      >
        <div className="flex items-start space-x-3">
          <LightBulbIcon className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Ready to start learning?</p>
            <p>
              Your adaptive quiz session will intelligently adjust to your performance, 
              focusing on areas where you need the most practice. Wrong answers will be 
              immediately re-asked with shuffled choices to reinforce learning.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};