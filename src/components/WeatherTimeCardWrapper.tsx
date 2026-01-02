'use client';

import { useUser } from '@clerk/nextjs';
import { WeatherTimeCard } from './WeatherTimeCard';

/**
 * Wrapper component that provides user context to WeatherTimeCard
 * Shows personalized greeting when user is logged in
 */
export const WeatherTimeCardWrapper: React.FC = () => {
  const { user, isLoaded } = useUser();
  
  // Get user's first name if logged in
  const userName = isLoaded && user ? user.firstName : null;
  
  return <WeatherTimeCard userName={userName} />;
};

