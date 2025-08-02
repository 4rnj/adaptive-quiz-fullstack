/**
 * Home Page - Landing page for the adaptive quiz application
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  AcademicCapIcon,
  LightBulbIcon,
  ChartBarIcon,
  ArrowRightIcon,
  CheckIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { useAuthStore } from '@/store/authStore';

const features = [
  {
    icon: LightBulbIcon,
    title: 'Adaptive Learning',
    description: 'Questions adapt to your performance, focusing on areas that need improvement',
  },
  {
    icon: ArrowPathIcon,
    title: 'Immediate Feedback',
    description: 'Wrong answers trigger instant retry with shuffled choices for better learning',
  },
  {
    icon: ChartBarIcon,
    title: 'Progress Tracking',
    description: 'Detailed analytics and insights into your learning progress and patterns',
  },
];

const benefits = [
  'Multi-source quiz integration',
  'Intelligent question selection',
  'Wrong answer pool management',
  'Real-time progress indicators',
  'Comprehensive analytics',
  'Mobile-responsive design',
];

export const HomePage: React.FC = () => {
  const { isAuthenticated } = useAuthStore();

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <AcademicCapIcon className="h-8 w-8 text-primary-600" />
              <span className="text-xl font-bold text-gray-900">Adaptive Quiz</span>
            </div>
            
            <div className="flex items-center space-x-4">
              {isAuthenticated ? (
                <Link
                  to="/dashboard"
                  className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors"
                >
                  Go to Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="text-gray-700 hover:text-gray-900 transition-colors"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/register"
                    className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-primary-50 to-blue-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl md:text-6xl font-bold text-gray-900 mb-6"
            >
              Smart Learning with{' '}
              <span className="text-primary-600">Adaptive Quizzes</span>
            </motion.h1>
            
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto"
            >
              Experience intelligent quiz sessions that adapt to your learning style. 
              Get immediate feedback, track your progress, and master topics efficiently 
              with our advanced adaptive learning algorithm.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              {isAuthenticated ? (
                <Link
                  to="/dashboard"
                  className="inline-flex items-center px-8 py-3 bg-primary-600 text-white text-lg font-semibold rounded-lg hover:bg-primary-700 transition-colors"
                >
                  Go to Dashboard
                  <ArrowRightIcon className="ml-2 h-5 w-5" />
                </Link>
              ) : (
                <>
                  <Link
                    to="/register"
                    className="inline-flex items-center px-8 py-3 bg-primary-600 text-white text-lg font-semibold rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    Start Learning
                    <ArrowRightIcon className="ml-2 h-5 w-5" />
                  </Link>
                  <Link
                    to="/login"
                    className="inline-flex items-center px-8 py-3 bg-white text-primary-600 text-lg font-semibold rounded-lg border border-primary-600 hover:bg-primary-50 transition-colors"
                  >
                    Sign In
                  </Link>
                </>
              )}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              How Adaptive Learning Works
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Our intelligent system learns from your responses and adapts 
              to provide personalized learning experiences.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="text-center p-6 rounded-lg border border-gray-200 hover:shadow-lg transition-shadow"
                >
                  <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <Icon className="h-6 w-6 text-primary-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600">
                    {feature.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">
                Everything You Need for Effective Learning
              </h2>
              <p className="text-lg text-gray-600 mb-8">
                Our platform combines cutting-edge adaptive learning technology 
                with comprehensive analytics to create the most effective study experience.
              </p>

              <div className="space-y-4">
                {benefits.map((benefit, index) => (
                  <motion.div
                    key={benefit}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center space-x-3"
                  >
                    <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center">
                      <CheckIcon className="h-3 w-3 text-green-600" />
                    </div>
                    <span className="text-gray-700">{benefit}</span>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="bg-white rounded-lg shadow-xl p-8 border border-gray-200">
                <div className="space-y-4">
                  <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                  <div className="space-y-2">
                    <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-3 bg-gray-200 rounded w-5/6 animate-pulse"></div>
                  </div>
                  <div className="bg-primary-50 rounded-lg p-4">
                    <div className="h-3 bg-primary-200 rounded animate-pulse"></div>
                  </div>
                  <div className="flex space-x-2">
                    <div className="h-8 bg-primary-600 rounded flex-1"></div>
                    <div className="h-8 bg-gray-200 rounded w-16"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Transform Your Learning?
          </h2>
          <p className="text-xl text-primary-100 mb-8 max-w-2xl mx-auto">
            Join thousands of learners who are already using adaptive quizzes 
            to accelerate their certification preparation.
          </p>
          
          {!isAuthenticated && (
            <Link
              to="/register"
              className="inline-flex items-center px-8 py-3 bg-white text-primary-600 text-lg font-semibold rounded-lg hover:bg-gray-50 transition-colors"
            >
              Get Started Free
              <ArrowRightIcon className="ml-2 h-5 w-5" />
            </Link>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-2 mb-4 md:mb-0">
              <AcademicCapIcon className="h-6 w-6 text-primary-400" />
              <span className="text-xl font-bold text-white">Adaptive Quiz</span>
            </div>
            
            <div className="text-gray-400 text-sm">
              © 2024 Adaptive Quiz. Intelligent learning for everyone.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};