import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Text } from 'react-native';
import { RADIUS, SHADOWS } from '../constants/theme';
import { Sparkles } from 'lucide-react-native';
import { useAppTheme } from '../context/ThemeContext';

interface TypingIndicatorProps {
  label?: string;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  label = 'Atendimento DBS está digitando...',
}) => {
  const { colors } = useAppTheme();
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createAnimation = (dot: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: -5,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.delay(600 - delay),
        ])
      );
    };

    const anim1 = createAnimation(dot1, 0);
    const anim2 = createAnimation(dot2, 150);
    const anim3 = createAnimation(dot3, 300);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.avatar,
          {
            backgroundColor: colors.primaryLight,
            borderColor: colors.primaryBorder,
          },
        ]}
      >
        <Sparkles size={14} color={colors.primary} strokeWidth={2.2} />
      </View>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.dotsRow}>
          <Animated.View style={[styles.dot, { backgroundColor: colors.primary, transform: [{ translateY: dot1 }] }]} />
          <Animated.View style={[styles.dot, { backgroundColor: colors.primary, transform: [{ translateY: dot2 }] }]} />
          <Animated.View style={[styles.dot, { backgroundColor: colors.primary, transform: [{ translateY: dot3 }] }]} />
        </View>
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: 8,
    marginHorizontal: 16,
    gap: 8,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    borderBottomLeftRadius: RADIUS.xs,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    ...SHADOWS.sm,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
});
