import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
  Share,
  RefreshControl,
  Linking,
} from 'react-native';
import { SHADOWS, RADIUS } from '../constants/theme';
import { PlanCard } from '../components/PlanCard';
import { SkeletonPlanCard } from '../components/Skeleton';
import { Toast, ToastType } from '../components/Toast';
import { apiService } from '../services/api';
import { isDemoMode } from '../services/api/demoAdapter';
import { useAppTheme } from '../context/ThemeContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { hapticFeedback } from '../utils/haptics';
import { Customer, DBSPlan } from '../types';
import {
  Globe,
  Wifi,
  Gift,
  Smartphone,
  Users,
  Gamepad2,
  Share2,
  Tv,
  Zap,
  ShieldCheck,
  MessageCircle,
  Check,
  Info,
} from 'lucide-react-native';

interface PlansScreenProps {
  customer?: Customer | null;
  onSelectPlan?: (plan: DBSPlan) => void;
}

export const PlansScreen: React.FC<PlansScreenProps> = ({ customer, onSelectPlan }) => {
  const { colors, isDark } = useAppTheme();
  const { isConnected, isInternetReachable } = useNetworkStatus();
  const isNetworkOnline = isConnected && isInternetReachable !== false;
  const [selectedTab, setSelectedTab] = useState<'URBANO' | 'WIFI6'>('URBANO');
  const [plans, setPlans] = useState<DBSPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [toastInfo, setToastInfo] = useState<{ message: string; type: ToastType } | null>(null);
  const [deviceFilter, setDeviceFilter] = useState<'ALL' | 'FEW' | 'FAMILY' | 'GAMER'>('ALL');

  const loadPlans = async () => {
    setLoadError(false);
    try {
      const data = await apiService.getPlans(selectedTab);
      // Guarda de formato: a API pode mudar de forma; nunca filtrar sobre não-lista.
      setPlans(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('Erro ao carregar planos:', e);
      setPlans([]);
      setLoadError(true);
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

  const handleShareReferral = async () => {
    hapticFeedback.success();
    if (isDemoMode() || customer?.isDemo) {
      showToast('Prévia local: compartilhamento de indicação está desativado.', 'WARNING');
      return;
    }

    if (!customer?.id) {
      showToast('Não foi possível identificar sua conta para compartilhar a indicação.', 'WARNING');
      return;
    }

    let referralLink = '';
    try {
      const summary = await apiService.getReferralSummary(customer.id);
      referralLink = summary.referralLink?.trim() || '';
    } catch {
      showToast('O link de indicação ainda não está disponível no servidor.', 'WARNING');
      return;
    }

    if (!/^https:\/\//i.test(referralLink)) {
      showToast('O link de indicação ainda não está disponível no servidor.', 'WARNING');
      return;
    }

    const text = 'Venha para a DBS Telecom com 100% de fibra ótica! Use meu link e ganhe instalação gratuita: ' + referralLink;
    if (Platform.OS === 'web') {
      try {
        if (!navigator.clipboard) throw new Error('Clipboard indisponível');
        await navigator.clipboard.writeText(text);
        showToast('Link de indicação copiado com sucesso!');
      } catch (e) {
        showToast('Não foi possível copiar automaticamente. Selecione o link e tente novamente.', 'WARNING');
      }
    } else {
      try {
        await Share.share({ message: text });
        showToast('Link de indicação pronto para compartilhar!');
      } catch (e) {
        showToast('Não foi possível abrir o compartilhamento.', 'WARNING');
      }
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

  // O simulador por perfil filtra o catálogo por faixa de velocidade
  // compatível com a quantidade de aparelhos conectados.
  const matchesDeviceFilter = (plan: DBSPlan): boolean => {
    if (deviceFilter === 'ALL') return true;
    if (deviceFilter === 'FEW') return plan.downloadMbps <= 400;
    if (deviceFilter === 'FAMILY') return plan.downloadMbps > 400 && plan.downloadMbps <= 600;
    return plan.downloadMbps > 600;
  };

  const handleOpenWhatsAppSales = () => {
    hapticFeedback.light();
    const url = 'https://wa.me/5549988776655?text=Ol%C3%A1!%20Gostaria%20de%20tirar%20d%C3%BAvidas%20sobre%20os%20planos%20de%20fibra%20da%20DBS%20Telecom.';
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => {});
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

      {(loadError || !isNetworkOnline) && (
        <View
          style={[styles.statusNotice, { backgroundColor: colors.warningLight, borderColor: colors.warningBorder }]}
          accessibilityLiveRegion="polite"
        >
          <Text style={[styles.statusNoticeText, { color: colors.warningDark }]}>
            {loadError
              ? 'Não foi possível carregar o catálogo oficial.'
              : 'Você está offline. Estes planos são apenas uma prévia local.'}
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { borderColor: colors.warningDark }]}
            onPress={loadPlans}
            accessibilityRole="button"
            accessibilityLabel="Tentar carregar planos novamente"
          >
            <Text style={[styles.retryButtonText, { color: colors.warningDark }]}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      )}

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
            accessibilityRole="button"
            accessibilityLabel="Filtrar planos para uma a três aparelhos"
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
            accessibilityRole="button"
            accessibilityLabel="Filtrar planos para família"
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
            accessibilityRole="button"
            accessibilityLabel="Filtrar planos para gamer ou oito aparelhos ou mais"
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
          disabled={isDemoMode() || customer?.isDemo}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={isDemoMode() || customer?.isDemo
            ? 'Compartilhar indicação — indisponível na prévia local'
            : 'Copiar ou compartilhar meu link de indicação'}
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
          accessibilityRole="tab"
          accessibilityState={{ selected: selectedTab === 'URBANO' }}
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
          accessibilityRole="tab"
          accessibilityState={{ selected: selectedTab === 'WIFI6' }}
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
          data={plans.filter(matchesDeviceFilter)}
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
          ListFooterComponent={
            <View style={styles.plansFooterBox}>
              {/* Card Comparativo de Uso */}
              <View
                style={[
                  styles.guideCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.guideHeader}>
                  <View style={[styles.guideIconBox, { backgroundColor: colors.primaryLight }]}>
                    <Info size={16} color={colors.primary} strokeWidth={2.5} />
                  </View>
                  <Text style={[styles.guideTitle, { color: colors.secondary }]}>
                    Como escolher o plano ideal?
                  </Text>
                </View>

                <View style={styles.guideItemsList}>
                  <View style={styles.guideItem}>
                    <Tv size={15} color={colors.primary} strokeWidth={2.2} />
                    <View style={styles.guideItemTextCol}>
                      <Text style={[styles.guideItemTitle, { color: colors.text }]}>Streaming 4K e Smart TVs</Text>
                      <Text style={[styles.guideItemSub, { color: colors.textMuted }]}>
                        Assista Netflix, YouTube e IPTV em múltiplos televisores sem travamentos.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.guideItem}>
                    <Gamepad2 size={15} color={colors.wifi6} strokeWidth={2.2} />
                    <View style={styles.guideItemTextCol}>
                      <Text style={[styles.guideItemTitle, { color: colors.text }]}>Jogos Online & Ping Baixo</Text>
                      <Text style={[styles.guideItemSub, { color: colors.textMuted }]}>
                        Rotas otimizadas para servidores de jogos e roteadores Wi-Fi 6 de latência ultra-baixa.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.guideItem}>
                    <ShieldCheck size={15} color={colors.successDark} strokeWidth={2.2} />
                    <View style={styles.guideItemTextCol}>
                      <Text style={[styles.guideItemTitle, { color: colors.text }]}>Instalação 100% Gratuita</Text>
                      <Text style={[styles.guideItemSub, { color: colors.textMuted }]}>
                        Isenção total da taxa de instalação no plano fidelidade 12 meses.
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Botão de Contato Direto com Consultor Comercial via WhatsApp */}
              <TouchableOpacity
                style={[
                  styles.whatsappConsultBtn,
                  {
                    backgroundColor: colors.successLight,
                    borderColor: colors.successBorder,
                  },
                ]}
                onPress={handleOpenWhatsAppSales}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Falar com consultor de vendas no WhatsApp"
              >
                <MessageCircle size={18} color={colors.successDark} strokeWidth={2.2} />
                <View style={styles.whatsappConsultTextBox}>
                  <Text style={[styles.whatsappConsultTitle, { color: colors.successDark }]}>
                    Dúvidas sobre viabilidade ou contratação?
                  </Text>
                  <Text style={[styles.whatsappConsultSub, { color: colors.textSecondary }]}>
                    Toque aqui para falar com um consultor DBS no WhatsApp
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconBox, { backgroundColor: colors.primaryLight }]}>
                <Globe size={32} color={colors.primary} strokeWidth={2} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.secondary }]}>Nenhum Plano Encontrado</Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {deviceFilter !== 'ALL'
                  ? 'Nenhum plano desta faixa de aparelhos nesta categoria. Toque novamente no perfil para limpar o filtro ou puxe para recarregar.'
                  : 'Puxe para baixo para recarregar o catálogo oficial da DBS Telecom.'}
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
  statusNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 8,
    padding: 10,
    borderWidth: 1,
    borderRadius: RADIUS.md,
  },
  statusNoticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  retryButton: {
    borderWidth: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  retryButtonText: {
    fontSize: 10.5,
    fontWeight: '800',
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
  plansFooterBox: {
    marginTop: 14,
    gap: 12,
  },
  guideCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: 16,
    ...SHADOWS.sm,
  },
  guideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  guideIconBox: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  guideItemsList: {
    gap: 10,
  },
  guideItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  guideItemTextCol: {
    flex: 1,
  },
  guideItemTitle: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  guideItemSub: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  whatsappConsultBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 12,
    gap: 10,
  },
  whatsappConsultTextBox: {
    flex: 1,
  },
  whatsappConsultTitle: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  whatsappConsultSub: {
    fontSize: 11,
    marginTop: 1,
  },
});
