/**
 * Enhanced Progress Indicator - Modern, accessible adaptive quiz progress
 * Features: Animated progress rings, mobile-responsive layout, detailed analytics
 */

import React from 'react';
import { motion } from 'framer-motion';
import { 
  ExclamationTriangleIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  TrophyIcon
} from '@heroicons/react/24/outline';
import { ProgressIndicator as ProgressData } from '@/types/quiz';
import { cn } from '@/utils/cn';
import { Card, CardContent } from '@/components/ui/card';
import { ProgressRing } from '@/components/ui/progress-ring';

interface ProgressIndicatorProps {
  progress: ProgressData;
  className?: string;
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  progress,
  className = '',
}) => {
  const {
    currentQuestion,
    totalQuestions,
    additionalQuestions,
    correctAnswers,
    wrongPoolSize,
    penaltyText,
    completionPercentage,
  } = progress;

  const effectiveTotal = totalQuestions + additionalQuestions;
  const progressWidth = Math.min((currentQuestion / effectiveTotal) * 100, 100);
  const baseProgressWidth = (totalQuestions / effectiveTotal) * 100;
  const accuracyRate = currentQuestion > 0 ? (correctAnswers / currentQuestion) * 100 : 0;
  
  const getAccuracyColor = (rate: number) => {
    if (rate >= 80) return 'success';
    if (rate >= 60) return 'warning';
    return 'danger';
  };

  const getPerformanceLevel = (rate: number) => {
    if (rate >= 90) return 'Excellent';
    if (rate >= 80) return 'Great';
    if (rate >= 70) return 'Good';
    if (rate >= 60) return 'Fair';
    return 'Needs Improvement';
  };

  return (
    <Card variant="glass" className={cn("overflow-hidden", className)}>
      <CardContent className="p-4 sm:p-6">
        {/* Mobile-first responsive layout */}
        <div className="space-y-6">
          {/* Header Section */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Quiz Progress
              </h2>
              
              {penaltyText && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex items-center gap-2 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 px-3 py-1.5 rounded-full text-sm font-medium"
                  role="status"
                  aria-label={`Warning: ${penaltyText}`}
                >
                  <ExclamationTriangleIcon className="w-4 h-4" aria-hidden="true" />
                  <span>{penaltyText}</span>
                </motion.div>
              )}
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                  {currentQuestion} / {effectiveTotal}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Questions completed
                </div>
              </div>
            </div>
          </div>

          {/* Progress Visualization - Mobile Responsive */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Main Progress Ring */}
            <div className="flex flex-col items-center">
              <ProgressRing
                progress={completionPercentage}
                size="xl"
                color="primary"
                animated
                className="mb-3"
              >
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {Math.round(completionPercentage)}%
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Complete
                  </div>
                </div>
              </ProgressRing>
            </div>

            {/* Accuracy Ring */}
            <div className="flex flex-col items-center">
              <ProgressRing
                progress={accuracyRate}
                size="xl"
                color={getAccuracyColor(accuracyRate) as any}
                animated
                className="mb-3"
              >
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {Math.round(accuracyRate)}%
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Accuracy
                  </div>
                </div>
              </ProgressRing>
              <p className={cn(
                "text-sm font-medium",
                accuracyRate >= 80 ? "text-green-600 dark:text-green-400" :
                accuracyRate >= 60 ? "text-amber-600 dark:text-amber-400" :
                "text-red-600 dark:text-red-400"
              )}>
                {getPerformanceLevel(accuracyRate)}
              </p>
            </div>

            {/* Statistics Summary */}
            <div className="flex flex-col justify-center space-y-3">
              <div className="flex items-center gap-3">
                <CheckCircleIcon className="w-5 h-5 text-green-500" aria-hidden="true" />
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">
                    {correctAnswers}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Correct answers
                  </div>
                </div>
              </div>

              {wrongPoolSize > 0 && (
                <div className="flex items-center gap-3">
                  <ArrowPathIcon className="w-5 h-5 text-amber-500" aria-hidden="true" />
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-gray-100">
                      {wrongPoolSize}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      To review
                    </div>
                  </div>
                </div>
              )}

              {additionalQuestions > 0 && (
                <div className="flex items-center gap-3">
                  <ExclamationTriangleIcon className="w-5 h-5 text-amber-500" aria-hidden="true" />
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-gray-100">
                      +{additionalQuestions}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Extra questions
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Linear Progress Bar - Alternative view */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-300">Question Progress</span>
              <span className="text-gray-500 dark:text-gray-400 tabular-nums">
                {currentQuestion} of {effectiveTotal}
              </span>
            </div>
            
            <div className="relative">
              {/* Background bar */}
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                {/* Base progress (original questions) */}
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(progressWidth, baseProgressWidth)}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="h-full bg-blue-500 rounded-full"
                />
                
                {/* Additional questions progress (penalty area) */}
                {additionalQuestions > 0 && progressWidth > baseProgressWidth && (
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progressWidth - baseProgressWidth}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
                    className="h-full bg-amber-500 rounded-full absolute top-0"
                    style={{ left: `${baseProgressWidth}%` }}
                  />
                )}
              </div>

              {/* Milestone markers */}
              {additionalQuestions > 0 && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-gray-400 dark:bg-gray-500"
                  style={{ left: `${baseProgressWidth}%` }}
                  aria-label="Original quiz completion point"
                >
                  <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-gray-400 dark:bg-gray-500 rounded-full border-2 border-white dark:border-gray-800" />
                </div>
              )}
            </div>

            {/* Progress Legend */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <div className="w-3 h-2 bg-blue-500 rounded-sm" aria-hidden="true" />
                <span>Original questions</span>
              </div>
              
              {additionalQuestions > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-2 bg-amber-500 rounded-sm" aria-hidden="true" />
                  <span>Additional questions</span>
                </div>
              )}
            </div>
          </div>

          {/* Achievement Badge */}
          {accuracyRate >= 90 && currentQuestion >= 5 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center justify-center gap-3 p-4 bg-gradient-to-r from-yellow-100 to-yellow-50 dark:from-yellow-900/20 dark:to-yellow-800/20 rounded-xl border border-yellow-200 dark:border-yellow-800"
            >
              <TrophyIcon className="w-6 h-6 text-yellow-600 dark:text-yellow-400" aria-hidden="true" />
              <div>
                <div className="font-semibold text-yellow-800 dark:text-yellow-200">
                  Excellent Performance!
                </div>
                <div className="text-sm text-yellow-700 dark:text-yellow-300">
                  You're mastering this topic
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};