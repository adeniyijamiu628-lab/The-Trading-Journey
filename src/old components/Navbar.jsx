// src/components/Navbar.jsx
import React from 'react';

export default function Navbar({ 
  user, 
  onLogout, 
  onSwitchTab, 
  activeTab = 'dashboard',
  //..... Missing: Theme props (theme, onToggleTheme) were logically present in the 3.jsx Navbar usage,
  //..... or should be handled here to allow the user to toggle theme settings.
  theme = 'dark', // Placeholder based on expected 3.jsx functionality
  onToggleTheme = () => {}, // Placeholder based on expected 3.jsx functionality
}) {

  // Function to determine the class for active/inactive tabs
  const getTabClass = (tabName) => 
    `px-3 py-1.5 rounded-lg font-medium text-sm transition-colors ${
      activeTab === tabName 
        ? 'bg-purple-600 text-white shadow-md' 
        : 'text-gray-300 hover:bg-gray-700'
    }`;

  return (
    <header className="w-full bg-gray-900 border-b border-gray-800 text-gray-200 sticky top-0 z-20">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 py-3">
        
        {/* Logo and Navigation */}
        <div className="flex items-center space-x-6">
          <div className="text-xl font-extrabold text-purple-400 tracking-wider cursor-pointer" onClick={() => onSwitchTab && onSwitchTab('dashboard')}>
            Trading Journey
          </div>
          
          {/* Tab Navigation Buttons */}
          <nav className="hidden sm:flex gap-1"> 
            <button 
              className={getTabClass('dashboard')} 
              onClick={() => onSwitchTab && onSwitchTab('dashboard')}
            >
              Dashboard
            </button>
            <button 
              className={getTabClass('tradelog')} 
              onClick={() => onSwitchTab && onSwitchTab('tradelog')}
            >
              Trade Log
            </button>
            <button 
              className={getTabClass('weeklyReview')} 
              onClick={() => onSwitchTab && onSwitchTab('weeklyReview')}
            >
              Weekly Review
            </button>
          </nav>
        </div>

        {/* User Actions and Theme Toggle */}
        <div className="flex items-center gap-3">
          
          {/* Theme Toggle (Re-added from 3.jsx implied functionality) */}
          <button 
            onClick={onToggleTheme} 
            className="p-2 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Theme`}
          >
            {theme === 'dark' ? '☀️' : '🌙'} 
          </button>
          
          {/* Settings Tab (for small screens or general access) */}
          <button 
            className={`${getTabClass('settings')} sm:hidden`} // Hide on larger screens if settings is in main nav
            onClick={() => onSwitchTab && onSwitchTab('settings')}
            title="Settings"
          >
            Settings
          </button>

          {/* User/Logout Info */}
          {user ? (
            <div className="flex items-center gap-3 border-l border-gray-700 pl-4">
              <div className="text-sm font-medium text-gray-400 hidden sm:block">
                {user.email || 'User'}
              </div>
              <button 
                onClick={onLogout} 
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
              >
                Logout
              </button>
            </div>
          ) : (
            <div className="text-sm font-medium text-gray-400">
              Not Signed In
            </div>
          )}
        </div>
      </div>
    </header>
  );
}