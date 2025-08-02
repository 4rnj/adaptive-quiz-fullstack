/**
 * Quiz Session Component - Main adaptive quiz session interface
 * Handles the complete quiz flow with immediate re-asking and adaptive learning
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  PauseIcon, 
  PlayIcon, 
  ArrowRightIcon,
  XMarkIcon,
  ExclamationTriangleIcon 
} from '@heroicons/react/24/outline';
import { useQuizStore } from '@/store/quizStore';
import { QuestionCard } from './QuestionCard';
import { ProgressIndicator } from './ProgressIndicator';
import { NextAction } from '@/types/quiz';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export const QuizSession: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [showRetryMessage, setShowRetryMessage] = useState(false);
  const [questionStartTime, setQuestionStartTime] = useState(0);

  const {
    currentSession,
    currentQuestion,
    progress,
    lastAnswerResult,
    isLoadingQuestion,
    isSubmittingAnswer,
    error,
    ui,
    startSession,
    getCurrentQuestion,
    submitAnswer,
    selectAnswer,
    unselectAnswer,
    clearSelectedAnswers,
    handleRetryQuestion,
    pauseSession,
    resumeSession,
    completeSession,
    clearError,
  } = useQuizStore();

  useEffect(() => {
    if (!sessionId) {
      navigate('/');
      return;
    }

    if (!currentSession || currentSession.sessionId !== sessionId) {
      startSession(sessionId);
    } else if (currentSession.status === 'ACTIVE' && !currentQuestion) {
      getCurrentQuestion();
    }

    setQuestionStartTime(Date.now());
  }, [sessionId, currentSession, currentQuestion]);

  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error]);

  useEffect(() => {
    if (lastAnswerResult) {
      if (lastAnswerResult.correct) {
        toast.success('Correct!');
      } else {
        toast.error(lastAnswerResult.message || 'Incorrect');
        setShowRetryMessage(true);
      }

      // Auto-advance for correct answers
      if (lastAnswerResult.nextAction === NextAction.NEXT_QUESTION) {
        setTimeout(() => {
          getCurrentQuestion();
          setQuestionStartTime(Date.now());
        }, 2000);
      }
    }
  }, [lastAnswerResult]);

  const handleAnswerSubmit = (submission: any) => {
    submitAnswer(submission);
    setShowRetryMessage(false);
  };

  const handleRetry = () => {
    handleRetryQuestion();
    setShowRetryMessage(false);
    setQuestionStartTime(Date.now());
  };

  const handleNextQuestion = () => {
    getCurrentQuestion();
    setQuestionStartTime(Date.now());
  };

  const handlePauseResume = async () => {
    if (currentSession?.status === 'ACTIVE') {
      await pauseSession();
      toast.success('Session paused');
    } else if (currentSession?.status === 'PAUSED') {
      await resumeSession();
      toast.success('Session resumed');
    }
  };

  const handleExitSession = () => {
    if (window.confirm('Are you sure you want to exit this session? Your progress will be saved.')) {
      navigate('/dashboard');
    }
  };

  const handleCompleteSession = async () => {
    await completeSession();
    toast.success('Session completed!');
    navigate('/dashboard');
  };

  const getTimeSpent = () => {
    return Math.floor((Date.now() - questionStartTime) / 1000);
  };

  // Session completed
  if (currentSession?.status === 'COMPLETED' || !currentQuestion) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center"
        >
          <div className="w-16 h-16 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2 }}
              className="w-8 h-8 text-success-600"
            >
              ✓
            </motion.div>
          </div>
          
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Session Complete!</h2>
          <p className="text-gray-600 mb-6">
            Great job! You've completed all questions in this session.
          </p>

          {progress && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Questions Answered:</span>
                  <div className="font-semibold">{progress.currentQuestion}</div>
                </div>
                <div>
                  <span className="text-gray-500">Correct Answers:</span>
                  <div className="font-semibold text-success-600">{progress.correctAnswers}</div>
                </div>
                <div>
                  <span className="text-gray-500">Accuracy:</span>
                  <div className="font-semibold">
                    {((progress.correctAnswers / progress.currentQuestion) * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <span className="text-gray-500">Review Pool:</span>
                  <div className="font-semibold text-warning-600">{progress.wrongPoolSize}</div>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors"
            >
              Return to Dashboard
            </button>
            <button
              onClick={() => navigate('/analytics')}
              className="w-full bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
            >
              View Detailed Results
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Loading state
  if (isLoadingQuestion && !currentQuestion) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading question...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-lg font-semibold text-gray-900">
                {currentSession?.config.name}
              </h1>
              
              <div className={clsx('px-2 py-1 rounded text-xs font-medium', {
                'bg-success-100 text-success-800': currentSession?.status === 'ACTIVE',
                'bg-warning-100 text-warning-800': currentSession?.status === 'PAUSED',
              })}>
                {currentSession?.status}
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={handlePauseResume}
                className="flex items-center space-x-1 px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                {currentSession?.status === 'ACTIVE' ? (
                  <>
                    <PauseIcon className="w-4 h-4" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <PlayIcon className="w-4 h-4" />
                    <span>Resume</span>
                  </>
                )}
              </button>

              <button
                onClick={handleExitSession}
                className="flex items-center space-x-1 px-3 py-1 text-gray-600 hover:text-gray-800 transition-colors"
              >
                <XMarkIcon className="w-4 h-4" />
                <span>Exit</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Progress Sidebar */}
          <div className="lg:col-span-1">
            {progress && (
              <ProgressIndicator 
                progress={progress} 
                className="sticky top-8"
              />
            )}
          </div>

          {/* Question Area */}
          <div className="lg:col-span-3">
            <AnimatePresence mode="wait">
              {currentQuestion && (
                <QuestionCard
                  key={currentQuestion.questionId}
                  question={currentQuestion}
                  selectedAnswers={ui.selectedAnswers}
                  onAnswerSelect={selectAnswer}
                  onAnswerUnselect={unselectAnswer}
                  onSubmit={handleAnswerSubmit}
                  isSubmitting={isSubmittingAnswer}
                  timeSpent={getTimeSpent()}
                  showResult={!!lastAnswerResult}
                  isCorrect={lastAnswerResult?.correct || false}
                  showExplanation={ui.showExplanation}
                />
              )}
            </AnimatePresence>

            {/* Retry Message */}
            <AnimatePresence>
              {showRetryMessage && lastAnswerResult?.nextAction === NextAction.RETRY_SAME_QUESTION && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="mt-6 bg-warning-50 border border-warning-200 rounded-lg p-4"
                >
                  <div className="flex items-start space-x-3">
                    <ExclamationTriangleIcon className="w-5 h-5 text-warning-600 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-warning-800">Try Again</h3>
                      <p className="text-warning-700 text-sm mt-1">
                        {lastAnswerResult.message || "That's not correct. The answers have been shuffled - try again!"}
                      </p>
                      
                      <div className="mt-3 flex space-x-3">
                        <button
                          onClick={handleRetry}
                          className="bg-warning-600 text-white px-4 py-2 rounded-lg hover:bg-warning-700 transition-colors text-sm"
                        >
                          Try Again
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Next Question Button */}
            <AnimatePresence>
              {lastAnswerResult?.correct && lastAnswerResult.nextAction === NextAction.NEXT_QUESTION && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="mt-6 flex justify-end"
                >
                  <button
                    onClick={handleNextQuestion}
                    className="flex items-center space-x-2 bg-success-600 text-white px-6 py-3 rounded-lg hover:bg-success-700 transition-colors"
                  >
                    <span>Next Question</span>
                    <ArrowRightIcon className="w-4 h-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};