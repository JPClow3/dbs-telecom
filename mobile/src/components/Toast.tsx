import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { SHADOWS, RADIUS } from '../constants/theme';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react-native';
import { useAppTheme } from '../context/ThemeContext';
import { hapticFeedback } from '../utils/haptics';

export type ToastType = 'SUCCESS' | 'ERROR' | 'INFO' | 'WARNING';

interface ToastProps {
  message: string;
  type?: ToastType;
  onDismiss?: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'SUCCESS',
  onDismiss,
  duration = 3000,
}) => {
  const { colors, isDark } = useAppTheme();
  const translateY = useRef(new Animated.Value(-60)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (type === 'ERROR') {
      hapticFeedback.error();
    } else if (type === 'INFO' || type === 'WARNING') {
      hapticFeedback.light();
    } else {
      hapticFeedback.success();
    }

    // Entrada com slide e fade
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();

    // Saída automática
    const timer = setTimeout(() => {
      handleDismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -40,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (onDismiss) onDismiss();
    });
  };

  const getIcon = () => {
    switch (type) {
      case 'ERROR':
        return <AlertCircle size={16} color="#FFFFFF" strokeWidth={2.5} />;
      case 'WARNING':
        return <AlertCircle size={16} color="#FFFFFF" strokeWidth={2.5} />;
      case 'INFO':
        return <Info size={16} color="#FFFFFF" strokeWidth={2.5} />;
      default:
        return <CheckCircle2 size={16} color="#FFFFFF" strokeWidth={2.5} />;
    }
  };

  const getBackgroundColor = () => {
    switch (type) {
      case 'ERROR':
        return colors.dangerDark;
      case 'WARNING':
        return isDark ? '#D97706' : '#B45309';
      case 'INFO':
        return colors.infoDark;
      default:
        return isDark ? '#2D3748' : colors.secondary;
    }
  };

  return (
    <Animated.View
      style={[
        styles.toastWrapper,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <View style={[styles.toastContainer, { backgroundColor: getBackgroundColor() }]}>
        <View style={styles.iconCircle}>{getIcon()}</View>
        <Text style={styles.messageText} numberOfLines={2}>
          {message}
        </Text>
        <TouchableOpacity onPress={handleDismiss} style={styles.closeBtn} activeOpacity={0.7}>
          <X size={14} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  toastWrapper: {
    position: 'absolute',
    top: 14,
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  toastContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    gap: 10,
    ...SHADOWS.lg,
  },
  iconCircle: {
    width: 26,
    height: 26,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  closeBtn: {
    padding: 4,
  },
});
