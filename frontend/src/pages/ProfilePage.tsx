/**
 * Profile Page - User profile and settings
 */

import React from 'react';
import { motion } from 'framer-motion';

export const ProfilePage: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-12"
      >
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Profile Settings</h1>
        <p className="text-gray-600 max-w-2xl mx-auto">
          Manage your account settings, preferences, and learning goals. 
          Customize your adaptive learning experience to match your study style.
        </p>
      </motion.div>
    </div>
  );
};