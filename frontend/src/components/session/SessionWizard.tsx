/**
 * Session Creation Wizard - Multi-step form for configuring adaptive quiz sessions
 * Handles source selection, settings configuration, and session creation
 */

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeftIcon, 
  ArrowRightIcon, 
  CheckIcon,
  PlusIcon,
  XMarkIcon 
} from '@heroicons/react/24/outline';
import { useSessionCreationStore } from '@/store/sessionStore';
import { useQuizStore } from '@/store/quizStore';
import { SourceSelector } from './SourceSelector';
import { SessionSettings } from './SessionSettings';
import { SessionReview } from './SessionReview';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const steps = [
  { id: 'sources', title: 'Select Sources', description: 'Choose quiz sources and topics' },
  { id: 'settings', title: 'Configure Settings', description: 'Set adaptive learning preferences' },
  { id: 'review', title: 'Review & Create', description: 'Review configuration and create session' },
];

export const SessionWizard: React.FC = () => {
  const navigate = useNavigate();
  
  const {
    creationState,
    sessionName,
    selectedSources,
    settings,
    errors,
    isValid,
    loadAvailableSources,
    setSessionName,
    nextStep,
    previousStep,
    resetCreation,
    getSessionConfig,
  } = useSessionCreationStore();

  const {
    createSession,
    isCreatingSession,
    error: quizError,
    clearError,
  } = useQuizStore();

  useEffect(() => {
    loadAvailableSources();
    
    // Cleanup on unmount
    return () => {
      resetCreation();
    };
  }, []);

  useEffect(() => {
    if (quizError) {
      toast.error(quizError);
      clearError();
    }
  }, [quizError]);

  const currentStepIndex = steps.findIndex(step => step.id === creationState.step);

  const handleNext = () => {
    if (isValid) {
      nextStep();
    } else {
      toast.error('Please fix the errors before continuing');
    }
  };

  const handlePrevious = () => {
    previousStep();
  };

  const handleCreateSession = async () => {
    if (!isValid) {
      toast.error('Please fix all errors before creating the session');
      return;
    }

    try {
      const config = getSessionConfig();
      await createSession(config);
      
      toast.success('Session created successfully!');
      
      // Navigate to the new session
      // Note: sessionId would come from the store after creation
      navigate('/quiz'); // This would typically include the session ID
    } catch (error) {
      toast.error('Failed to create session');
    }
  };

  const canProceed = () => {
    switch (creationState.step) {
      case 'sources':
        return selectedSources.length > 0 && !errors.sources;
      case 'settings':
        return !errors.wrongAnswerPercentage;
      case 'review':
        return isValid;
      default:
        return false;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                <ArrowLeftIcon className="w-4 h-4" />
                <span>Back to Dashboard</span>
              </button>
            </div>

            <h1 className="text-lg font-semibold text-gray-900">Create New Quiz Session</h1>

            <div className="w-32" /> {/* Spacer for centering */}
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={clsx('flex items-center', {
                  'flex-1': index < steps.length - 1,
                })}
              >
                <div className="flex items-center">
                  <div
                    className={clsx(
                      'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                      {
                        'bg-primary-600 text-white': index <= currentStepIndex,
                        'bg-gray-200 text-gray-400': index > currentStepIndex,
                      }
                    )}
                  >
                    {index < currentStepIndex ? (
                      <CheckIcon className="w-4 h-4" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  
                  <div className="ml-3">
                    <div
                      className={clsx('text-sm font-medium', {
                        'text-primary-600': index <= currentStepIndex,
                        'text-gray-400': index > currentStepIndex,
                      })}
                    >
                      {step.title}
                    </div>
                    <div className="text-xs text-gray-500">{step.description}</div>
                  </div>
                </div>

                {index < steps.length - 1 && (
                  <div className="flex-1 mx-4">
                    <div
                      className={clsx('h-0.5 transition-colors', {
                        'bg-primary-600': index < currentStepIndex,
                        'bg-gray-200': index >= currentStepIndex,
                      })}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-sm">
          {/* Session Name Input */}
          <div className="p-6 border-b">
            <div className="max-w-md">
              <label htmlFor="sessionName" className="block text-sm font-medium text-gray-700 mb-2">
                Session Name
              </label>
              <input
                type="text"
                id="sessionName"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="Enter a name for your quiz session"
                className={clsx(
                  'w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors',
                  {
                    'border-red-300 focus:ring-red-500 focus:border-red-500': errors.sessionName,
                    'border-gray-300': !errors.sessionName,
                  }
                )}
              />
              {errors.sessionName && (
                <p className="mt-1 text-sm text-red-600">{errors.sessionName}</p>
              )}
            </div>
          </div>

          {/* Step Content */}
          <div className="p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={creationState.step}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                {creationState.step === 'sources' && <SourceSelector />}
                {creationState.step === 'settings' && <SessionSettings />}
                {creationState.step === 'review' && <SessionReview />}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Navigation */}
          <div className="px-6 py-4 bg-gray-50 border-t rounded-b-lg">
            <div className="flex items-center justify-between">
              <button
                onClick={handlePrevious}
                disabled={currentStepIndex === 0}
                className={clsx(
                  'flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors',
                  {
                    'text-gray-400 cursor-not-allowed': currentStepIndex === 0,
                    'text-gray-600 hover:text-gray-800 hover:bg-gray-100': currentStepIndex > 0,
                  }
                )}
              >
                <ArrowLeftIcon className="w-4 h-4" />
                <span>Previous</span>
              </button>

              <div className="flex items-center space-x-3">
                {/* Error Summary */}
                {Object.keys(errors).length > 0 && (
                  <div className="text-sm text-red-600">
                    {Object.keys(errors).length} error{Object.keys(errors).length > 1 ? 's' : ''} to fix
                  </div>
                )}

                {/* Cancel Button */}
                <button
                  onClick={() => navigate('/dashboard')}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>

                {/* Next/Create Button */}
                {creationState.step === 'review' ? (
                  <button
                    onClick={handleCreateSession}
                    disabled={!canProceed() || isCreatingSession}
                    className={clsx(
                      'flex items-center space-x-2 px-6 py-2 rounded-lg font-medium transition-colors',
                      {
                        'bg-primary-600 text-white hover:bg-primary-700': canProceed() && !isCreatingSession,
                        'bg-gray-300 text-gray-500 cursor-not-allowed': !canProceed() || isCreatingSession,
                      }
                    )}
                  >
                    {isCreatingSession ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Creating...</span>
                      </>
                    ) : (
                      <>
                        <CheckIcon className="w-4 h-4" />
                        <span>Create Session</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleNext}
                    disabled={!canProceed()}
                    className={clsx(
                      'flex items-center space-x-2 px-6 py-2 rounded-lg font-medium transition-colors',
                      {
                        'bg-primary-600 text-white hover:bg-primary-700': canProceed(),
                        'bg-gray-300 text-gray-500 cursor-not-allowed': !canProceed(),
                      }
                    )}
                  >
                    <span>Next</span>
                    <ArrowRightIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};