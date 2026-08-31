import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, DimensionValue, ViewStyle } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { RADIUS, SHADOWS } from '../constants/theme';

interface SkeletonBoxProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: ViewStyle;
}

/**
 * Bloco básico de Skeleton com efeito pulsante (Shimmer)
 */
export const SkeletonBox: React.FC<SkeletonBoxProps> = ({
  width = '100%',
  height = 16,
  borderRadius = RADIUS.xs,
  style,
}) => {
  const { isDark } = useAppTheme();
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 750,
          useNativeDriver: true,
        }),
      ])
    );
    pulseAnim.start();

    return () => pulseAnim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: isDark ? '#353742' : '#E2E8F0',
          opacity,
        },
        style,
      ]}
    />
  );
};

/**
 * Placeholder Skeleton estilizado para Card de Fatura
 */
export const SkeletonInvoiceCard: React.FC = () => {
  const { colors, isDark } = useAppTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
        <View style={styles.titleGroup}>
          <SkeletonBox width={34} height={34} borderRadius={RADIUS.sm} />
          <View style={styles.columnGap}>
            <SkeletonBox width={140} height={14} borderRadius={RADIUS.xs} />
            <SkeletonBox width={90} height={10} borderRadius={RADIUS.xs} />
          </View>
        </View>
        <SkeletonBox width={70} height={22} borderRadius={RADIUS.full} />
      </View>

      {/* Meta Row (Valor e Vencimento) */}
      <View style={styles.metaRow}>
        <View style={styles.columnGap}>
          <SkeletonBox width={65} height={9} borderRadius={RADIUS.xs} />
          <SkeletonBox width={110} height={24} borderRadius={RADIUS.xs} />
          <SkeletonBox width={150} height={10} borderRadius={RADIUS.xs} />
        </View>
        <View style={[styles.columnGap, { alignItems: 'flex-end' }]}>
          <SkeletonBox width={75} height={9} borderRadius={RADIUS.xs} />
          <SkeletonBox width={85} height={14} borderRadius={RADIUS.xs} />
        </View>
      </View>

      {/* Barcode Placeholder */}
      <View
        style={[
          styles.barcodeBox,
          {
            backgroundColor: colors.cardSubdued,
            borderColor: colors.border,
          },
        ]}
      >
        <SkeletonBox width={80} height={10} borderRadius={RADIUS.xs} />
        <SkeletonBox width={'95%'} height={12} borderRadius={RADIUS.xs} style={{ marginTop: 6 }} />
      </View>

      {/* Botões de Ação */}
      <View style={styles.actionsRow}>
        <SkeletonBox width={'48%'} height={38} borderRadius={RADIUS.sm} />
        <SkeletonBox width={'48%'} height={38} borderRadius={RADIUS.sm} />
      </View>
    </View>
  );
};

/**
 * Placeholder Skeleton estilizado para Card de Planos
 */
export const SkeletonPlanCard: React.FC = () => {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          marginVertical: 8,
        },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.columnGap}>
          <SkeletonBox width={160} height={16} borderRadius={RADIUS.xs} />
          <SkeletonBox width={100} height={14} borderRadius={RADIUS.xs} />
        </View>
        <SkeletonBox width={65} height={22} borderRadius={RADIUS.sm} />
      </View>

      {/* Descrição */}
      <SkeletonBox width={'90%'} height={12} borderRadius={RADIUS.xs} style={{ marginTop: 10 }} />
      <SkeletonBox width={'70%'} height={12} borderRadius={RADIUS.xs} style={{ marginTop: 4 }} />

      {/* Box de Velocidades Download / Upload */}
      <View
        style={[
          styles.speedBox,
          {
            backgroundColor: colors.cardSubdued,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.flexOne}>
          <SkeletonBox width={60} height={10} borderRadius={RADIUS.xs} />
          <SkeletonBox width={80} height={14} borderRadius={RADIUS.xs} style={{ marginTop: 4 }} />
          <SkeletonBox width={'90%'} height={4} borderRadius={2} style={{ marginTop: 6 }} />
        </View>
        <View style={[styles.speedDivider, { backgroundColor: colors.border }]} />
        <View style={styles.flexOne}>
          <SkeletonBox width={60} height={10} borderRadius={RADIUS.xs} />
          <SkeletonBox width={80} height={14} borderRadius={RADIUS.xs} style={{ marginTop: 4 }} />
          <SkeletonBox width={'90%'} height={4} borderRadius={2} style={{ marginTop: 6 }} />
        </View>
      </View>

      {/* Bloco de Preço */}
      <View
        style={[
          styles.priceBox,
          {
            backgroundColor: colors.primaryUltraLight,
            borderColor: colors.primaryBorder,
          },
        ]}
      >
        <SkeletonBox width={140} height={12} borderRadius={RADIUS.xs} />
        <SkeletonBox width={120} height={28} borderRadius={RADIUS.xs} style={{ marginTop: 6 }} />
      </View>

      {/* Lista de Recursos */}
      <View style={styles.featuresGap}>
        <SkeletonBox width={'85%'} height={12} borderRadius={RADIUS.xs} />
        <SkeletonBox width={'75%'} height={12} borderRadius={RADIUS.xs} />
        <SkeletonBox width={'80%'} height={12} borderRadius={RADIUS.xs} />
      </View>

      {/* Botão de Contratação */}
      <SkeletonBox width={'100%'} height={44} borderRadius={RADIUS.md} style={{ marginTop: 14 }} />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
    padding: 16,
    marginVertical: 6,
    borderWidth: 1,
    ...SHADOWS.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  columnGap: {
    gap: 4,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  barcodeBox: {
    padding: 10,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    marginBottom: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  flexOne: {
    flex: 1,
  },
  speedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: RADIUS.md,
    marginTop: 12,
    borderWidth: 1,
  },
  speedDivider: {
    width: 1,
    height: 36,
    marginHorizontal: 12,
  },
  priceBox: {
    padding: 14,
    borderRadius: RADIUS.md,
    marginVertical: 12,
    borderWidth: 1,
  },
  featuresGap: {
    gap: 8,
    marginTop: 4,
  },
});
