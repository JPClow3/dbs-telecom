import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { SHADOWS, RADIUS } from '../constants/theme';
import { InvoiceCard } from '../components/InvoiceCard';
import { SkeletonInvoiceCard } from '../components/Skeleton';
import { Toast, ToastType } from '../components/Toast';
import { apiService } from '../services/api';
import { useAppTheme } from '../context/ThemeContext';
import { hapticFeedback } from '../utils/haptics';
import { Customer, FormattedInvoice } from '../types';
import {
  Calendar,
  CheckCircle2,
  MessageSquare,
  ArrowRight,
  QrCode,
} from 'lucide-react-native';

interface InvoicesScreenProps {
  customer: Customer;
  onNavigateToChat?: () => void;
}

export const InvoicesScreen: React.FC<InvoicesScreenProps> = ({ customer, onNavigateToChat }) => {
  const { colors, isDark } = useAppTheme();
  const [invoices, setInvoices] = useState<FormattedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toastInfo, setToastInfo] = useState<{ message: string; type: ToastType } | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'PAID'>('ALL');

  const fetchInvoices = async () => {
    try {
      const data = await apiService.getInvoices(customer.id);
      setInvoices(data);
    } catch (e) {
      console.warn('Erro ao carregar faturas:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [customer]);

  const showToast = (message: string, type: ToastType = 'SUCCESS') => {
    setToastInfo({ message, type });
  };

  const handleCopy = (text: string, label: string) => {
    hapticFeedback.success();
    if (Platform.OS === 'web') {
      try {
        navigator.clipboard.writeText(text);
        showToast(`${label} copiado para a área de transferência!`);
      } catch (e) {
        showToast(`${label} copiado!`);
      }
    } else {
      showToast(`${label} copiado!`);
    }
  };

  const handleFilterChange = (newFilter: 'ALL' | 'PENDING' | 'PAID') => {
    hapticFeedback.selection();
    setFilter(newFilter);
  };

  // Métricas financeiras
  const pendingInvoices = invoices.filter((i) => i.status === 'PENDENTE' || i.status === 'VENCIDO');
  const paidInvoices = invoices.filter((i) => i.status === 'PAGO');
  const totalOpenAmount = pendingInvoices.reduce((acc, curr) => acc + curr.valor, 0);
  const nextDueDate = pendingInvoices.length > 0 ? pendingInvoices[0].dataVencimentoFormatada : 'Todas em dia';

  // Faturas Filtradas
  const filteredInvoices = invoices.filter((i) => {
    if (filter === 'PENDING') return i.status === 'PENDENTE' || i.status === 'VENCIDO';
    if (filter === 'PAID') return i.status === 'PAGO';
    return true;
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Toast Flutuante de Notificação */}
      {toastInfo && (
        <Toast
          message={toastInfo.message}
          type={toastInfo.type}
          onDismiss={() => setToastInfo(null)}
        />
      )}

      {/* Banner de Saldo e Resumo Financeiro */}
      <View
        style={[
          styles.balanceCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.balanceHeader}>
          <Text style={[styles.balanceTitle, { color: colors.secondary }]}>
            Central Financeira DBS
          </Text>
          <View
            style={[
              styles.accountStatusPill,
              {
                backgroundColor: colors.successLight,
              },
            ]}
          >
            <CheckCircle2 size={11} color={colors.successDark} strokeWidth={2.5} />
            <Text style={[styles.accountStatusText, { color: colors.successDark }]}>Conta Ativa</Text>
          </View>
        </View>

        <View style={styles.balanceRow}>
          <View style={styles.balanceCol}>
            <Text style={[styles.balanceLabel, { color: colors.textMuted }]}>TOTAL EM ABERTO</Text>
            <Text style={[styles.balanceAmount, { color: colors.primary }]}>
              {totalOpenAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </Text>
          </View>

          <View style={styles.dueCol}>
            <Text style={[styles.balanceLabel, { color: colors.textMuted }]}>PRÓXIMO VENCIMENTO</Text>
            <View style={styles.dueSubRow}>
              <Calendar size={13} color={colors.textMuted} strokeWidth={2} />
              <Text style={[styles.dueValText, { color: colors.text }]}>{nextDueDate}</Text>
            </View>
          </View>
        </View>

        {pendingInvoices.length > 0 && (
          <TouchableOpacity
            style={[styles.quickPixBtn, { backgroundColor: colors.primary }]}
            onPress={() => handleCopy(pendingInvoices[0].pixCopiaECola, 'PIX da Fatura Atual')}
            activeOpacity={0.8}
          >
            <QrCode size={15} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={styles.quickPixBtnText}>Copiar Chave PIX da Próxima Fatura</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Abas de Filtro */}
      <View
        style={[
          styles.filterTabs,
          {
            backgroundColor: colors.cardSubdued,
            borderColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.filterTab,
            filter === 'ALL' && [styles.filterTabActive, { backgroundColor: colors.card }],
          ]}
          onPress={() => handleFilterChange('ALL')}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.filterTabText,
              { color: colors.textMuted },
              filter === 'ALL' && { color: colors.primary, fontWeight: '800' },
            ]}
          >
            Todas ({invoices.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterTab,
            filter === 'PENDING' && [styles.filterTabActive, { backgroundColor: colors.card }],
          ]}
          onPress={() => handleFilterChange('PENDING')}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.filterTabText,
              { color: colors.textMuted },
              filter === 'PENDING' && { color: colors.primary, fontWeight: '800' },
            ]}
          >
            Em Aberto ({pendingInvoices.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterTab,
            filter === 'PAID' && [styles.filterTabActive, { backgroundColor: colors.card }],
          ]}
          onPress={() => handleFilterChange('PAID')}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.filterTabText,
              { color: colors.textMuted },
              filter === 'PAID' && { color: colors.primary, fontWeight: '800' },
            ]}
          >
            Pagas ({paidInvoices.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Carregamento com Skeleton Shimmer ou Lista de Faturas */}
      {loading ? (
        <View style={styles.skeletonContainer}>
          <SkeletonInvoiceCard />
          <SkeletonInvoiceCard />
          <SkeletonInvoiceCard />
        </View>
      ) : (
        <FlatList
          data={filteredInvoices}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <InvoiceCard invoice={item} onCopy={handleCopy} />}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                hapticFeedback.light();
                setRefreshing(true);
                fetchInvoices();
              }}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          ListFooterComponent={
            onNavigateToChat ? (
              <TouchableOpacity
                style={[
                  styles.chatHelpBox,
                  {
                    backgroundColor: colors.primaryUltraLight,
                    borderColor: colors.primaryBorder,
                  },
                ]}
                onPress={() => {
                  hapticFeedback.medium();
                  onNavigateToChat();
                }}
                activeOpacity={0.8}
              >
                <View style={[styles.chatHelpIcon, { backgroundColor: colors.primaryLight }]}>
                  <MessageSquare size={18} color={colors.primary} strokeWidth={2.2} />
                </View>
                <View style={styles.chatHelpContent}>
                  <Text style={[styles.chatHelpTitle, { color: isDark ? '#FFA07A' : colors.primaryDark }]}>
                    Dúvidas sobre faturas ou comprovantes?
                  </Text>
                  <Text style={[styles.chatHelpSub, { color: colors.textMuted }]}>
                    Fale com o assistente virtual da DBS Telecom
                  </Text>
                </View>
                <ArrowRight size={16} color={colors.primary} strokeWidth={2.5} />
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconBox, { backgroundColor: colors.successLight }]}>
                <CheckCircle2 size={36} color={colors.successDark} strokeWidth={2} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.secondary }]}>Tudo em Dia!</Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                Você não possui faturas nesta categoria. Obrigado por ser cliente DBS Telecom!
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
  balanceCard: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    ...SHADOWS.md,
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  balanceTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  accountStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  accountStatusText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  balanceCol: {},
  dueCol: {
    alignItems: 'flex-end',
  },
  balanceLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  balanceAmount: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  dueSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  dueValText: {
    fontSize: 13,
    fontWeight: '700',
  },
  quickPixBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
    marginTop: 14,
    ...SHADOWS.primary,
  },
  quickPixBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12.5,
  },
  filterTabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    borderRadius: RADIUS.md,
    padding: 3,
    marginVertical: 6,
    borderWidth: 1,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: RADIUS.sm,
  },
  filterTabActive: {
    ...SHADOWS.sm,
  },
  filterTabText: {
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
  chatHelpBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 14,
    marginTop: 14,
    gap: 12,
  },
  chatHelpIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatHelpContent: {
    flex: 1,
  },
  chatHelpTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  chatHelpSub: {
    fontSize: 11,
    marginTop: 2,
  },
});
