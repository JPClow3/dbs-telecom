import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { ThemeProvider } from './src/context/ThemeContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { linking } from './src/navigation/linking';
import { storageService } from './src/services/storage';
import { biometricsService } from './src/services/biometrics';
import { exitDemoMode, setAuthToken } from './src/services/api';
import { hapticFeedback } from './src/utils/haptics';
import { Customer } from './src/types';

function MainApp() {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Restore only a complete token-backed session. Customer display data alone
  // must never put the app in the authenticated navigation tree.
  useEffect(() => {
    async function restoreSession() {
      try {
        const savedSession = await storageService.getAuthSession();
        if (savedSession) {
          setAuthToken(savedSession.token);
          setCustomer(savedSession.customer);
        }
      } catch (e) {
        console.warn('Erro ao restaurar sessão:', e);
      } finally {
        setIsInitializing(false);
      }
    }
    restoreSession();
  }, []);

  const handleLoginSuccess = (authenticatedCustomer: Customer) => {
    setCustomer(authenticatedCustomer);
  };

  const handleLogout = async () => {
    hapticFeedback.medium();
    exitDemoMode();
    setAuthToken(null);
    await storageService.clearAuthSession();
    await biometricsService.disable();
    setCustomer(null);
  };

  return (
    <NavigationContainer linking={linking}>
      <RootNavigator
        customer={customer}
        isInitializing={isInitializing}
        onLoginSuccess={handleLoginSuccess}
        onLogout={handleLogout}
      />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    // Barreira de erro global: impede a tela branca em caso de crash de render.
    <ErrorBoundary>
      <ThemeProvider>
        <MainApp />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
