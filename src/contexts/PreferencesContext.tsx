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

  // Load preferences from Supabase via API
  useEffect(() => {
    const fetchPreferences = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/preferences');
        if (response.ok) {
          const data = await response.json();
          if (data.preferences) {
            setPreferences({ ...DEFAULT_PREFERENCES, ...data.preferences });
          }
        }
      } catch (error) {
        console.error('Failed to fetch preferences:', error);
      }
      setIsLoading(false);
    };

    if (isLoaded) {
      fetchPreferences();
    }
  }, [user, isLoaded]);

  // Update preferences - save to Supabase via API
  const updatePreferences = useCallback(async (updates: Partial<UserPreferences>) => {
    const newPrefs = { ...preferences, ...updates };
    setPreferences(newPrefs);

    if (user) {
      try {
        await fetch('/api/preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preferences: newPrefs }),
        });
      } catch (error) {
        console.error('Failed to save preferences:', error);
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

