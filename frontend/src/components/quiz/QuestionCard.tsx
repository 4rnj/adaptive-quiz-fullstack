/**
 * Question Card Component - Displays quiz questions with adaptive UI
 * Handles single/multiple choice, shuffled answers, and immediate retry flow
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckIcon, XMarkIcon, ArrowPathIcon, ClockIcon } from '@heroicons/react/24/outline';
import { Question, QuizAnswer, AnswerSubmission } from '@/types/quiz';
import { useQuizStore } from '@/store/quizStore';
import clsx from 'clsx';

interface QuestionCardProps {
  question: Question;
  selectedAnswers: string[];
  onAnswerSelect: (answerId: string) => void;
  onAnswerUnselect: (answerId: string) => void;
  onSubmit: (submission: AnswerSubmission) => void;
  isSubmitting: boolean;
  timeSpent: number;
  showResult?: boolean;
  isCorrect?: boolean;
  showExplanation?: boolean;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  selectedAnswers,
  onAnswerSelect,
  onAnswerUnselect,
  onSubmit,
  isSubmitting,
  timeSpent,
  showResult = false,
  isCorrect = false,
  showExplanation = false,
}) => {
  const [startTime] = useState(Date.now());
  const [currentTime, setCurrentTime] = useState(timeSpent);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Math.floor((Date.now() - startTime) / 1000) + timeSpent);
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, timeSpent]);

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAnswerClick = (answerId: string) => {
    if (showResult || isSubmitting) return;

    if (selectedAnswers.includes(answerId)) {
      onAnswerUnselect(answerId);
    } else {
      onAnswerSelect(answerId);
    }
  };

  const handleSubmit = () => {
    if (selectedAnswers.length === 0 || isSubmitting) return;

    const submission: AnswerSubmission = {
      questionId: question.questionId,
      selectedAnswers,
      timeSpent: currentTime,
    };

    onSubmit(submission);
  };

  const canSubmit = selectedAnswers.length > 0 && !isSubmitting && !showResult;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto"
    >
      {/* Question Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          {question.isFromWrongPool && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="flex items-center space-x-2 bg-warning-100 text-warning-800 px-3 py-1 rounded-full text-sm font-medium"
            >
              <ArrowPathIcon className="w-4 h-4" />
              <span>Review Question</span>
              {question.remainingTries && (
                <span className="bg-warning-200 px-2 py-0.5 rounded text-xs">
                  {question.remainingTries} tries left
                </span>
              )}
            </motion.div>
          )}
          
          {question.shuffled && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="flex items-center space-x-1 bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium"
            >
              <ArrowPathIcon className="w-3 h-3" />
              <span>Shuffled</span>
            </motion.div>
          )}
        </div>

        <div className="flex items-center space-x-2 text-gray-500">
          <ClockIcon className="w-4 h-4" />
          <span className="text-sm font-mono">{formatTime(currentTime)}</span>
        </div>
      </div>

      {/* Question Text */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 leading-relaxed">
          {question.text}
        </h2>
        
        {question.type === 'MULTIPLE_CHOICE' && (
          <p className="text-sm text-gray-600 mt-2">
            Select all correct answers
          </p>
        )}
      </div>

      {/* Answer Choices */}
      <div className="space-y-3 mb-6">
        <AnimatePresence>
          {question.answers.map((answer, index) => {
            const isSelected = selectedAnswers.includes(answer.id);
            const isCorrectAnswer = question.correctAnswers?.includes(answer.id);
            const showCorrectness = showResult && (isSelected || isCorrectAnswer);

            return (
              <motion.div
                key={answer.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className={clsx(
                  'relative p-4 border-2 rounded-lg cursor-pointer transition-all duration-200',
                  {
                    // Normal state
                    'border-gray-200 hover:border-gray-300 hover:bg-gray-50': !isSelected && !showResult,
                    
                    // Selected state (before result)
                    'border-primary-500 bg-primary-50': isSelected && !showResult,
                    
                    // Result states
                    'border-success-500 bg-success-50': showResult && isCorrectAnswer,
                    'border-error-500 bg-error-50': showResult && isSelected && !isCorrectAnswer,
                    'border-gray-200 bg-gray-50': showResult && !isSelected && !isCorrectAnswer,
                    
                    // Disabled state
                    'cursor-not-allowed opacity-75': showResult || isSubmitting,
                  }
                )}
                onClick={() => handleAnswerClick(answer.id)}
              >
                <div className="flex items-center space-x-3">
                  {/* Selection indicator */}
                  <div
                    className={clsx(
                      'flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
                      {
                        'border-gray-300': !isSelected && !showResult,
                        'border-primary-500 bg-primary-500': isSelected && !showResult,
                        'border-success-500 bg-success-500': showResult && isCorrectAnswer,
                        'border-error-500 bg-error-500': showResult && isSelected && !isCorrectAnswer,
                      }
                    )}
                  >
                    {showResult ? (
                      isCorrectAnswer ? (
                        <CheckIcon className="w-3 h-3 text-white" />
                      ) : isSelected && !isCorrectAnswer ? (
                        <XMarkIcon className="w-3 h-3 text-white" />
                      ) : null
                    ) : (
                      isSelected && <CheckIcon className="w-3 h-3 text-white" />
                    )}
                  </div>

                  {/* Answer text */}
                  <span className="flex-1 text-gray-900 font-medium">
                    {answer.text}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Explanation */}
      <AnimatePresence>
        {showExplanation && question.explanation && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg"
          >
            <h3 className="font-semibold text-blue-900 mb-2">Explanation</h3>
            <p className="text-blue-800">{question.explanation}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit Button */}
      {!showResult && (
        <div className="flex justify-end">
          <motion.button
            whileHover={{ scale: canSubmit ? 1.02 : 1 }}
            whileTap={{ scale: canSubmit ? 0.98 : 1 }}
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={clsx(
              'px-6 py-3 rounded-lg font-semibold text-white transition-all duration-200',
              {
                'bg-primary-600 hover:bg-primary-700 shadow-lg hover:shadow-xl': canSubmit,
                'bg-gray-300 cursor-not-allowed': !canSubmit,
              }
            )}
          >
            {isSubmitting ? (
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Submitting...</span>
              </div>
            ) : (
              'Submit Answer'
            )}
          </motion.button>
        </div>
      )}

      {/* Result Display */}
      <AnimatePresence>
        {showResult && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={clsx(
              'p-4 rounded-lg border-l-4 mt-4',
              {
                'bg-success-50 border-success-500': isCorrect,
                'bg-error-50 border-error-500': !isCorrect,
              }
            )}
          >
            <div className="flex items-center space-x-2">
              {isCorrect ? (
                <CheckIcon className="w-5 h-5 text-success-600" />
              ) : (
                <XMarkIcon className="w-5 h-5 text-error-600" />
              )}
              <span
                className={clsx('font-semibold', {
                  'text-success-800': isCorrect,
                  'text-error-800': !isCorrect,
                })}
              >
                {isCorrect ? 'Correct!' : 'Incorrect'}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};