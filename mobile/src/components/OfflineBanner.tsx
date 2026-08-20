import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useAppTheme } from '../context/ThemeContext';
import { RADIUS, SHADOWS } from '../constants/theme';
import { WifiOff, RefreshCw } from 'lucide-react-native';
import { hapticFeedback } from '../utils/haptics';

export const OfflineBanner: React.FC = () => {
  const { isConnected } = useNetworkStatus();
  const { colors, isDark } = useAppTheme();
  const isOffline = !isConnected;

  const translateY = useRef(new Animated.Value(-50)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isOffline) {
      hapticFeedback.warning();
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -50,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOffline]);

  if (!isOffline && (translateY as any)._value === -50) {
    return null;
  }

  const handleRetry = () => {
    hapticFeedback.light();
  };

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          transform: [{ translateY }],
          opacity,
          backgroundColor: isDark ? '#381C12' : '#FFF1EB',
          borderColor: isDark ? '#5E2816' : '#FED7C7',
        },
      ]}
    >
      <View style={styles.content}>
        <View style={[styles.iconBox, { backgroundColor: isDark ? '#26140D' : '#FEE2D5' }]}>
          <WifiOff size={14} color={colors.primary} strokeWidth={2.2} />
        </View>

        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: isDark ? '#FFA07A' : colors.primaryDark }]}>
            Sem conexão com a internet
          </Text>
          <Text style={[styles.subtitle, { color: isDark ? '#CBD5E1' : colors.textSecondary }]}>
            Modo offline ativo • Recursos locais disponíveis
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.retryBtn, { backgroundColor: colors.primary }]}
          onPress={handleRetry}
          activeOpacity={0.8}
        >
          <RefreshCw size={11} color={colors.white} strokeWidth={2.5} />
          <Text style={styles.retryText}>Reconectar</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
    zIndex: 1000,
    ...SHADOWS.sm,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 10.5,
    fontWeight: '500',
    marginTop: 1,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
  },
});
