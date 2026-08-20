import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SHADOWS, RADIUS } from '../constants/theme';
import { DBSPlan } from '../types';
import { useAppTheme } from '../context/ThemeContext';
import { hapticFeedback } from '../utils/haptics';
import {
  Wifi,
  Zap,
  Check,
  ChevronRight,
  Star,
  Download,
  Upload,
  Sparkles,
} from 'lucide-react-native';

interface PlanCardProps {
  plan: DBSPlan;
  onSelect?: (plan: DBSPlan) => void;
}

export const PlanCard: React.FC<PlanCardProps> = ({ plan, onSelect }) => {
  const { colors, isDark } = useAppTheme();
  const isWifi6 = plan.type === 'WIFI6';

  const handleSelect = () => {
    hapticFeedback.medium();
    if (onSelect) onSelect(plan);
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
        plan.isPopular && { borderColor: colors.primary, borderWidth: 1.5 },
        isWifi6 && { borderColor: colors.wifi6Border },
      ]}
    >
      {/* Badge Flutuante Popular */}
      {plan.isPopular && (
        <View style={[styles.popularBadge, { backgroundColor: colors.primary }]}>
          <Star size={10} color="#FFFFFF" fill="#FFFFFF" />
          <Text style={styles.popularText}>MAIS ESCOLHIDO</Text>
        </View>
      )}

      {/* Header do Card */}
      <View style={styles.header}>
        <View style={styles.titleArea}>
          <Text style={[styles.planName, { color: colors.secondary }]}>{plan.name}</Text>
          <View style={styles.speedRow}>
            <Zap size={14} color={colors.primary} strokeWidth={2.5} />
            <Text style={[styles.speedText, { color: colors.primary }]}>{plan.speed}</Text>
          </View>
        </View>

        {isWifi6 && (
          <View
            style={[
              styles.wifi6Badge,
              {
                backgroundColor: colors.wifi6Light,
                borderColor: colors.wifi6Border,
              },
            ]}
          >
            <Wifi size={12} color={colors.wifi6} strokeWidth={2.5} />
            <Text style={[styles.wifi6Text, { color: colors.wifi6Dark }]}>WI-FI 6</Text>
          </View>
        )}
      </View>

      <Text style={[styles.description, { color: colors.textMuted }]}>{plan.description}</Text>

      {/* Medidores Gráficos de Velocidade Download vs Upload */}
      <View
        style={[
          styles.speedBox,
          {
            backgroundColor: colors.cardSubdued,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.speedCol}>
          <View style={styles.speedHeader}>
            <Download size={12} color={colors.successDark} strokeWidth={2.2} />
            <Text style={[styles.speedLabel, { color: colors.textMuted }]}>Download</Text>
          </View>
          <Text style={[styles.speedValue, { color: colors.text }]}>{plan.downloadMbps} Mbps</Text>
          <View style={[styles.speedTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.speedFill,
                {
                  backgroundColor: colors.success,
                  width: `${Math.min(100, (plan.downloadMbps / 1000) * 100)}%`,
                },
              ]}
            />
          </View>
        </View>

        <View style={[styles.speedDivider, { backgroundColor: colors.border }]} />

        <View style={styles.speedCol}>
          <View style={styles.speedHeader}>
            <Upload size={12} color={colors.infoDark} strokeWidth={2.2} />
            <Text style={[styles.speedLabel, { color: colors.textMuted }]}>Upload</Text>
          </View>
          <Text style={[styles.speedValue, { color: colors.text }]}>{plan.uploadMbps} Mbps</Text>
          <View style={[styles.speedTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.speedFill,
                {
                  backgroundColor: colors.info,
                  width: `${Math.min(100, (plan.uploadMbps / 500) * 100)}%`,
                },
              ]}
            />
          </View>
        </View>
      </View>

      {/* Bloco de Preço */}
      <View
        style={[
          styles.pricingBox,
          {
            backgroundColor: colors.primaryUltraLight,
            borderColor: colors.primaryBorder,
          },
        ]}
      >
        {plan.priceOnTime ? (
          <View>
            <View style={styles.discountPill}>
              <Sparkles size={10} color={isDark ? '#FFA07A' : colors.primaryDark} />
              <Text
                style={[
                  styles.discountPillText,
                  { color: isDark ? '#FFA07A' : colors.primaryDark },
                ]}
              >
                Desconto com pontualidade dia 10
              </Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={[styles.currencySymbol, { color: colors.primary }]}>R$</Text>
              <Text style={[styles.priceMain, { color: colors.primary }]}>
                {plan.priceOnTime.toFixed(2).replace('.', ',')}
              </Text>
              <Text style={[styles.pricePeriod, { color: colors.textMuted }]}>/mês</Text>
            </View>
            <Text style={[styles.oldPrice, { color: colors.textMuted }]}>
              Preço normal: R$ {plan.price.toFixed(2).replace('.', ',')}
            </Text>
          </View>
        ) : (
          <View>
            <Text style={[styles.discountLabel, { color: colors.textMuted }]}>Valor fixo mensal:</Text>
            <View style={styles.priceRow}>
              <Text style={[styles.currencySymbol, { color: colors.primary }]}>R$</Text>
              <Text style={[styles.priceMain, { color: colors.primary }]}>
                {plan.price.toFixed(2).replace('.', ',')}
              </Text>
              <Text style={[styles.pricePeriod, { color: colors.textMuted }]}>/mês</Text>
            </View>
          </View>
        )}
      </View>

      {/* Lista de Recursos / Vantagens */}
      <View style={styles.featuresList}>
        {plan.features.map((feat, idx) => (
          <View key={idx} style={styles.featureItem}>
            <View style={[styles.checkCircle, { backgroundColor: colors.successLight }]}>
              <Check size={11} color={colors.successDark} strokeWidth={2.5} />
            </View>
            <Text style={[styles.featureText, { color: colors.textSecondary }]}>{feat}</Text>
          </View>
        ))}
      </View>

      {/* Botão de Contratação */}
      <TouchableOpacity
        style={[styles.hireBtn, { backgroundColor: colors.primary }]}
        onPress={handleSelect}
        activeOpacity={0.8}
      >
        <Text style={styles.hireBtnText}>Quero Contratar Este Plano</Text>
        <ChevronRight size={16} color="#FFFFFF" strokeWidth={2.5} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
    padding: 18,
    marginVertical: 8,
    borderWidth: 1,
    position: 'relative',
    ...SHADOWS.md,
  },
  popularBadge: {
    position: 'absolute',
    top: -11,
    right: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    borderRadius: RADIUS.full,
    ...SHADOWS.primary,
  },
  popularText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleArea: {
    flex: 1,
  },
  planName: {
    fontSize: 17,
    fontWeight: '900',
  },
  speedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  speedText: {
    fontSize: 14,
    fontWeight: '800',
  },
  wifi6Badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },
  wifi6Text: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  description: {
    fontSize: 12.5,
    marginTop: 8,
    lineHeight: 17,
  },
  speedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: RADIUS.md,
    marginTop: 12,
    borderWidth: 1,
  },
  speedCol: {
    flex: 1,
  },
  speedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  speedLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  speedValue: {
    fontSize: 14,
    fontWeight: '900',
    marginTop: 2,
  },
  speedTrack: {
    height: 4,
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  speedFill: {
    height: '100%',
    borderRadius: 2,
  },
  speedDivider: {
    width: 1,
    height: 36,
    marginHorizontal: 12,
  },
  pricingBox: {
    borderWidth: 1,
    padding: 14,
    borderRadius: RADIUS.md,
    marginVertical: 14,
  },
  discountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  discountPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  discountLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  currencySymbol: {
    fontSize: 15,
    fontWeight: '900',
    marginRight: 2,
  },
  priceMain: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  pricePeriod: {
    fontSize: 13,
    marginLeft: 4,
    fontWeight: '600',
  },
  oldPrice: {
    fontSize: 11,
    textDecorationLine: 'line-through',
    marginTop: 2,
  },
  featuresList: {
    gap: 8,
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkCircle: {
    width: 18,
    height: 18,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    fontSize: 12.5,
    fontWeight: '500',
    flex: 1,
  },
  hireBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: RADIUS.md,
    ...SHADOWS.primary,
  },
  hireBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13.5,
  },
});
