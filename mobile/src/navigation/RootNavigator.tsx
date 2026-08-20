import React from 'react';
import { View, StyleSheet, SafeAreaView, StatusBar, Platform, Image, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { TabNavigator } from './TabNavigator';
import { LoginScreen } from '../screens/LoginScreen';
import { Header } from '../components/Header';
import { OfflineBanner } from '../components/OfflineBanner';
import { NotificationsModal } from '../components/NotificationsModal';
import { useAppTheme } from '../context/ThemeContext';
import { Customer } from '../types';
import { SHADOWS, RADIUS } from '../constants/theme';

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
  const { colors, isDark } = useAppTheme();
  const [showNotificationsModal, setShowNotificationsModal] = React.useState(false);

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

      {customer && (
        <Header
          customer={customer}
          onLogout={onLogout}
          onOpenNotifications={() => setShowNotificationsModal(true)}
          // O contador deve vir da API; não invente alertas antes de a central carregar.
          unreadCount={0}
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
          onClose={() => setShowNotificationsModal(false)}
          onShowToast={() => {}}
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
