/**
 * Dashboard Page - Main user dashboard
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  PlusIcon,
  AcademicCapIcon,
  ChartBarIcon,
  ClockIcon,
  TrophyIcon
} from '@heroicons/react/24/outline';

export const DashboardPage: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">Welcome back! Ready to continue your learning journey?</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-primary-500 to-blue-600 rounded-lg p-6 text-white"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">Start New Quiz</h3>
              <p className="text-primary-100 text-sm">Create a new adaptive learning session</p>
            </div>
            <PlusIcon className="w-8 h-8" />
          </div>
          <Link
            to="/create-session"
            className="mt-4 inline-block bg-white text-primary-600 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            Get Started
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white border border-gray-200 rounded-lg p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Sessions</h3>
            <AcademicCapIcon className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-gray-600 text-sm mb-4">Continue where you left off</p>
          <Link
            to="/quiz"
            className="text-primary-600 hover:text-primary-700 font-medium text-sm"
          >
            View all sessions →
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white border border-gray-200 rounded-lg p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Analytics</h3>
            <ChartBarIcon className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-gray-600 text-sm mb-4">Track your learning progress</p>
          <Link
            to="/analytics"
            className="text-primary-600 hover:text-primary-700 font-medium text-sm"
          >
            View analytics →
          </Link>
        </motion.div>
      </div>

      {/* Stats Overview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8"
      >
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Learning Overview</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3">
              <AcademicCapIcon className="w-6 h-6 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-gray-900">0</div>
            <div className="text-sm text-gray-600">Questions Answered</div>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-3">
              <TrophyIcon className="w-6 h-6 text-green-600" />
            </div>
            <div className="text-2xl font-bold text-gray-900">0%</div>
            <div className="text-sm text-gray-600">Accuracy Rate</div>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-3">
              <ClockIcon className="w-6 h-6 text-purple-600" />
            </div>
            <div className="text-2xl font-bold text-gray-900">0h</div>
            <div className="text-sm text-gray-600">Study Time</div>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mx-auto mb-3">
              <ChartBarIcon className="w-6 h-6 text-orange-600" />
            </div>
            <div className="text-2xl font-bold text-gray-900">0</div>
            <div className="text-sm text-gray-600">Sessions Completed</div>
          </div>
        </div>
      </motion.div>

      {/* Getting Started */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-gray-50 rounded-lg p-6"
      >
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Getting Started</h2>
        <p className="text-gray-600 mb-6">
          Create your first adaptive quiz session to start learning. Our intelligent system will adapt to your performance and help you master topics efficiently.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            to="/create-session"
            className="inline-flex items-center px-6 py-3 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            <PlusIcon className="w-4 h-4 mr-2" />
            Create Your First Quiz
          </Link>
          
          <Link
            to="/analytics"
            className="inline-flex items-center px-6 py-3 bg-white text-gray-700 font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            <ChartBarIcon className="w-4 h-4 mr-2" />
            Learn About Analytics
          </Link>
        </div>
      </motion.div>
    </div>
  );
};