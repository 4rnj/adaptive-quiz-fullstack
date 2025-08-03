/**
 * Mobile-Optimized Session Wizard - Touch-friendly quiz setup
 * Features: Swipe navigation, haptic feedback, progressive disclosure
 */

import React, { useState } from 'react';
import { motion, PanInfo } from 'framer-motion';
import { 
  ChevronLeftIcon, 
  ChevronRightIcon,
  CheckIcon,
  PlayIcon,
  BookOpenIcon,
  GlobeAltIcon,
  AcademicCapIcon,
  AdjustmentsHorizontalIcon
} from '@heroicons/react/24/outline';

import { SessionConfig, SessionSource, Language } from '@/types/quiz';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { cn } from '@/utils/cn';

interface MobileSessionWizardProps {
  onCreateSession: (config: SessionConfig) => void;
  onCancel: () => void;
  availableSources?: SessionSource[];
  className?: string;
}

interface WizardStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  component: React.ComponentType<any>;
}

const languages: { code: Language; name: string; flag: string }[] = [
  { code: 'EN', name: 'English', flag: '🇺🇸' },
  { code: 'ES', name: 'Español', flag: '🇪🇸' },
  { code: 'FR', name: 'Français', flag: '🇫🇷' },
  { code: 'DE', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'IT', name: 'Italiano', flag: '🇮🇹' },
  { code: 'PT', name: 'Português', flag: '🇵🇹' },
];

const categories = [
  { id: 'aws', name: 'AWS Certification', icon: '☁️', color: 'bg-blue-500' },
  { id: 'javascript', name: 'JavaScript', icon: '⚡', color: 'bg-yellow-500' },
  { id: 'python', name: 'Python', icon: '🐍', color: 'bg-green-500' },
  { id: 'react', name: 'React', icon: '⚛️', color: 'bg-cyan-500' },
  { id: 'nodejs', name: 'Node.js', icon: '🟢', color: 'bg-green-600' },
  { id: 'docker', name: 'Docker', icon: '🐳', color: 'bg-blue-600' },
];

const providers = [
  { id: 'aws', name: 'AWS Training', logo: '☁️', trusted: true },
  { id: 'coursera', name: 'Coursera', logo: '🎓', trusted: true },
  { id: 'udemy', name: 'Udemy', logo: '📚', trusted: false },
  { id: 'pluralsight', name: 'Pluralsight', logo: '💡', trusted: true },
];

export const MobileSessionWizard: React.FC<MobileSessionWizardProps> = ({
  onCreateSession,
  onCancel,
  // availableSources = [],
  className,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [sessionConfig, setSessionConfig] = useState<Partial<SessionConfig>>({
    name: '',
    sources: [],
    settings: {
      randomizeQuestions: true,
      adaptiveLearning: true,
      wrongAnswerPercentage: 30,
      timeLimit: undefined,
    },
    totalQuestions: 20,
    estimatedDuration: 30,
  });

  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<Language>('EN');
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);

  // Haptic feedback helper
  const vibrate = (pattern: number | number[]) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  };

  // Swipe detection
  const handleDragEnd = (_event: any, info: PanInfo) => {
    const threshold = 100;
    const velocity = info.velocity.x;
    const offset = info.offset.x;

    if (Math.abs(velocity) > 500 || Math.abs(offset) > threshold) {
      vibrate(50);
      if (velocity > 0 || offset > 0) {
        handlePrevious();
      } else {
        handleNext();
      }
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
      vibrate(50);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      vibrate(50);
    }
  };

  const handleCreateSession = () => {
    const sources: SessionSource[] = selectedCategories.flatMap(category => 
      selectedProviders.map(provider => ({
        category,
        provider,
        certificate: `${provider}-${category}`,
        language: selectedLanguage,
        questionCount: Math.floor(sessionConfig.totalQuestions! / selectedCategories.length),
      }))
    );

    const config: SessionConfig = {
      name: sessionConfig.name || `${selectedCategories.join(', ')} Quiz`,
      sources,
      settings: sessionConfig.settings!,
      totalQuestions: sessionConfig.totalQuestions!,
      estimatedDuration: sessionConfig.estimatedDuration!,
    };

    vibrate([100, 50, 100]);
    onCreateSession(config);
  };

  // Step components
  const SourceSelectionStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Choose Your Topics
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Select the subjects you want to practice
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {categories.map((category) => {
          const isSelected = selectedCategories.includes(category.id);
          return (
            <motion.button
              key={category.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                vibrate(30);
                setSelectedCategories(prev => 
                  isSelected 
                    ? prev.filter(id => id !== category.id)
                    : [...prev, category.id]
                );
              }}
              className={cn(
                'p-4 rounded-xl border-2 transition-all text-left',
                'min-h-[80px] relative overflow-hidden',
                isSelected
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm', category.color)}>
                  {category.icon}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                    {category.name}
                  </div>
                </div>
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center"
                  >
                    <CheckIcon className="w-3 h-3 text-white" />
                  </motion.div>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );

  const LanguageSelectionStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Select Language
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Choose your preferred quiz language
        </p>
      </div>

      <div className="space-y-3">
        {languages.map((language) => {
          const isSelected = selectedLanguage === language.code;
          return (
            <motion.button
              key={language.code}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                vibrate(30);
                setSelectedLanguage(language.code);
              }}
              className={cn(
                'w-full p-4 rounded-xl border-2 transition-all text-left',
                isSelected
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700'
              )}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{language.flag}</span>
                <span className="font-medium text-gray-900 dark:text-gray-100 flex-1">
                  {language.name}
                </span>
                {isSelected && (
                  <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                    <CheckIcon className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );

  const ProviderSelectionStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Choose Providers
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Select question sources
        </p>
      </div>

      <div className="space-y-3">
        {providers.map((provider) => {
          const isSelected = selectedProviders.includes(provider.id);
          return (
            <motion.button
              key={provider.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                vibrate(30);
                setSelectedProviders(prev => 
                  isSelected 
                    ? prev.filter(id => id !== provider.id)
                    : [...prev, provider.id]
                );
              }}
              className={cn(
                'w-full p-4 rounded-xl border-2 transition-all text-left',
                isSelected
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700'
              )}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{provider.logo}</span>
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {provider.name}
                  </div>
                  {provider.trusted && (
                    <div className="text-xs text-green-600 dark:text-green-400">
                      ✓ Verified Provider
                    </div>
                  )}
                </div>
                {isSelected && (
                  <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                    <CheckIcon className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );

  const SettingsStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Quiz Settings
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Customize your quiz experience
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <div>
            <div className="font-medium text-gray-900 dark:text-gray-100">
              Questions
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Total number of questions
            </div>
          </div>
          <select
            value={sessionConfig.totalQuestions}
            onChange={(e) => setSessionConfig(prev => ({ ...prev, totalQuestions: parseInt(e.target.value) }))}
            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2"
          >
            <option value={10}>10 Questions</option>
            <option value={20}>20 Questions</option>
            <option value={30}>30 Questions</option>
            <option value={50}>50 Questions</option>
          </select>
        </div>

        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <div>
            <div className="font-medium text-gray-900 dark:text-gray-100">
              Adaptive Learning
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              AI adjusts difficulty based on performance
            </div>
          </div>
          <button
            onClick={() => {
              vibrate(30);
              setSessionConfig(prev => ({
                ...prev,
                settings: {
                  ...prev.settings!,
                  adaptiveLearning: !prev.settings!.adaptiveLearning
                }
              }));
            }}
            className={cn(
              'w-12 h-6 rounded-full transition-colors relative',
              sessionConfig.settings?.adaptiveLearning ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
            )}
          >
            <div className={cn(
              'w-5 h-5 rounded-full bg-white transition-transform absolute top-0.5',
              sessionConfig.settings?.adaptiveLearning ? 'translate-x-6' : 'translate-x-0.5'
            )} />
          </button>
        </div>

        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <div>
            <div className="font-medium text-gray-900 dark:text-gray-100">
              Randomize Questions
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Shuffle question order
            </div>
          </div>
          <button
            onClick={() => {
              vibrate(30);
              setSessionConfig(prev => ({
                ...prev,
                settings: {
                  ...prev.settings!,
                  randomizeQuestions: !prev.settings!.randomizeQuestions
                }
              }));
            }}
            className={cn(
              'w-12 h-6 rounded-full transition-colors relative',
              sessionConfig.settings?.randomizeQuestions ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
            )}
          >
            <div className={cn(
              'w-5 h-5 rounded-full bg-white transition-transform absolute top-0.5',
              sessionConfig.settings?.randomizeQuestions ? 'translate-x-6' : 'translate-x-0.5'
            )} />
          </button>
        </div>
      </div>
    </div>
  );

  const ReviewStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Review & Start
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Ready to begin your quiz?
        </p>
      </div>

      <Card variant="outlined">
        <CardContent className="p-4 space-y-4">
          <div>
            <div className="font-medium text-gray-900 dark:text-gray-100 mb-2">Topics</div>
            <div className="flex flex-wrap gap-2">
              {selectedCategories.map(id => {
                const category = categories.find(c => c.id === id);
                return (
                  <span key={id} className="px-3 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 rounded-full text-sm">
                    {category?.icon} {category?.name}
                  </span>
                );
              })}
            </div>
          </div>

          <div>
            <div className="font-medium text-gray-900 dark:text-gray-100 mb-2">Language</div>
            <div className="text-gray-600 dark:text-gray-400">
              {languages.find(l => l.code === selectedLanguage)?.flag} {languages.find(l => l.code === selectedLanguage)?.name}
            </div>
          </div>

          <div>
            <div className="font-medium text-gray-900 dark:text-gray-100 mb-2">Settings</div>
            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <div>Questions: {sessionConfig.totalQuestions}</div>
              <div>Adaptive Learning: {sessionConfig.settings?.adaptiveLearning ? 'Enabled' : 'Disabled'}</div>
              <div>Estimated Duration: ~{sessionConfig.estimatedDuration} minutes</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const steps: WizardStep[] = [
    {
      id: 'sources',
      title: 'Topics',
      description: 'Choose subjects',
      icon: BookOpenIcon,
      component: SourceSelectionStep,
    },
    {
      id: 'language',
      title: 'Language',
      description: 'Select language',
      icon: GlobeAltIcon,
      component: LanguageSelectionStep,
    },
    {
      id: 'providers',
      title: 'Providers',
      description: 'Choose sources',
      icon: AcademicCapIcon,
      component: ProviderSelectionStep,
    },
    {
      id: 'settings',
      title: 'Settings',
      description: 'Customize quiz',
      icon: AdjustmentsHorizontalIcon,
      component: SettingsStep,
    },
    {
      id: 'review',
      title: 'Review',
      description: 'Ready to start',
      icon: PlayIcon,
      component: ReviewStep,
    },
  ];

  const currentStepData = steps[currentStep];
  const StepComponent = currentStepData.component;

  const canProceed = () => {
    switch (currentStep) {
      case 0: return selectedCategories.length > 0;
      case 1: return selectedLanguage !== null;
      case 2: return selectedProviders.length > 0;
      case 3: return true;
      case 4: return true;
      default: return false;
    }
  };

  return (
    <div className={cn("max-w-md mx-auto", className)}>
      <Card className="overflow-hidden">
        {/* Header */}
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <button
              onClick={onCancel}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            
            <div className="text-center">
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                {currentStepData.title}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Step {currentStep + 1} of {steps.length}
              </div>
            </div>

            <div className="w-9" /> {/* Spacer */}
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-4">
            <motion.div
              className="bg-blue-500 h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </CardHeader>

        {/* Content */}
        <CardContent className="p-6">
          <motion.div
            key={currentStep}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={handleDragEnd}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.2 }}
          >
            <StepComponent />
          </motion.div>
        </CardContent>

        {/* Navigation */}
        <div className="p-6 pt-0 flex gap-3">
          {currentStep > 0 && (
            <Button
              variant="outline"
              onClick={handlePrevious}
              className="flex-1"
            >
              <ChevronLeftIcon className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}

          <Button
            onClick={currentStep === steps.length - 1 ? handleCreateSession : handleNext}
            disabled={!canProceed()}
            className="flex-1"
          >
            {currentStep === steps.length - 1 ? (
              <>
                <PlayIcon className="w-4 h-4 mr-2" />
                Start Quiz
              </>
            ) : (
              <>
                Next
                <ChevronRightIcon className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Swipe hint */}
      <div className="text-center mt-4 text-xs text-gray-500 dark:text-gray-400">
        💡 Swipe left/right to navigate between steps
      </div>
    </div>
  );
};