/**
 * Adaptive Quiz Session - Complete quiz flow with modern UX
 * Features: Voice feedback, haptic feedback, dark mode, accessibility
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { 
  SpeakerWaveIcon, 
  SpeakerXMarkIcon,
  PauseIcon,
  PlayIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  HomeIcon,
  CogIcon
} from '@heroicons/react/24/outline';

import { useQuizStore } from '@/store/quizStore';
import { QuestionCard } from './QuestionCard';
import { ProgressIndicator } from './ProgressIndicator';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/utils/cn';

interface AdaptiveQuizSessionProps {
  sessionId: string;
  onComplete?: () => void;
  onPause?: () => void;
  onExit?: () => void;
  className?: string;
}

export const AdaptiveQuizSession: React.FC<AdaptiveQuizSessionProps> = ({
  sessionId,
  onComplete,
  onPause,
  onExit,
  className,
}) => {
  const {
    currentSession,
    currentQuestion,
    isLoadingQuestion,
    isSubmittingAnswer,
    lastAnswerResult,
    progress,
    ui,
    error,
    submitAnswer,
    getCurrentQuestion,
    pauseSession,
    resumeSession,
    selectAnswer,
    unselectAnswer,
    clearSelectedAnswers,
    handleRetryQuestion,
    clearError,
  } = useQuizStore();

  const [audioEnabled, setAudioEnabled] = useState(false);
  const [sessionPaused, setSessionPaused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Speech synthesis for accessibility
  const speak = useCallback((text: string) => {
    if (!audioEnabled || !window.speechSynthesis) return;
    
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.volume = 0.7;
    window.speechSynthesis.speak(utterance);
  }, [audioEnabled]);

  // Initialize session
  useEffect(() => {
    if (currentSession?.sessionId === sessionId) {
      getCurrentQuestion();
    }
  }, [sessionId, currentSession, getCurrentQuestion]);

  // Handle answer results
  useEffect(() => {
    if (lastAnswerResult) {
      const isCorrect = lastAnswerResult.correct;
      
      // Haptic feedback if supported
      if ('vibrate' in navigator) {
        navigator.vibrate(isCorrect ? [100] : [100, 50, 100]);
      }

      // Audio feedback
      speak(isCorrect ? 'Correct!' : 'Incorrect. Try again.');

      // Toast notification
      toast(
        isCorrect ? '✅ Correct!' : '❌ Incorrect',
        {
          duration: 2000,
          position: 'top-center',
          style: {
            background: isCorrect ? '#10B981' : '#EF4444',
            color: 'white',
            fontWeight: '600',
          },
        }
      );
    }
  }, [lastAnswerResult, speak]);

  // Error handling
  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, clearError]);

  // Session completion
  useEffect(() => {
    if (currentSession?.status === 'COMPLETED') {
      speak('Quiz completed! Great job!');
      onComplete?.();
    }
  }, [currentSession?.status, onComplete, speak]);

  const handlePauseToggle = useCallback(async () => {
    try {
      if (sessionPaused) {
        await resumeSession();
        setSessionPaused(false);
        speak('Quiz resumed');
      } else {
        await pauseSession();
        setSessionPaused(true);
        speak('Quiz paused');
        onPause?.();
      }
    } catch (err) {
      toast.error('Failed to pause/resume session');
    }
  }, [sessionPaused, pauseSession, resumeSession, onPause, speak]);

  const handleAnswerSelect = useCallback((answerId: string) => {
    selectAnswer(answerId);
  }, [selectAnswer]);

  const handleAnswerUnselect = useCallback((answerId: string) => {
    unselectAnswer(answerId);
  }, [unselectAnswer]);

  const handleSubmitAnswer = useCallback(async (submission: any) => {
    try {
      await submitAnswer(submission);
    } catch (err) {
      toast.error('Failed to submit answer');
    }
  }, [submitAnswer]);

  const handleRetry = useCallback(() => {
    handleRetryQuestion();
    clearSelectedAnswers();
    speak('Try again');
  }, [handleRetryQuestion, clearSelectedAnswers, speak]);

  const handleNextQuestion = useCallback(() => {
    getCurrentQuestion();
    clearSelectedAnswers();
  }, [getCurrentQuestion, clearSelectedAnswers]);

  if (!currentSession || !currentQuestion) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="text-gray-600 dark:text-gray-400">
            {isLoadingQuestion ? 'Loading question...' : 'Initializing quiz...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header Controls */}
      <Card variant="glass">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={onExit}
                className="gap-2"
              >
                <HomeIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Exit</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handlePauseToggle}
                className="gap-2"
                disabled={isSubmittingAnswer}
              >
                {sessionPaused ? (
                  <>
                    <PlayIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">Resume</span>
                  </>
                ) : (
                  <>
                    <PauseIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">Pause</span>
                  </>
                )}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAudioEnabled(!audioEnabled)}
                className="gap-2"
                aria-label={audioEnabled ? 'Disable audio' : 'Enable audio'}
              >
                {audioEnabled ? (
                  <SpeakerWaveIcon className="w-4 h-4" />
                ) : (
                  <SpeakerXMarkIcon className="w-4 h-4" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
                aria-label="Settings"
              >
                <CogIcon className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress Indicator */}
      {progress && (
        <ProgressIndicator 
          progress={progress}
          className="sticky top-4 z-10"
        />
      )}

      {/* Question Card */}
      <AnimatePresence mode="wait">
        {!sessionPaused && (
          <motion.div
            key={currentQuestion.questionId}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.3 }}
          >
            <QuestionCard
              question={currentQuestion}
              selectedAnswers={ui.selectedAnswers}
              onAnswerSelect={handleAnswerSelect}
              onAnswerUnselect={handleAnswerUnselect}
              onSubmit={handleSubmitAnswer}
              isSubmitting={isSubmittingAnswer}
              timeSpent={0} // TODO: Add timer
              showResult={!!lastAnswerResult}
              isCorrect={lastAnswerResult?.correct}
              showExplanation={ui.showExplanation}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pause Screen */}
      <AnimatePresence>
        {sessionPaused && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
          >
            <Card className="max-w-md mx-4">
              <CardContent className="p-8 text-center space-y-6">
                <div>
                  <PauseIcon className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    Quiz Paused
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 mt-2">
                    Take a break. Your progress is saved.
                  </p>
                </div>

                <Button onClick={handlePauseToggle} size="lg" className="w-full">
                  <PlayIcon className="w-5 h-5 mr-2" />
                  Resume Quiz
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Buttons */}
      {lastAnswerResult && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {lastAnswerResult.nextAction === 'RETRY_SAME_QUESTION' && (
                <Button
                  onClick={handleRetry}
                  variant="outline"
                  className="gap-2"
                >
                  <ArrowLeftIcon className="w-4 h-4" />
                  Try Again
                </Button>
              )}

              {lastAnswerResult.nextAction === 'NEXT_QUESTION' && (
                <Button
                  onClick={handleNextQuestion}
                  className="gap-2"
                >
                  Next Question
                  <ArrowRightIcon className="w-4 h-4" />
                </Button>
              )}

              {lastAnswerResult.nextAction === 'SESSION_COMPLETE' && (
                <Button
                  onClick={onComplete}
                  className="gap-2 bg-green-600 hover:bg-green-700"
                >
                  View Results
                  <ArrowRightIcon className="w-4 h-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Keyboard shortcuts hint */}
      <div className="text-center text-xs text-gray-500 dark:text-gray-400">
        <p>💡 Tip: Use number keys (1-{currentQuestion.answers.length}) to select answers, Enter to submit</p>
      </div>
    </div>
  );
};