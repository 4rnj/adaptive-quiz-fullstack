/**
 * Main Layout Component - Application shell with navigation and sidebar
 */

import React from 'react';
import { Disclosure } from '@headlessui/react';
import { 
  Bars3Icon, 
  XMarkIcon,
  HomeIcon,
  AcademicCapIcon,
  ChartBarIcon,
  UserIcon,
  PlusIcon
} from '@heroicons/react/24/outline';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import clsx from 'clsx';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { name: 'Analytics', href: '/analytics', icon: ChartBarIcon },
  { name: 'Profile', href: '/profile', icon: UserIcon },
];

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout } = useAuthStore();
  const location = useLocation();

  const isActive = (href: string) => location.pathname === href;

  return (
    <div className="min-h-screen bg-gray-50">
      <Disclosure as="nav" className="bg-white shadow-sm border-b border-gray-200">
        {({ open }) => (
          <>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between h-16">
                <div className="flex">
                  {/* Logo */}
                  <div className="flex-shrink-0 flex items-center">
                    <Link to="/dashboard" className="flex items-center space-x-2">
                      <AcademicCapIcon className="h-8 w-8 text-primary-600" />
                      <span className="text-xl font-bold text-gray-900">Adaptive Quiz</span>
                    </Link>
                  </div>

                  {/* Desktop Navigation */}
                  <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                    {navigation.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.name}
                          to={item.href}
                          className={clsx(
                            'inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors',
                            {
                              'border-primary-500 text-gray-900': isActive(item.href),
                              'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700': !isActive(item.href),
                            }
                          )}
                        >
                          <Icon className="w-4 h-4 mr-1" />
                          {item.name}
                        </Link>
                      );
                    })}
                  </div>
                </div>

                {/* Right side */}
                <div className="hidden sm:ml-6 sm:flex sm:items-center sm:space-x-4">
                  {/* Create Session Button */}
                  <Link
                    to="/create-session"
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                  >
                    <PlusIcon className="w-4 h-4 mr-1" />
                    New Quiz
                  </Link>

                  {/* User Menu */}
                  <div className="relative">
                    <div className="flex items-center space-x-3">
                      <div className="text-sm text-gray-700">
                        <span className="font-medium">{user?.name}</span>
                      </div>
                      <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                        <span className="text-primary-600 font-medium text-sm">
                          {user?.name?.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <button
                        onClick={logout}
                        className="text-gray-500 hover:text-gray-700 text-sm font-medium"
                      >
                        Logout
                      </button>
                    </div>
                  </div>
                </div>

                {/* Mobile menu button */}
                <div className="sm:hidden flex items-center">
                  <Disclosure.Button className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500">
                    {open ? (
                      <XMarkIcon className="block h-6 w-6" />
                    ) : (
                      <Bars3Icon className="block h-6 w-6" />
                    )}
                  </Disclosure.Button>
                </div>
              </div>
            </div>

            {/* Mobile menu */}
            <Disclosure.Panel className="sm:hidden">
              <div className="pt-2 pb-3 space-y-1">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={clsx(
                        'flex items-center pl-3 pr-4 py-2 border-l-4 text-base font-medium',
                        {
                          'bg-primary-50 border-primary-500 text-primary-700': isActive(item.href),
                          'border-transparent text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-800': !isActive(item.href),
                        }
                      )}
                    >
                      <Icon className="w-5 h-5 mr-2" />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
              
              <div className="pt-4 pb-3 border-t border-gray-200">
                <div className="flex items-center px-4">
                  <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                    <span className="text-primary-600 font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="ml-3">
                    <div className="text-base font-medium text-gray-800">{user?.name}</div>
                    <div className="text-sm text-gray-500">{user?.email}</div>
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  <Link
                    to="/create-session"
                    className="flex items-center px-4 py-2 text-base font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                  >
                    <PlusIcon className="w-5 h-5 mr-2" />
                    New Quiz
                  </Link>
                  <button
                    onClick={logout}
                    className="block w-full text-left px-4 py-2 text-base font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                  >
                    Logout
                  </button>
                </div>
              </div>
            </Disclosure.Panel>
          </>
        )}
      </Disclosure>

      {/* Main content */}
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
};