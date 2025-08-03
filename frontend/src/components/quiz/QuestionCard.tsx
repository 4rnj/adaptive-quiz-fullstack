/**
 * Enhanced Question Card Component - Modern, accessible, mobile-responsive
 * Features: Touch-friendly interactions, ARIA support, adaptive difficulty indicators
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckIcon, XMarkIcon, ArrowPathIcon, ClockIcon, LightBulbIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Question, QuizAnswer, AnswerSubmission } from '@/types/quiz';
import { useQuizStore } from '@/store/quizStore';
import { cn } from '@/utils/cn';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShimmerButton } from '@/components/ui/shimmer-button';

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

  const handleAnswerClick = useCallback((answerId: string) => {
    if (showResult || isSubmitting) return;

    if (selectedAnswers.includes(answerId)) {
      onAnswerUnselect(answerId);
    } else {
      onAnswerSelect(answerId);
    }
  }, [selectedAnswers, showResult, isSubmitting, onAnswerSelect, onAnswerUnselect]);

  const handleSubmit = useCallback(() => {
    if (selectedAnswers.length === 0 || isSubmitting) return;

    const submission: AnswerSubmission = {
      questionId: question.questionId,
      selectedAnswers,
      timeSpent: currentTime,
    };

    onSubmit(submission);
  }, [selectedAnswers, isSubmitting, question.questionId, currentTime, onSubmit]);

  // Keyboard navigation support
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (showResult || isSubmitting) return;
      
      // Enter to submit if answers selected
      if (event.key === 'Enter' && selectedAnswers.length > 0) {
        handleSubmit();
      }
      
      // Number keys to select answers (1-9)
      const num = parseInt(event.key);
      if (num >= 1 && num <= question.answers.length) {
        const answerId = question.answers[num - 1].id;
        handleAnswerClick(answerId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAnswers, showResult, isSubmitting, handleSubmit, handleAnswerClick, question.answers]);

  const canSubmit = selectedAnswers.length > 0 && !isSubmitting && !showResult;
  const difficultyColor = question.difficulty 
    ? question.difficulty >= 8 ? 'text-red-600' 
    : question.difficulty >= 6 ? 'text-amber-600' 
    : 'text-green-600'
    : 'text-gray-600';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-4xl mx-auto"
      role="main"
      aria-live="polite"
    >
      <Card variant="elevated" className="overflow-hidden">
        <CardHeader className="border-b border-gray-100 dark:border-gray-700">
          {/* Question Header - Mobile Responsive */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {/* Status Badges */}
            <div className="flex flex-wrap items-center gap-2">
              {question.isFromWrongPool && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex items-center gap-2 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 px-3 py-1.5 rounded-full text-sm font-medium"
                  role="status"
                  aria-label="Review question from wrong answer pool"
                >
                  <ExclamationTriangleIcon className="w-4 h-4" aria-hidden="true" />
                  <span>Review Question</span>
                  {question.remainingTries && (
                    <span className="bg-amber-200 dark:bg-amber-800 px-2 py-0.5 rounded text-xs">
                      {question.remainingTries} tries left
                    </span>
                  )}
                </motion.div>
              )}
              
              {question.shuffled && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex items-center gap-1 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 px-2 py-1 rounded text-xs font-medium"
                  aria-label="Answers are shuffled"
                >
                  <ArrowPathIcon className="w-3 h-3" aria-hidden="true" />
                  <span>Shuffled</span>
                </motion.div>
              )}

              {question.difficulty && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium",
                    question.difficulty >= 8 ? "bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200" :
                    question.difficulty >= 6 ? "bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200" :
                    "bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200"
                  )}
                  aria-label={`Difficulty level: ${question.difficulty}/10`}
                >
                  <span>Level {question.difficulty}</span>
                </motion.div>
              )}
            </div>

            {/* Timer and Category */}
            <div className="flex items-center gap-4 text-gray-500 dark:text-gray-400">
              {question.category && (
                <span className="text-sm font-medium hidden sm:inline">
                  {question.category}
                </span>
              )}
              <div className="flex items-center gap-2" aria-label={`Time spent: ${formatTime(currentTime)}`}>
                <ClockIcon className="w-4 h-4" aria-hidden="true" />
                <span className="text-sm font-mono tabular-nums">{formatTime(currentTime)}</span>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Question Text */}
          <div className="space-y-3">
            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100 leading-relaxed">
              {question.text}
            </h1>
            
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              {question.type === 'MULTIPLE_CHOICE' && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full" aria-hidden="true" />
                  <span>Select all correct answers</span>
                </div>
              )}
              
              <div className="hidden sm:block text-gray-300 dark:text-gray-600">•</div>
              
              <div className="text-xs text-gray-500 dark:text-gray-500">
                Use number keys (1-{question.answers.length}) or click to select • Press Enter to submit
              </div>
            </div>
          </div>

          {/* Answer Choices - Mobile Optimized */}
          <div className="space-y-3" role="radiogroup" aria-labelledby="question-text">
            <AnimatePresence>
              {question.answers.map((answer, index) => {
                const isSelected = selectedAnswers.includes(answer.id);
                const isCorrectAnswer = question.correctAnswers?.includes(answer.id);
                const showCorrectness = showResult && (isSelected || isCorrectAnswer);

                return (
                  <motion.button
                    key={answer.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={cn(
                      'relative w-full p-4 sm:p-5 border-2 rounded-xl text-left transition-all duration-200',
                      'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                      'min-h-[60px] sm:min-h-[44px]', // Touch-friendly minimum height
                      {
                        // Normal state
                        'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800': !isSelected && !showResult,
                        
                        // Selected state (before result)  
                        'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm': isSelected && !showResult,
                        
                        // Result states
                        'border-green-500 bg-green-50 dark:bg-green-900/20': showResult && isCorrectAnswer,
                        'border-red-500 bg-red-50 dark:bg-red-900/20': showResult && isSelected && !isCorrectAnswer,
                        'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800': showResult && !isSelected && !isCorrectAnswer,
                        
                        // Disabled state
                        'cursor-not-allowed opacity-75': showResult || isSubmitting,
                        'cursor-pointer': !showResult && !isSubmitting,
                      }
                    )}
                    onClick={() => handleAnswerClick(answer.id)}
                    disabled={showResult || isSubmitting}
                    role={question.type === 'SINGLE_CHOICE' ? 'radio' : 'checkbox'}
                    aria-checked={isSelected}
                    aria-describedby={showResult ? `answer-${answer.id}-result` : undefined}
                  >
                    <div className="flex items-start sm:items-center gap-4">
                      {/* Number indicator for keyboard reference */}
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-400">
                        {index + 1}
                      </div>

                      {/* Selection indicator */}
                      <div
                        className={cn(
                          'flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
                          {
                            'border-gray-300 dark:border-gray-600': !isSelected && !showResult,
                            'border-blue-500 bg-blue-500': isSelected && !showResult,
                            'border-green-500 bg-green-500': showResult && isCorrectAnswer,
                            'border-red-500 bg-red-500': showResult && isSelected && !isCorrectAnswer,
                          }
                        )}
                        aria-hidden="true"
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
                      <span className="flex-1 text-gray-900 dark:text-gray-100 font-medium leading-relaxed">
                        {answer.text}
                      </span>
                    </div>

                    {/* Screen reader result description */}
                    {showResult && (
                      <span id={`answer-${answer.id}-result`} className="sr-only">
                        {isCorrectAnswer ? 'Correct answer' : isSelected ? 'Incorrect selection' : 'Not selected'}
                      </span>
                    )}
                  </motion.button>
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
                className="p-4 sm:p-5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl"
                role="region"
                aria-labelledby="explanation-heading"
              >
                <div className="flex items-start gap-3">
                  <LightBulbIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <div>
                    <h3 id="explanation-heading" className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                      Explanation
                    </h3>
                    <p className="text-blue-800 dark:text-blue-200 leading-relaxed">
                      {question.explanation}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit Button */}
          {!showResult && (
            <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit}
                loading={isSubmitting}
                size="lg"
                className="w-full sm:w-auto"
                aria-describedby="submit-hint"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Answer'}
              </Button>
              
              <p id="submit-hint" className="text-xs text-gray-500 dark:text-gray-400 text-center sm:text-right sm:self-end">
                Press Enter or click to submit
              </p>
            </div>
          )}

          {/* Result Display */}
          <AnimatePresence>
            {showResult && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'p-4 sm:p-5 rounded-xl border-l-4',
                  {
                    'bg-green-50 dark:bg-green-900/20 border-green-500': isCorrect,
                    'bg-red-50 dark:bg-red-900/20 border-red-500': !isCorrect,
                  }
                )}
                role="status"
                aria-live="polite"
              >
                <div className="flex items-center gap-3">
                  {isCorrect ? (
                    <CheckIcon className="w-6 h-6 text-green-600 dark:text-green-400" aria-hidden="true" />
                  ) : (
                    <XMarkIcon className="w-6 h-6 text-red-600 dark:text-red-400" aria-hidden="true" />
                  )}
                  <div>
                    <span
                      className={cn('font-semibold text-lg', {
                        'text-green-800 dark:text-green-200': isCorrect,
                        'text-red-800 dark:text-red-200': !isCorrect,
                      })}
                    >
                      {isCorrect ? 'Correct!' : 'Incorrect'}
                    </span>
                    <p className={cn('text-sm mt-1', {
                      'text-green-700 dark:text-green-300': isCorrect,
                      'text-red-700 dark:text-red-300': !isCorrect,
                    })}>
                      {isCorrect 
                        ? 'Great job! Moving to the next question...' 
                        : question.remainingTries 
                          ? `You have ${question.remainingTries} more attempts.`
                          : 'Review the correct answer and explanation.'
                      }
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
};