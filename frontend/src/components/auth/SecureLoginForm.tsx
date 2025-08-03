/**
 * Secure Login Form Component
 * Implements security-hardened authentication with comprehensive validation
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  EyeIcon, 
  EyeSlashIcon, 
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  LockClosedIcon
} from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useAuthStore } from '@/store/authStore';
import { 
  InputValidator, 
  rateLimiter, 
  SECURITY_CONFIG,
  SecurityEvent,
  dispatchSecurityEvent
} from '@/utils/security';
import { cn } from '@/utils/cn';

interface SecureLoginFormProps {
  onSuccess?: () => void;
  className?: string;
}

interface FormErrors {
  email?: string;
  password?: string;
  general?: string;
}

export const SecureLoginForm: React.FC<SecureLoginFormProps> = ({
  onSuccess,
  className
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState<number>(SECURITY_CONFIG.VALIDATION.MAX_LOGIN_ATTEMPTS);
  const [lockoutTimeRemaining, setLockoutTimeRemaining] = useState(0);

  const { login, isLoading, error: authError, clearError } = useAuthStore();

  /**
   * Check rate limiting status
   */
  const checkRateLimit = useCallback(() => {
    const rateLimitKey = `login:${email}`;
    const isLimited = rateLimiter.isRateLimited(
      rateLimitKey,
      SECURITY_CONFIG.VALIDATION.MAX_LOGIN_ATTEMPTS,
      SECURITY_CONFIG.VALIDATION.LOCKOUT_DURATION
    );
    
    const remaining = rateLimiter.getRemainingAttempts(
      rateLimitKey,
      SECURITY_CONFIG.VALIDATION.MAX_LOGIN_ATTEMPTS
    );

    setIsRateLimited(isLimited);
    setRemainingAttempts(remaining);

    if (isLimited) {
      setLockoutTimeRemaining(SECURITY_CONFIG.VALIDATION.LOCKOUT_DURATION);
    }
  }, [email]);

  /**
   * Countdown timer for lockout
   */
  useEffect(() => {
    if (lockoutTimeRemaining > 0) {
      const timer = setTimeout(() => {
        setLockoutTimeRemaining(prev => {
          const newTime = prev - 1000;
          if (newTime <= 0) {
            setIsRateLimited(false);
            setRemainingAttempts(SECURITY_CONFIG.VALIDATION.MAX_LOGIN_ATTEMPTS);
          }
          return Math.max(0, newTime);
        });
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [lockoutTimeRemaining]);

  /**
   * Real-time input validation
   */
  const validateInput = useCallback((field: 'email' | 'password', value: string) => {
    const newErrors = { ...errors };

    if (field === 'email') {
      const emailValidation = InputValidator.validateEmail(value);
      if (!emailValidation.valid && value.length > 0) {
        newErrors.email = emailValidation.error;
      } else {
        delete newErrors.email;
      }
    }

    if (field === 'password') {
      const passwordValidation = InputValidator.validatePassword(value);
      if (!passwordValidation.valid && value.length > 0) {
        newErrors.password = passwordValidation.error;
      } else {
        delete newErrors.password;
      }
    }

    setErrors(newErrors);
  }, [errors]);

  /**
   * Handle input changes with validation
   */
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = InputValidator.sanitizeInput(e.target.value);
    setEmail(value);
    validateInput('email', value);
    clearError();
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value; // Don't sanitize passwords
    setPassword(value);
    validateInput('password', value);
    clearError();
  };

  /**
   * Handle form submission with security validation
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear previous errors
    setErrors({});
    clearError();

    // Validate inputs
    const emailValidation = InputValidator.validateEmail(email);
    const passwordValidation = InputValidator.validatePassword(password);
    
    const validationErrors: FormErrors = {};
    
    if (!emailValidation.valid) {
      validationErrors.email = emailValidation.error;
    }
    
    if (!passwordValidation.valid) {
      validationErrors.password = passwordValidation.error;
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      dispatchSecurityEvent(SecurityEvent.LOGIN_FAILURE, {
        email,
        reason: 'validation_failed',
        errors: Object.keys(validationErrors)
      });
      return;
    }

    // Check rate limiting
    checkRateLimit();
    if (isRateLimited) {
      setErrors({ general: 'Too many login attempts. Please try again later.' });
      return;
    }

    try {
      await login({ email, password, rememberMe });
      
      // Success callback
      onSuccess?.();
      
    } catch (error) {
      // Update rate limiting after failed attempt
      checkRateLimit();
      
      // Show remaining attempts warning
      if (remainingAttempts <= 2 && remainingAttempts > 0) {
        setErrors({ 
          general: `Login failed. ${remainingAttempts - 1} attempts remaining before account lockout.` 
        });
      }
    }
  };

  /**
   * Security indicator component
   */
  const SecurityIndicator = () => {
    const hasValidEmail = !errors.email && email.length > 0;
    const hasValidPassword = !errors.password && password.length > 0;
    const securityScore = (hasValidEmail ? 1 : 0) + (hasValidPassword ? 1 : 0);

    return (
      <div className="flex items-center gap-2 text-sm">
        <ShieldCheckIcon className={cn(
          "w-4 h-4",
          securityScore === 2 ? "text-green-500" :
          securityScore === 1 ? "text-yellow-500" :
          "text-gray-400"
        )} />
        <span className={cn(
          securityScore === 2 ? "text-green-600 dark:text-green-400" :
          securityScore === 1 ? "text-yellow-600 dark:text-yellow-400" :
          "text-gray-500"
        )}>
          Security: {securityScore === 2 ? 'Strong' : securityScore === 1 ? 'Fair' : 'Weak'}
        </span>
      </div>
    );
  };

  /**
   * Rate limit warning component
   */
  const RateLimitWarning = () => {
    if (!isRateLimited && remainingAttempts === SECURITY_CONFIG.VALIDATION.MAX_LOGIN_ATTEMPTS) {
      return null;
    }

    const minutes = Math.ceil(lockoutTimeRemaining / 60000);
    const seconds = Math.ceil((lockoutTimeRemaining % 60000) / 1000);

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          "p-3 rounded-lg border flex items-center gap-2 text-sm",
          isRateLimited 
            ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"
            : "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200"
        )}
      >
        <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
        <div>
          {isRateLimited ? (
            <div>
              <div className="font-medium">Account temporarily locked</div>
              <div>Try again in {minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`}</div>
            </div>
          ) : (
            <div>
              <div className="font-medium">Login attempts warning</div>
              <div>{remainingAttempts} attempts remaining before lockout</div>
            </div>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <Card className={cn("w-full max-w-md", className)}>
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-3">
            <LockClosedIcon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Secure Login
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Protected by advanced security
              </p>
            </div>
          </div>
        </div>
        
        <SecurityIndicator />
        
        {(isRateLimited || remainingAttempts < SECURITY_CONFIG.VALIDATION.MAX_LOGIN_ATTEMPTS) && (
          <RateLimitWarning />
        )}
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Email Field */}
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={handleEmailChange}
              disabled={isLoading || isRateLimited}
              className={cn(
                "w-full px-3 py-2 border rounded-lg shadow-sm transition-colors",
                "focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                "disabled:bg-gray-50 disabled:text-gray-500 dark:disabled:bg-gray-800",
                "dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100",
                errors.email 
                  ? "border-red-500 focus:ring-red-500 focus:border-red-500"
                  : "border-gray-300 dark:border-gray-600"
              )}
              placeholder="Enter your email"
              autoComplete="email"
              required
            />
            {errors.email && (
              <p className="text-sm text-red-600 dark:text-red-400">{errors.email}</p>
            )}
          </div>

          {/* Password Field */}
          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={handlePasswordChange}
                disabled={isLoading || isRateLimited}
                className={cn(
                  "w-full px-3 py-2 pr-10 border rounded-lg shadow-sm transition-colors",
                  "focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                  "disabled:bg-gray-50 disabled:text-gray-500 dark:disabled:bg-gray-800",
                  "dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100",
                  errors.password 
                    ? "border-red-500 focus:ring-red-500 focus:border-red-500"
                    : "border-gray-300 dark:border-gray-600"
                )}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading || isRateLimited}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showPassword ? (
                  <EyeSlashIcon className="w-5 h-5" />
                ) : (
                  <EyeIcon className="w-5 h-5" />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="text-sm text-red-600 dark:text-red-400">{errors.password}</p>
            )}
          </div>

          {/* Remember Me */}
          <div className="flex items-center">
            <input
              id="remember-me"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={isLoading || isRateLimited}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
              Keep me signed in for 7 days
            </label>
          </div>

          {/* Error Messages */}
          {(errors.general || authError) && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
            >
              <p className="text-sm text-red-800 dark:text-red-200">
                {errors.general || authError}
              </p>
            </motion.div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={isLoading || isRateLimited || Object.keys(errors).length > 0}
            className="w-full"
            size="lg"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Signing in...
              </div>
            ) : (
              'Sign In Securely'
            )}
          </Button>

          {/* Security Notice */}
          <div className="text-center text-xs text-gray-500 dark:text-gray-400">
            <p>Your connection is secured with end-to-end encryption</p>
            <p>Emergency logout: Ctrl+Shift+L</p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};