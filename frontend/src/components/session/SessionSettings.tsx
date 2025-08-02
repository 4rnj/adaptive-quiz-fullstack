/**
 * Session Settings Component - Configure adaptive learning settings
 * Handles adaptive learning parameters and session preferences
 */

import React from 'react';
import { motion } from 'framer-motion';
import { 
  CogIcon,
  LightBulbIcon,
  ArrowPathIcon,
  ClockIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import { useSessionCreationStore } from '@/store/sessionStore';
import clsx from 'clsx';

export const SessionSettings: React.FC = () => {
  const {
    settings,
    errors,
    updateSettings,
  } = useSessionCreationStore();

  const handleToggle = (key: keyof typeof settings) => {
    updateSettings({ [key]: !settings[key] });
  };

  const handleSliderChange = (key: keyof typeof settings, value: number) => {
    updateSettings({ [key]: value });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Configure Session Settings</h2>
        <p className="text-gray-600">
          Customize how the adaptive learning system will work for your session.
        </p>
      </div>

      {/* Adaptive Learning Settings */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-primary-50 to-blue-50 border border-primary-200 rounded-lg p-6"
      >
        <div className="flex items-center space-x-3 mb-4">
          <LightBulbIcon className="w-6 h-6 text-primary-600" />
          <h3 className="text-lg font-semibold text-gray-900">Adaptive Learning</h3>
        </div>

        <div className="space-y-6">
          {/* Enable Adaptive Learning */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h4 className="font-medium text-gray-900 mb-1">Enable Adaptive Learning</h4>
              <p className="text-sm text-gray-600">
                Automatically adjust question selection based on your performance. 
                Wrong answers will be asked again immediately with shuffled choices.
              </p>
            </div>
            <button
              onClick={() => handleToggle('adaptiveLearning')}
              className={clsx(
                'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
                {
                  'bg-primary-600': settings.adaptiveLearning,
                  'bg-gray-200': !settings.adaptiveLearning,
                }
              )}
            >
              <span
                className={clsx(
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                  {
                    'translate-x-5': settings.adaptiveLearning,
                    'translate-x-0': !settings.adaptiveLearning,
                  }
                )}
              />
            </button>
          </div>

          {/* Wrong Answer Percentage */}
          {settings.adaptiveLearning && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-white rounded-lg p-4 border border-primary-200"
            >
              <div className="flex items-center space-x-2 mb-3">
                <ArrowPathIcon className="w-4 h-4 text-primary-600" />
                <h4 className="font-medium text-gray-900">Review Question Frequency</h4>
              </div>
              
              <p className="text-sm text-gray-600 mb-4">
                Percentage of new questions that will come from your wrong answer pool. 
                Higher values mean more review of previously missed questions.
              </p>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    {settings.wrongAnswerPercentage}% from review pool
                  </span>
                  <span className="text-sm text-gray-500">
                    {100 - settings.wrongAnswerPercentage}% new questions
                  </span>
                </div>

                <input
                  type="range"
                  min="0"
                  max="50"
                  step="5"
                  value={settings.wrongAnswerPercentage}
                  onChange={(e) => handleSliderChange('wrongAnswerPercentage', parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                />

                <div className="flex justify-between text-xs text-gray-500">
                  <span>0% (No review)</span>
                  <span>25% (Balanced)</span>
                  <span>50% (Heavy review)</span>
                </div>
              </div>

              {errors.wrongAnswerPercentage && (
                <p className="mt-2 text-sm text-red-600">{errors.wrongAnswerPercentage}</p>
              )}

              {/* Information box */}
              <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-start space-x-2">
                  <InformationCircleIcon className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-800">
                    <strong>How it works:</strong> When you answer a question incorrectly, it gets added to your review pool. 
                    The system will periodically select questions from this pool based on the percentage you set. 
                    You need to answer each question correctly twice to remove it from the review pool.
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Question Presentation Settings */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white border border-gray-200 rounded-lg p-6"
      >
        <div className="flex items-center space-x-3 mb-4">
          <CogIcon className="w-6 h-6 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">Question Presentation</h3>
        </div>

        <div className="space-y-6">
          {/* Randomize Questions */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h4 className="font-medium text-gray-900 mb-1">Randomize Question Order</h4>
              <p className="text-sm text-gray-600">
                Present questions in random order rather than sequential order. 
                This helps prevent pattern memorization and improves learning retention.
              </p>
            </div>
            <button
              onClick={() => handleToggle('randomizeQuestions')}
              className={clsx(
                'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
                {
                  'bg-primary-600': settings.randomizeQuestions,
                  'bg-gray-200': !settings.randomizeQuestions,
                }
              )}
            >
              <span
                className={clsx(
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                  {
                    'translate-x-5': settings.randomizeQuestions,
                    'translate-x-0': !settings.randomizeQuestions,
                  }
                )}
              />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Time Management (Optional) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white border border-gray-200 rounded-lg p-6"
      >
        <div className="flex items-center space-x-3 mb-4">
          <ClockIcon className="w-6 h-6 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">Time Management</h3>
        </div>

        <div className="space-y-6">
          {/* Time Limit Toggle */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h4 className="font-medium text-gray-900 mb-1">Enable Time Limit</h4>
              <p className="text-sm text-gray-600">
                Set a time limit for the entire session. When enabled, the session will automatically 
                end when the time runs out.
              </p>
            </div>
            <button
              onClick={() => handleToggle('timeLimit')}
              className={clsx(
                'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
                {
                  'bg-primary-600': settings.timeLimit,
                  'bg-gray-200': !settings.timeLimit,
                }
              )}
            >
              <span
                className={clsx(
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                  {
                    'translate-x-5': settings.timeLimit,
                    'translate-x-0': !settings.timeLimit,
                  }
                )}
              />
            </button>
          </div>

          {/* Time Limit Setting */}
          {settings.timeLimit && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-gray-50 rounded-lg p-4"
            >
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Session Time Limit (minutes)
              </label>
              <input
                type="number"
                min="10"
                max="300"
                step="5"
                value={settings.timeLimit || 60}
                onChange={(e) => handleSliderChange('timeLimit', parseInt(e.target.value) || 60)}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              <p className="mt-1 text-sm text-gray-500">
                Recommended: 2-3 minutes per question
              </p>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-gray-50 border border-gray-200 rounded-lg p-4"
      >
        <h4 className="font-medium text-gray-900 mb-3">Configuration Summary</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Adaptive Learning:</span>
            <span className={clsx('ml-2 font-medium', {
              'text-green-600': settings.adaptiveLearning,
              'text-gray-500': !settings.adaptiveLearning,
            })}>
              {settings.adaptiveLearning ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          
          {settings.adaptiveLearning && (
            <div>
              <span className="text-gray-600">Review Frequency:</span>
              <span className="ml-2 font-medium text-primary-600">
                {settings.wrongAnswerPercentage}%
              </span>
            </div>
          )}
          
          <div>
            <span className="text-gray-600">Question Order:</span>
            <span className="ml-2 font-medium">
              {settings.randomizeQuestions ? 'Randomized' : 'Sequential'}
            </span>
          </div>
          
          <div>
            <span className="text-gray-600">Time Limit:</span>
            <span className="ml-2 font-medium">
              {settings.timeLimit ? `${settings.timeLimit} minutes` : 'None'}
            </span>
          </div>
        </div>
      </motion.div>

      {/* Validation Errors */}
      {Object.keys(errors).length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="font-semibold text-red-800 mb-2">Please fix the following errors:</h4>
          <ul className="text-sm text-red-700 space-y-1">
            {Object.entries(errors).map(([key, message]) => (
              <li key={key}>• {message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};