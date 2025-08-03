/**
 * Animated circular progress ring component
 * Accessible and mobile-responsive
 */

import React from 'react';
import { cn } from '@/utils/cn';

interface ProgressRingProps {
  progress: number; // 0-100
  size?: 'sm' | 'md' | 'lg' | 'xl';
  strokeWidth?: number;
  className?: string;
  showPercentage?: boolean;
  color?: 'primary' | 'success' | 'warning' | 'danger';
  animated?: boolean;
  children?: React.ReactNode;
}

const sizeMap = {
  sm: { radius: 20, viewBox: 48 },
  md: { radius: 32, viewBox: 72 },
  lg: { radius: 48, viewBox: 104 },
  xl: { radius: 64, viewBox: 136 },
};

const colorMap = {
  primary: 'stroke-blue-500',
  success: 'stroke-green-500',
  warning: 'stroke-amber-500',
  danger: 'stroke-red-500',
};

export const ProgressRing: React.FC<ProgressRingProps> = ({
  progress,
  size = 'md',
  strokeWidth = 4,
  className,
  showPercentage = true,
  color = 'primary',
  animated = true,
  children,
}) => {
  const { radius, viewBox } = sizeMap[size];
  const normalizedProgress = Math.min(100, Math.max(0, progress));
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (normalizedProgress / 100) * circumference;

  return (
    <div 
      className={cn(
        "relative inline-flex items-center justify-center",
        className
      )}
      role="progressbar"
      aria-valuenow={normalizedProgress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Progress: ${normalizedProgress}%`}
    >
      <svg
        width={viewBox}
        height={viewBox}
        viewBox={`0 0 ${viewBox} ${viewBox}`}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={viewBox / 2}
          cy={viewBox / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-gray-200 dark:text-gray-700"
        />
        
        {/* Progress circle */}
        <circle
          cx={viewBox / 2}
          cy={viewBox / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={cn(
            colorMap[color],
            animated && "transition-all duration-500 ease-in-out"
          )}
        />
      </svg>
      
      {/* Center content */}
      <div className="absolute inset-0 flex items-center justify-center">
        {children || (showPercentage && (
          <span 
            className={cn(
              "font-semibold",
              size === 'sm' && "text-xs",
              size === 'md' && "text-sm",
              size === 'lg' && "text-base",
              size === 'xl' && "text-lg"
            )}
          >
            {Math.round(normalizedProgress)}%
          </span>
        ))}
      </div>
    </div>
  );
};