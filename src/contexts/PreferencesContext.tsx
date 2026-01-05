'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { UserPreferences, DEFAULT_PREFERENCES, TimeFormat, MeasurementSystem, Currency } from '../types/preferences';

interface PreferencesContextType {
  preferences: UserPreferences;
  updatePreferences: (updates: Partial<UserPreferences>) => void;
  formatTime: (date: Date) => string;
  isLoading: boolean;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);

  // Load preferences from Clerk unsafeMetadata only
  useEffect(() => {
    if (isLoaded) {
      if (user?.unsafeMetadata?.preferences) {
        const userPrefs = user.unsafeMetadata.preferences as Partial<UserPreferences>;
        setPreferences({ ...DEFAULT_PREFERENCES, ...userPrefs });
      }
      setIsLoading(false);
    }
  }, [user, isLoaded]);

  // Update preferences - save only to Clerk unsafeMetadata
  const updatePreferences = useCallback(async (updates: Partial<UserPreferences>) => {
    const newPrefs = { ...preferences, ...updates };
    setPreferences(newPrefs);

    // Save to Clerk unsafeMetadata only
    if (user) {
      try {
        await user.update({
          unsafeMetadata: {
            ...user.unsafeMetadata,
            preferences: newPrefs,
          },
        });
      } catch (error) {
        console.error('Failed to save preferences to Clerk:', error);
      }
    }
  }, [preferences, user]);

  // Format time according to user preference
  const formatTime = useCallback((date: Date): string => {
    if (preferences.timeFormat === '12h') {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    }
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }, [preferences.timeFormat]);

  return (
    <PreferencesContext.Provider value={{ preferences, updatePreferences, formatTime, isLoading }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextType {
  const context = useContext(PreferencesContext);
  if (!context) {
    // Return default values if used outside provider
    return {
      preferences: DEFAULT_PREFERENCES,
      updatePreferences: () => {},
      formatTime: (date: Date) => date.toLocaleTimeString(),
      isLoading: false,
    };
  }
  return context;
}

// Export types for convenience
export type { TimeFormat, MeasurementSystem, Currency };

