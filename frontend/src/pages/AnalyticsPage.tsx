/**
 * Analytics Page - User learning analytics and insights
 */

import React from 'react';
import { motion } from 'framer-motion';

export const AnalyticsPage: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-12"
      >
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Analytics Dashboard</h1>
        <p className="text-gray-600 max-w-2xl mx-auto">
          Detailed analytics and insights will be available here once you start taking quizzes. 
          Track your progress, identify weak areas, and monitor your learning velocity.
        </p>
      </motion.div>
    </div>
  );
};