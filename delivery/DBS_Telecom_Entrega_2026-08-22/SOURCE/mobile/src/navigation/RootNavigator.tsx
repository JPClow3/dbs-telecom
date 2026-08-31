import React from 'react';
import { View, StyleSheet, SafeAreaView, StatusBar, Platform, Image, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { RootStackParamList } from './types';
import { TabNavigator } from './TabNavigator';
import { LoginScreen } from '../screens/LoginScreen';
import { Header } from '../components/Header';
import { OfflineBanner } from '../components/OfflineBanner';
import { NotificationsModal } from '../components/NotificationsModal';
import { Toast } from '../components/Toast';
import { useAppTheme } from '../context/ThemeContext';
import { Customer } from '../types';
import { SHADOWS, RADIUS } from '../constants/theme';

import { apiService } from '../services/api';
import { onForceLogout } from '../utils/session-events';

const Stack = createNativeStackNavigator<RootStackParamList>();

interface RootNavigatorProps {
  customer: Customer | null;
  isInitializing: boolean;
  onLoginSuccess: (customer: Customer) => void;
  onLogout: () => void;
}

export const RootNavigator: React.FC<RootNavigatorProps> = ({
  customer,
  isInitializing,
  onLoginSuccess,
  onLogout,
}) => {
  const navigation = useNavigation<any>();
  const { colors, isDark } = useAppTheme();
  const [showNotificationsModal, setShowNotificationsModal] = React.useState(false);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [toastInfo, setToastInfo] = React.useState<{ message: string; type: 'SUCCESS' | 'WARNING' | 'INFO' | 'ERROR' } | null>(null);

  const refreshUnreadCount = React.useCallback(() => {
    if (!customer) return;
    apiService.getNotifications(customer.id)
      .then((notifs) => {
        setUnreadCount(notifs.filter((n) => !n.read).length);
      })
      .catch(() => {});
  }, [customer]);

  React.useEffect(() => {
    refreshUnreadCount();
  }, [refreshUnreadCount]);

  // Sessão expirada detectada pela camada de rede (401 / 403 de token):
  // volta à tela de login reutilizando o handler de logout existente.
  React.useEffect(() => {
    const unsubscribe = onForceLogout((reason) => {
      if (reason !== 'sessao_expirada') return;
      navigation.reset({
        index: 0,
        routes: [{ name: 'MainTabs' }],
        key: undefined,
      });
      onLogout();
    });
    return unsubscribe;
  }, [navigation, onLogout]);

  // Splash inicial
  if (isInitializing) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={colors.card}
        />
        <View style={styles.splashContainer}>
          <View
            style={[
              styles.splashLogoBadge,
              {
                backgroundColor: isDark ? colors.cardSubdued : colors.white,
                borderColor: colors.border,
              },
            ]}
          >
            <Image
              source={require('../../assets/logo.png')}
              style={styles.splashLogo}
              resizeMode="contain"
            />
          </View>
          <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 24 }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: customer ? colors.card : colors.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.card}
      />
      <OfflineBanner />

      {toastInfo && (
        <Toast
          message={toastInfo.message}
          type={toastInfo.type}
          onDismiss={() => setToastInfo(null)}
        />
      )}

      {customer && (
        <Header
          customer={customer}
          onLogout={onLogout}
          onOpenNotifications={() => setShowNotificationsModal(true)}
          unreadCount={unreadCount}
        />
      )}

      <View style={[styles.screenContent, { backgroundColor: colors.background }]}>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            animation: Platform.OS === 'android' ? 'fade_from_bottom' : 'default',
          }}
        >
          {!customer ? (
            <Stack.Screen name="Login">
              {() => <LoginScreen onLoginSuccess={onLoginSuccess} />}
            </Stack.Screen>
          ) : (
            <Stack.Screen name="MainTabs">
              {() => <TabNavigator customer={customer} onLogout={onLogout} />}
            </Stack.Screen>
          )}
        </Stack.Navigator>
      </View>

      {customer && (
        <NotificationsModal
          visible={showNotificationsModal}
          clientId={customer.id}
          isDemo={customer.isDemo}
          onClose={() => {
            setShowNotificationsModal(false);
            // Atualiza o badge ao fechar: marcar como lido dentro do modal
            // precisa se refletir no sino do cabeçalho.
            refreshUnreadCount();
          }}
          onShowToast={(message, type) => setToastInfo({ message, type: type || 'SUCCESS' })}
          onNavigateToTab={(tab) => {
            setShowNotificationsModal(false);
            if (tab === 'CHAT') navigation.navigate('MainTabs', { screen: 'Chat' });
            else if (tab === 'INVOICES') navigation.navigate('MainTabs', { screen: 'Invoices' });
            else if (tab === 'PLANS') navigation.navigate('MainTabs', { screen: 'Plans' });
            else if (tab === 'PROFILE') navigation.navigate('MainTabs', { screen: 'Profile' });
          }}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  screenContent: {
    flex: 1,
  },
  splashContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogoBadge: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    ...SHADOWS.md,
    marginBottom: 14,
  },
  splashLogo: {
    width: 58,
    height: 58,
  },
});
