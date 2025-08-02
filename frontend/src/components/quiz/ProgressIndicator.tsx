/**
 * Progress Indicator Component - Shows adaptive quiz progress with penalty indicators
 * Displays current progress, additional questions, and wrong answer pool status
 */

import React from 'react';
import { motion } from 'framer-motion';
import { 
  ExclamationTriangleIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon 
} from '@heroicons/react/24/outline';
import { ProgressIndicator as ProgressData } from '@/types/quiz';
import clsx from 'clsx';

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

  return (
    <div className={clsx('bg-white rounded-lg shadow-sm border p-4', className)}>
      {/* Header with current question and totals */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          <h3 className="text-sm font-medium text-gray-700">Progress</h3>
          
          {penaltyText && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="flex items-center space-x-1 bg-warning-100 text-warning-800 px-2 py-1 rounded text-xs font-medium"
            >
              <ExclamationTriangleIcon className="w-3 h-3" />
              <span>{penaltyText}</span>
            </motion.div>
          )}
        </div>

        <div className="text-right">
          <div className="text-lg font-semibold text-gray-900">
            {currentQuestion} / {effectiveTotal}
          </div>
          <div className="text-xs text-gray-500">
            {completionPercentage.toFixed(1)}% complete
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="relative">
        {/* Background bar */}
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          {/* Base progress (original questions) */}
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(progressWidth, baseProgressWidth)}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="h-full bg-primary-500 rounded-full"
          />
          
          {/* Additional questions progress (penalty area) */}
          {additionalQuestions > 0 && progressWidth > baseProgressWidth && (
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressWidth - baseProgressWidth}%` }}
              transition={{ duration: 0.5, ease: 'easeOut', delay: 0.2 }}
              className="h-full bg-warning-500 rounded-full"
              style={{ marginLeft: `${baseProgressWidth}%` }}
            />
          )}
        </div>

        {/* Divider line showing original end point */}
        {additionalQuestions > 0 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-gray-400"
            style={{ left: `${baseProgressWidth}%` }}
          >
            <div className="absolute -top-1 -left-1 w-3 h-3 bg-gray-400 rounded-full" />
          </div>
        )}
      </div>

      {/* Progress Details */}
      <div className="flex items-center justify-between mt-3 text-sm">
        <div className="flex items-center space-x-4">
          {/* Correct answers */}
          <div className="flex items-center space-x-1 text-success-600">
            <CheckCircleIcon className="w-4 h-4" />
            <span className="font-medium">{correctAnswers}</span>
            <span className="text-gray-500">correct</span>
          </div>

          {/* Wrong pool size */}
          {wrongPoolSize > 0 && (
            <div className="flex items-center space-x-1 text-warning-600">
              <ArrowPathIcon className="w-4 h-4" />
              <span className="font-medium">{wrongPoolSize}</span>
              <span className="text-gray-500">to review</span>
            </div>
          )}
        </div>

        {/* Additional questions indicator */}
        {additionalQuestions > 0 && (
          <div className="flex items-center space-x-1 text-warning-600">
            <ExclamationTriangleIcon className="w-4 h-4" />
            <span className="text-xs">+{additionalQuestions} extra</span>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-primary-500 rounded-full" />
            <span>Original questions</span>
          </div>
          
          {additionalQuestions > 0 && (
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-warning-500 rounded-full" />
              <span>Additional questions</span>
            </div>
          )}
        </div>

        {wrongPoolSize > 0 && (
          <div className="text-warning-600 font-medium">
            Review pool: {wrongPoolSize} questions
          </div>
        )}
      </div>

      {/* Performance indicator */}
      {currentQuestion > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Accuracy</span>
            <span className={clsx('font-medium', {
              'text-success-600': (correctAnswers / currentQuestion) >= 0.8,
              'text-warning-600': (correctAnswers / currentQuestion) >= 0.6 && (correctAnswers / currentQuestion) < 0.8,
              'text-error-600': (correctAnswers / currentQuestion) < 0.6,
            })}>
              {((correctAnswers / currentQuestion) * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
};