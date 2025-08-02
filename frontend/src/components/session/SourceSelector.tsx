/**
 * Source Selector Component - Select quiz sources for multi-source sessions
 * Allows users to browse and add multiple quiz sources with different configurations
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  PlusIcon, 
  MinusIcon, 
  MagnifyingGlassIcon,
  TagIcon,
  ClockIcon,
  AcademicCapIcon,
  GlobeAltIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline';
import { useSessionCreationStore } from '@/store/sessionStore';
import { SessionSource, Language } from '@/types/quiz';
import clsx from 'clsx';

const languages: { code: Language; name: string }[] = [
  { code: 'EN', name: 'English' },
  { code: 'ES', name: 'Spanish' },
  { code: 'FR', name: 'French' },
  { code: 'DE', name: 'German' },
];

export const SourceSelector: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showAddForm, setShowAddForm] = useState(false);

  const {
    availableSources,
    isLoadingSources,
    selectedSources,
    errors,
    addSource,
    removeSource,
    updateSource,
  } = useSessionCreationStore();

  const [newSource, setNewSource] = useState<SessionSource>({
    category: '',
    provider: '',
    certificate: '',
    language: 'EN',
    questionCount: 10,
  });

  const filteredSources = availableSources.filter(source => {
    const matchesSearch = searchQuery === '' || 
      source.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      source.provider.toLowerCase().includes(searchQuery.toLowerCase()) ||
      source.certificate.toLowerCase().includes(searchQuery.toLowerCase()) ||
      source.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = selectedCategory === 'all' || source.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const categories = ['all', ...Array.from(new Set(availableSources.map(s => s.category)))];

  const handleAddSource = (sourceTemplate: any) => {
    const source: SessionSource = {
      category: sourceTemplate.category,
      provider: sourceTemplate.provider,
      certificate: sourceTemplate.certificate,
      language: sourceTemplate.languages[0] || 'EN',
      questionCount: Math.min(20, sourceTemplate.totalQuestions),
    };

    addSource(source);
    setShowAddForm(false);
  };

  const handleRemoveSource = (index: number) => {
    removeSource(index);
  };

  const handleUpdateSourceCount = (index: number, questionCount: number) => {
    updateSource(index, { questionCount });
  };

  const handleUpdateSourceLanguage = (index: number, language: Language) => {
    updateSource(index, { language });
  };

  const isSourceSelected = (sourceTemplate: any) => {
    return selectedSources.some(
      selected => 
        selected.category === sourceTemplate.category &&
        selected.provider === sourceTemplate.provider &&
        selected.certificate === sourceTemplate.certificate
    );
  };

  const getTotalQuestions = () => {
    return selectedSources.reduce((total, source) => total + source.questionCount, 0);
  };

  const getEstimatedTime = () => {
    return Math.round(getTotalQuestions() * 2); // 2 minutes per question
  };

  if (isLoadingSources) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600">Loading available quiz sources...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Select Quiz Sources</h2>
        <p className="text-gray-600">
          Choose one or more quiz sources to create your adaptive learning session.
        </p>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search sources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          {categories.map(category => (
            <option key={category} value={category}>
              {category === 'all' ? 'All Categories' : category.charAt(0).toUpperCase() + category.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Selected Sources Summary */}
      {selectedSources.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-primary-50 border border-primary-200 rounded-lg p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-primary-900">Selected Sources ({selectedSources.length})</h3>
            <div className="text-sm text-primary-700">
              <span className="font-medium">{getTotalQuestions()}</span> questions • 
              <span className="font-medium"> ~{getEstimatedTime()}</span> minutes
            </div>
          </div>

          <div className="space-y-3">
            {selectedSources.map((source, index) => (
              <motion.div
                key={`${source.category}-${source.provider}-${source.certificate}-${index}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-lg p-3 border border-primary-200"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">
                      {source.provider} - {source.certificate}
                    </div>
                    <div className="text-sm text-gray-600">
                      {source.category}
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    {/* Language selector */}
                    <select
                      value={source.language}
                      onChange={(e) => handleUpdateSourceLanguage(index, e.target.value as Language)}
                      className="text-sm border border-gray-300 rounded px-2 py-1"
                    >
                      {languages.map(lang => (
                        <option key={lang.code} value={lang.code}>
                          {lang.name}
                        </option>
                      ))}
                    </select>

                    {/* Question count input */}
                    <div className="flex items-center space-x-2">
                      <label className="text-sm text-gray-600">Questions:</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={source.questionCount}
                        onChange={(e) => handleUpdateSourceCount(index, parseInt(e.target.value) || 1)}
                        className="w-16 text-sm border border-gray-300 rounded px-2 py-1 text-center"
                      />
                    </div>

                    {/* Remove button */}
                    <button
                      onClick={() => handleRemoveSource(index)}
                      className="text-red-600 hover:text-red-800 transition-colors"
                    >
                      <MinusIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {errors.sources && (
            <p className="mt-2 text-sm text-red-600">{errors.sources}</p>
          )}
        </motion.div>
      )}

      {/* Available Sources */}
      <div>
        <h3 className="font-semibold text-gray-900 mb-4">Available Sources</h3>
        
        {filteredSources.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <AcademicCapIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No sources found matching your criteria.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredSources.map((source, index) => (
              <motion.div
                key={`${source.category}-${source.provider}-${source.certificate}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={clsx(
                  'border rounded-lg p-4 transition-all cursor-pointer',
                  {
                    'border-gray-200 hover:border-gray-300 hover:shadow-md': !isSourceSelected(source),
                    'border-primary-300 bg-primary-50': isSourceSelected(source),
                  }
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <TagIcon className="w-4 h-4 text-gray-400" />
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {source.category}
                      </span>
                    </div>

                    <h4 className="font-semibold text-gray-900 mb-1">
                      {source.provider} - {source.certificate}
                    </h4>
                    
                    <p className="text-sm text-gray-600 mb-3">
                      {source.description}
                    </p>

                    <div className="flex items-center space-x-4 text-xs text-gray-500">
                      <div className="flex items-center space-x-1">
                        <AcademicCapIcon className="w-3 h-3" />
                        <span>{source.totalQuestions} questions</span>
                      </div>
                      
                      <div className="flex items-center space-x-1">
                        <ClockIcon className="w-3 h-3" />
                        <span>~{source.estimatedTime}min</span>
                      </div>

                      <div className="flex items-center space-x-1">
                        <GlobeAltIcon className="w-3 h-3" />
                        <span>{source.languages.join(', ')}</span>
                      </div>
                    </div>

                    {/* Difficulty indicator */}
                    <div className="mt-2 flex items-center space-x-2">
                      <span className="text-xs text-gray-500">Difficulty:</span>
                      <div className="flex space-x-1">
                        {[1, 2, 3, 4, 5].map(level => (
                          <div
                            key={level}
                            className={clsx('w-2 h-2 rounded-full', {
                              'bg-primary-500': level <= source.difficulty,
                              'bg-gray-200': level > source.difficulty,
                            })}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => isSourceSelected(source) ? null : handleAddSource(source)}
                    disabled={isSourceSelected(source)}
                    className={clsx(
                      'flex-shrink-0 p-2 rounded-lg transition-colors',
                      {
                        'bg-primary-600 text-white hover:bg-primary-700': !isSourceSelected(source),
                        'bg-gray-300 text-gray-500 cursor-not-allowed': isSourceSelected(source),
                      }
                    )}
                  >
                    {isSourceSelected(source) ? (
                      <MinusIcon className="w-4 h-4" />
                    ) : (
                      <PlusIcon className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Validation Messages */}
      {Object.keys(errors).length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="font-semibold text-red-800 mb-2">Please fix the following errors:</h4>
          <ul className="text-sm text-red-700 space-y-1">
            {Object.entries(errors).map(([key, message]) => (
              <li key={key}>• {message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};