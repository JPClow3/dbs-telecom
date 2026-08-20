import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
  RefreshControl,
} from 'react-native';
import { SHADOWS, RADIUS } from '../constants/theme';
import { PlanCard } from '../components/PlanCard';
import { SkeletonPlanCard } from '../components/Skeleton';
import { Toast, ToastType } from '../components/Toast';
import { apiService } from '../services/api';
import { useAppTheme } from '../context/ThemeContext';
import { hapticFeedback } from '../utils/haptics';
import { DBSPlan } from '../types';
import {
  Globe,
  Wifi,
  Gift,
  Smartphone,
  Users,
  Gamepad2,
  Share2,
} from 'lucide-react-native';

interface PlansScreenProps {
  onSelectPlan?: (plan: DBSPlan) => void;
}

export const PlansScreen: React.FC<PlansScreenProps> = ({ onSelectPlan }) => {
  const { colors, isDark } = useAppTheme();
  const [selectedTab, setSelectedTab] = useState<'URBANO' | 'WIFI6'>('URBANO');
  const [plans, setPlans] = useState<DBSPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toastInfo, setToastInfo] = useState<{ message: string; type: ToastType } | null>(null);
  const [deviceFilter, setDeviceFilter] = useState<'ALL' | 'FEW' | 'FAMILY' | 'GAMER'>('ALL');

  const loadPlans = async () => {
    try {
      const data = await apiService.getPlans(selectedTab);
      setPlans(data);
    } catch (e) {
      console.warn('Erro ao carregar planos:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadPlans();
  }, [selectedTab]);

  const showToast = (message: string, type: ToastType = 'SUCCESS') => {
    setToastInfo({ message, type });
  };

  const handleShareReferral = () => {
    hapticFeedback.success();
    const text = 'Venha para a DBS Telecom com 100% de fibra ótica! Use meu link e ganhe instalação gratuita: https://dbstelecom.com.br/indique/emanuel2270';
    if (Platform.OS === 'web') {
      try {
        navigator.clipboard.writeText(text);
        showToast('Link de indicação copiado com sucesso!');
      } catch (e) {
        showToast('Link copiado!');
      }
    } else {
      showToast('Link de indicação copiado!');
    }
  };

  const handleSelectDevice = (type: 'FEW' | 'FAMILY' | 'GAMER') => {
    hapticFeedback.selection();
    if (type === deviceFilter) {
      setDeviceFilter('ALL');
      return;
    }
    setDeviceFilter(type);
    if (type === 'GAMER') {
      setSelectedTab('WIFI6');
    } else {
      setSelectedTab('URBANO');
    }
  };

  const handleTabChange = (tab: 'URBANO' | 'WIFI6') => {
    hapticFeedback.selection();
    setSelectedTab(tab);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Toast Flutuante */}
      {toastInfo && (
        <Toast
          message={toastInfo.message}
          type={toastInfo.type}
          onDismiss={() => setToastInfo(null)}
        />
      )}

      {/* Header Informativo */}
      <View style={styles.headerBox}>
        <Text style={[styles.headerTitle, { color: colors.secondary }]}>Planos DBS Fibra Ótica</Text>
        <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
          Conexão 100% FTTH com ultravelocidade, baixa latência e instalação gratuita.
        </Text>
      </View>

      {/* Simulador Rápido por Perfil de Uso */}
      <View
        style={[
          styles.deviceSimulatorBox,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.simulatorTitle, { color: colors.textMuted }]}>
          QUANTOS DISPOSITIVOS USAM INTERNET?
        </Text>
        <View style={styles.simulatorRow}>
          <TouchableOpacity
            style={[
              styles.simulatorBtn,
              {
                backgroundColor: colors.cardSubdued,
                borderColor: colors.border,
              },
              deviceFilter === 'FEW' && {
                backgroundColor: colors.primaryUltraLight,
                borderColor: colors.primaryBorder,
              },
            ]}
            onPress={() => handleSelectDevice('FEW')}
            activeOpacity={0.7}
          >
            <Smartphone
              size={14}
              color={deviceFilter === 'FEW' ? colors.primary : colors.textMuted}
            />
            <Text
              style={[
                styles.simulatorBtnText,
                { color: colors.textMuted },
                deviceFilter === 'FEW' && {
                  color: isDark ? '#FFA07A' : colors.primaryDark,
                  fontWeight: '800',
                },
              ]}
            >
              1 a 3 aparelhos
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.simulatorBtn,
              {
                backgroundColor: colors.cardSubdued,
                borderColor: colors.border,
              },
              deviceFilter === 'FAMILY' && {
                backgroundColor: colors.primaryUltraLight,
                borderColor: colors.primaryBorder,
              },
            ]}
            onPress={() => handleSelectDevice('FAMILY')}
            activeOpacity={0.7}
          >
            <Users
              size={14}
              color={deviceFilter === 'FAMILY' ? colors.primary : colors.textMuted}
            />
            <Text
              style={[
                styles.simulatorBtnText,
                { color: colors.textMuted },
                deviceFilter === 'FAMILY' && {
                  color: isDark ? '#FFA07A' : colors.primaryDark,
                  fontWeight: '800',
                },
              ]}
            >
              Família (4-8)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.simulatorBtn,
              {
                backgroundColor: colors.cardSubdued,
                borderColor: colors.border,
              },
              deviceFilter === 'GAMER' && {
                backgroundColor: colors.wifi6Light,
                borderColor: colors.wifi6Border,
              },
            ]}
            onPress={() => handleSelectDevice('GAMER')}
            activeOpacity={0.7}
          >
            <Gamepad2
              size={14}
              color={deviceFilter === 'GAMER' ? colors.wifi6 : colors.textMuted}
            />
            <Text
              style={[
                styles.simulatorBtnText,
                { color: colors.textMuted },
                deviceFilter === 'GAMER' && { color: colors.wifi6, fontWeight: '800' },
              ]}
            >
              Gamer / 8+
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Banner do Programa Indique e Ganhe 50% OFF */}
      <View
        style={[
          styles.referralBanner,
          {
            backgroundColor: colors.primaryUltraLight,
            borderColor: colors.primaryBorder,
          },
        ]}
      >
        <View style={[styles.referralIconBox, { backgroundColor: colors.primaryLight }]}>
          <Gift size={20} color={isDark ? '#FFA07A' : colors.primaryDark} strokeWidth={2.2} />
        </View>
        <View style={styles.referralContent}>
          <View style={styles.referralTitleRow}>
            <Text style={[styles.referralTitle, { color: isDark ? '#FFA07A' : colors.primaryDark }]}>
              Indique um Amigo e Ganhe 50% OFF
            </Text>
          </View>
          <Text style={[styles.referralText, { color: colors.textSecondary }]}>
            Indique amigos para assinar a DBS Telecom e ganhe 50% de desconto na sua próxima mensalidade.
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.referralShareBtn, { backgroundColor: colors.primaryLight }]}
          onPress={handleShareReferral}
          activeOpacity={0.75}
        >
          <Share2 size={14} color={isDark ? '#FFA07A' : colors.primaryDark} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      {/* Abas de Categorias */}
      <View
        style={[
          styles.tabContainer,
          {
            backgroundColor: colors.cardSubdued,
            borderColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.tabBtn,
            selectedTab === 'URBANO' && [styles.tabBtnActive, { backgroundColor: colors.card }],
          ]}
          onPress={() => handleTabChange('URBANO')}
          activeOpacity={0.8}
        >
          <Globe
            size={15}
            color={selectedTab === 'URBANO' ? colors.primary : colors.textMuted}
            strokeWidth={2.2}
          />
          <Text
            style={[
              styles.tabText,
              { color: colors.textMuted },
              selectedTab === 'URBANO' && { color: colors.primary, fontWeight: '800' },
            ]}
          >
            Planos Urbanos
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabBtn,
            selectedTab === 'WIFI6' && [styles.tabBtnActive, { backgroundColor: colors.card }],
          ]}
          onPress={() => handleTabChange('WIFI6')}
          activeOpacity={0.8}
        >
          <Wifi
            size={15}
            color={selectedTab === 'WIFI6' ? colors.wifi6 : colors.textMuted}
            strokeWidth={2.2}
          />
          <Text
            style={[
              styles.tabText,
              { color: colors.textMuted },
              selectedTab === 'WIFI6' && { color: colors.wifi6, fontWeight: '800' },
            ]}
          >
            Tecnologia Wi-Fi 6
          </Text>
        </TouchableOpacity>
      </View>

      {/* Carregamento com Skeleton Shimmer ou Catálogo de Planos */}
      {loading ? (
        <View style={styles.skeletonContainer}>
          <SkeletonPlanCard />
          <SkeletonPlanCard />
        </View>
      ) : (
        <FlatList
          data={plans}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PlanCard plan={item} onSelect={onSelectPlan} />}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                hapticFeedback.light();
                setRefreshing(true);
                loadPlans();
              }}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconBox, { backgroundColor: colors.primaryLight }]}>
                <Globe size={32} color={colors.primary} strokeWidth={2} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.secondary }]}>Nenhum Plano Encontrado</Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                Puxe para baixo para recarregar o catálogo oficial da DBS Telecom.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBox: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12.5,
    marginTop: 4,
    lineHeight: 17,
  },
  deviceSimulatorBox: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: RADIUS.md,
    padding: 12,
    borderWidth: 1,
    ...SHADOWS.sm,
  },
  simulatorTitle: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  simulatorRow: {
    flexDirection: 'row',
    gap: 6,
  },
  simulatorBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  simulatorBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  referralBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderRadius: RADIUS.md,
    gap: 10,
  },
  referralIconBox: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  referralContent: {
    flex: 1,
  },
  referralTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  referralTitle: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  referralText: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  referralShareBtn: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: RADIUS.md,
    padding: 3,
    borderWidth: 1,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.sm,
  },
  tabBtnActive: {
    ...SHADOWS.sm,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
  },
  skeletonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingBottom: 30,
    flexGrow: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 30,
  },
  emptyIconBox: {
    width: 60,
    height: 60,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});
