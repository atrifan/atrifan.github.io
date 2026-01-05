'use client';

import React from 'react';
import { usePreferences } from './PreferencesContext';
import { UserPreferences } from '../types/preferences';

export interface WithPreferencesProps {
  preferences: UserPreferences;
}

/**
 * Higher-Order Component that injects user preferences into class components.
 * 
 * Usage:
 * ```tsx
 * class MyComponent extends Component<MyProps & WithPreferencesProps> { ... }
 * export default withPreferences(MyComponent);
 * ```
 */
export function withPreferences<P extends WithPreferencesProps>(
  WrappedComponent: React.ComponentType<P>
): React.FC<Omit<P, keyof WithPreferencesProps>> {
  const WithPreferencesComponent: React.FC<Omit<P, keyof WithPreferencesProps>> = (props) => {
    const { preferences } = usePreferences();
    return <WrappedComponent {...(props as P)} preferences={preferences} />;
  };

  WithPreferencesComponent.displayName = `withPreferences(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;

  return WithPreferencesComponent;
}

