/**
 * Comprehensive button component with variants, sizes, and accessibility
 * Mobile-responsive and keyboard navigation support
 */

import React from 'react';
import { cn } from '@/utils/cn';
import { Slot } from '@radix-ui/react-slot';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  loading?: boolean;
  asChild?: boolean;
  children: React.ReactNode;
}

const buttonVariants = {
  primary: [
    "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500",
    "text-white border-transparent",
    "shadow-sm hover:shadow-md"
  ].join(" "),
  
  secondary: [
    "bg-gray-600 hover:bg-gray-700 focus:ring-gray-500",
    "text-white border-transparent",
    "shadow-sm hover:shadow-md"
  ].join(" "),
  
  outline: [
    "bg-transparent hover:bg-gray-50 dark:hover:bg-gray-800",
    "text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600",
    "hover:border-gray-400 dark:hover:border-gray-500",
    "focus:ring-gray-500"
  ].join(" "),
  
  ghost: [
    "bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800",
    "text-gray-700 dark:text-gray-300 border-transparent",
    "focus:ring-gray-500"
  ].join(" "),
  
  danger: [
    "bg-red-600 hover:bg-red-700 focus:ring-red-500",
    "text-white border-transparent",
    "shadow-sm hover:shadow-md"
  ].join(" "),
  
  success: [
    "bg-green-600 hover:bg-green-700 focus:ring-green-500",
    "text-white border-transparent",
    "shadow-sm hover:shadow-md"
  ].join(" "),
};

const buttonSizes = {
  xs: "px-2 py-1 text-xs h-6",
  sm: "px-3 py-1.5 text-sm h-8",
  md: "px-4 py-2 text-sm h-10",
  lg: "px-6 py-3 text-base h-12",
  xl: "px-8 py-4 text-lg h-14",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ 
    className, 
    variant = 'primary', 
    size = 'md', 
    loading = false,
    disabled,
    asChild = false,
    children, 
    ...props 
  }, ref) => {
    const Comp = asChild ? Slot : "button";
    
    return (
      <Comp
        ref={ref}
        className={cn(
          // Base styles
          "inline-flex items-center justify-center gap-2",
          "font-medium rounded-lg border transition-all duration-200",
          "focus:outline-none focus:ring-2 focus:ring-offset-2",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
          
          // Touch targets for mobile
          "min-h-[44px] sm:min-h-0",
          
          // Variants
          buttonVariants[variant],
          
          // Sizes
          buttonSizes[size],
          
          // Loading state
          loading && "cursor-wait opacity-75",
          
          className
        )}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </Comp>
    );
  }
);

Button.displayName = "Button";