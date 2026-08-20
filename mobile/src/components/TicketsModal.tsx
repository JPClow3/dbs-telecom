import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { SHADOWS, RADIUS } from '../constants/theme';
import { useAppTheme } from '../context/ThemeContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { hapticFeedback } from '../utils/haptics';
import { TicketRecord } from '../types';
import { apiService } from '../services/api';
import {
  X,
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  Truck,
  User,
  Copy,
  Check,
  Calendar,
  MessageSquare,
  Wrench,
} from 'lucide-react-native';

interface TicketsModalProps {
  visible: boolean;
  clientId: string;
  onClose: () => void;
  onNavigateToChat?: (protocol?: string) => void;
  onShowToast?: (message: string) => void;
}

export const TicketsModal: React.FC<TicketsModalProps> = ({
  visible,
  clientId,
  onClose,
  onNavigateToChat,
  onShowToast,
}) => {
  const { colors, isDark } = useAppTheme();
  const { isConnected, isInternetReachable } = useNetworkStatus();
  const isNetworkOnline = isConnected && isInternetReachable !== false;
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'DONE'>('ALL');
  const [copiedProtocol, setCopiedProtocol] = useState<string | null>(null);

  const fetchTickets = async () => {
    setLoadError(false);
    try {
      const data = await apiService.getClientTickets(clientId);
      setTickets(data);
    } catch (e) {
      console.warn('Erro ao carregar chamados:', e);
      setTickets([]);
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (visible) {
      setLoading(true);
      fetchTickets();
    }
  }, [visible, clientId]);

  const handleCopy = (protocol: string) => {
    hapticFeedback.success();
    if (Platform.OS === 'web') {
      try {
        navigator.clipboard.writeText(protocol);
        onShowToast?.(`Protocolo ${protocol} copiado!`);
      } catch (e) {
        onShowToast?.(`Protocolo ${protocol} copiado!`);
      }
    } else {
      onShowToast?.(`Protocolo ${protocol} copiado!`);
    }
    setCopiedProtocol(protocol);
    setTimeout(() => setCopiedProtocol(null), 2500);
  };

  const handleFilterChange = (newFilter: 'ALL' | 'ACTIVE' | 'DONE') => {
    hapticFeedback.selection();
    setFilter(newFilter);
  };

  const filteredTickets = tickets.filter((t) => {
    const isDone = t.status === 'C' || t.status === 'F' || t.statusLabel === 'Concluído';
    if (filter === 'ACTIVE') return !isDone;
    if (filter === 'DONE') return isDone;
    return true;
  });

  const getStatusBadge = (ticket: TicketRecord) => {
    const status = ticket.status;
    const label = ticket.statusLabel || 'Aberto';

    if (status === 'C' || status === 'F' || label === 'Concluído') {
      return (
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: colors.successLight,
              borderColor: colors.successBorder,
            },
          ]}
        >
          <CheckCircle2 size={11} color={colors.successDark} strokeWidth={2.5} />
          <Text style={[styles.statusText, { color: colors.successDark }]}>Concluído</Text>
        </View>
      );
    }

    if (status === 'EC' || label.includes('Caminho')) {
      return (
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: colors.primaryUltraLight,
              borderColor: colors.primaryBorder,
            },
          ]}
        >
          <Truck size={11} color={isDark ? '#FFA07A' : colors.primaryDark} strokeWidth={2.5} />
          <Text style={[styles.statusText, { color: isDark ? '#FFA07A' : colors.primaryDark }]}>
            Técnico a Caminho
          </Text>
        </View>
      );
    }

    if (status === 'AN' || label.includes('Análise') || label.includes('Analise')) {
      return (
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: colors.infoLight,
              borderColor: colors.infoBorder,
            },
          ]}
        >
          <Clock size={11} color={colors.infoDark} strokeWidth={2.5} />
          <Text style={[styles.statusText, { color: colors.infoDark }]}>Em Análise</Text>
        </View>
      );
    }

    return (
      <View
        style={[
          styles.statusBadge,
          {
            backgroundColor: colors.warningLight,
            borderColor: colors.warningBorder,
          },
        ]}
      >
        <AlertCircle size={11} color={colors.warningDark} strokeWidth={2.5} />
        <Text style={[styles.statusText, { color: colors.warningDark }]}>{label}</Text>
      </View>
    );
  };

  const renderTicketCard = ({ item }: { item: TicketRecord }) => {
    return (
      <View
        style={[
          styles.ticketCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        {/* Header do Card com Assunto e Status */}
        <View style={[styles.cardHeader, { borderBottomColor: colors.borderLight }]}>
          <View style={styles.subjectBox}>
            <View style={[styles.ticketIcon, { backgroundColor: colors.primaryLight }]}>
              <Wrench size={16} color={colors.primary} strokeWidth={2.2} />
            </View>
            <View style={styles.subjectContent}>
              <Text style={[styles.subjectText, { color: colors.secondary }]}>{item.assunto}</Text>
              <Text style={[styles.protocolText, { color: colors.textMuted }]}>
                Protocolo: #{item.protocolo || item.id}
              </Text>
            </View>
          </View>
          {getStatusBadge(item)}
        </View>

        {/* Mensagem / Descrição */}
        <Text style={[styles.descText, { color: colors.textSecondary }]}>{item.mensagem}</Text>

        {/* Informações do Técnico e Previsão */}
        {(item.nome_tecnico || item.previsao_visita) && (
          <View
            style={[
              styles.techInfoGrid,
              {
                backgroundColor: colors.cardSubdued,
                borderColor: colors.border,
              },
            ]}
          >
            {item.nome_tecnico && (
              <View style={styles.techItem}>
                <User size={13} color={colors.textMuted} strokeWidth={2} />
                <Text style={[styles.techItemText, { color: colors.text }]}>
                  Técnico: {item.nome_tecnico}
                </Text>
              </View>
            )}
            {item.previsao_visita && (
              <View style={styles.techItem}>
                <Calendar size={13} color={isDark ? '#FFA07A' : colors.primaryDark} strokeWidth={2} />
                <Text
                  style={[
                    styles.techItemText,
                    { color: isDark ? '#FFA07A' : colors.primaryDark, fontWeight: '700' },
                  ]}
                >
                  Previsão: {item.previsao_visita}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Timeline de Etapas */}
        {item.etapas && item.etapas.length > 0 && (
          <View style={[styles.timelineSection, { borderTopColor: colors.borderLight }]}>
            <Text style={[styles.timelineTitle, { color: colors.textMuted }]}>
              ETAPAS DO ATENDIMENTO
            </Text>
            <View style={styles.timelineList}>
              {item.etapas.map((step, idx) => {
                const isLast = idx === item.etapas!.length - 1;
                return (
                  <View key={idx} style={styles.timelineRow}>
                    <View style={styles.timelineIndicatorCol}>
                      <View
                        style={[
                          styles.timelineDot,
                          step.concluido
                            ? { backgroundColor: colors.success }
                            : {
                                backgroundColor: colors.cardSubdued,
                                borderColor: colors.borderDark,
                                borderWidth: 1.5,
                              },
                        ]}
                      >
                        {step.concluido ? (
                          <Check size={9} color="#FFFFFF" strokeWidth={3} />
                        ) : (
                          <View
                            style={[
                              styles.innerDotPending,
                              { backgroundColor: colors.textMuted },
                            ]}
                          />
                        )}
                      </View>
                      {!isLast && (
                        <View
                          style={[
                            styles.timelineLine,
                            {
                              backgroundColor: step.concluido
                                ? colors.success
                                : colors.border,
                            },
                          ]}
                        />
                      )}
                    </View>

                    <View style={styles.timelineContentCol}>
                      <View style={styles.timelineHeaderRow}>
                        <Text
                          style={[
                            styles.stepTitle,
                            { color: colors.textMuted },
                            step.concluido && { color: colors.secondary, fontWeight: '800' },
                          ]}
                        >
                          {step.titulo}
                        </Text>
                        {step.dataHora && (
                          <Text style={[styles.stepTimeText, { color: colors.textSubtle }]}>
                            {step.dataHora}
                          </Text>
                        )}
                      </View>
                      <Text style={[styles.stepDescText, { color: colors.textMuted }]}>
                        {step.descricao}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Botões de Ação */}
        <View style={[styles.actionsRow, { borderTopColor: colors.borderLight }]}>
          <TouchableOpacity
            style={[
              styles.copyBtn,
              {
                backgroundColor: colors.cardSubdued,
                borderColor: colors.border,
              },
            ]}
            onPress={() => handleCopy(item.protocolo || item.id || '')}
            disabled={!isNetworkOnline}
            activeOpacity={0.75}
          >
            {copiedProtocol === (item.protocolo || item.id) ? (
              <>
                <Check size={13} color={colors.successDark} strokeWidth={2.5} />
                <Text style={[styles.copyBtnTextSuccess, { color: colors.successDark }]}>
                  Copiado!
                </Text>
              </>
            ) : (
              <>
                <Copy size={13} color={colors.textSecondary} strokeWidth={2.2} />
                <Text style={[styles.copyBtnText, { color: colors.textSecondary }]}>
                  {isNetworkOnline ? 'Copiar Protocolo' : 'Disponível após reconectar'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {onNavigateToChat && (
            <TouchableOpacity
              style={[styles.chatBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                hapticFeedback.medium();
                onClose();
                onNavigateToChat(item.protocolo || item.id);
              }}
              activeOpacity={0.75}
            >
              <MessageSquare size={13} color="#FFFFFF" strokeWidth={2.2} />
              <Text style={styles.chatBtnText}>Falar no Chat</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header Modal */}
        <View
          style={[
            styles.header,
            {
              backgroundColor: colors.card,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <View style={styles.headerTitleGroup}>
            <ShieldCheck size={20} color={colors.primary} strokeWidth={2.2} />
            <Text style={[styles.headerTitle, { color: colors.secondary }]}>
              Central de Chamados (O.S.)
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: colors.cardSubdued }]}
            onPress={() => {
              hapticFeedback.light();
              onClose();
            }}
            activeOpacity={0.7}
            testID="close-tickets-modal-btn"
            accessibilityRole="button"
          >
            <X size={20} color={colors.secondary} strokeWidth={2.5} />
          </TouchableOpacity>
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
              Todos ({tickets.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterTab,
              filter === 'ACTIVE' && [styles.filterTabActive, { backgroundColor: colors.card }],
            ]}
            onPress={() => handleFilterChange('ACTIVE')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterTabText,
                { color: colors.textMuted },
                filter === 'ACTIVE' && { color: colors.primary, fontWeight: '800' },
              ]}
            >
              Em Andamento (
              {
                tickets.filter(
                  (t) => t.status !== 'C' && t.status !== 'F' && t.statusLabel !== 'Concluído'
                ).length
              }
              )
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterTab,
              filter === 'DONE' && [styles.filterTabActive, { backgroundColor: colors.card }],
            ]}
            onPress={() => handleFilterChange('DONE')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterTabText,
                { color: colors.textMuted },
                filter === 'DONE' && { color: colors.primary, fontWeight: '800' },
              ]}
            >
              Concluídos (
              {
                tickets.filter(
                  (t) => t.status === 'C' || t.status === 'F' || t.statusLabel === 'Concluído'
                ).length
              }
              )
            </Text>
          </TouchableOpacity>
        </View>

        {(loadError || !isNetworkOnline) && (
          <View
            style={[styles.statusNotice, { backgroundColor: colors.warningLight, borderColor: colors.warningBorder }]}
            accessibilityLiveRegion="polite"
          >
            <Text style={[styles.statusNoticeText, { color: colors.warningDark }]}>
              {loadError
                ? 'Não foi possível consultar os chamados no servidor.'
                : 'Você está offline. Chamados locais são apenas uma prévia.'}
            </Text>
            <TouchableOpacity
              style={[styles.retryButton, { borderColor: colors.warningDark }]}
              onPress={fetchTickets}
              accessibilityRole="button"
              accessibilityLabel="Tentar consultar chamados novamente"
            >
              <Text style={[styles.retryButtonText, { color: colors.warningDark }]}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>
              Consultando Ordens de Serviço no sistema IXC...
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredTickets}
            keyExtractor={(item, index) => item.protocolo || item.id || `tkt-${index}`}
            renderItem={renderTicketCard}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  hapticFeedback.light();
                  setRefreshing(true);
                  fetchTickets();
                }}
                colors={[colors.primary]}
                tintColor={colors.primary}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={[styles.emptyIconBox, { backgroundColor: colors.successLight }]}>
                  <CheckCircle2 size={36} color={colors.successDark} strokeWidth={2} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.secondary }]}>
                  Nenhum Chamado Encontrado
                </Text>
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  Não existem Ordens de Serviço nesta categoria. Se estiver enfrentando problemas com sua conexão, inicie um teste no chat de atendimento.
                </Text>
              </View>
            }
          />
        )}
      </View>
    </Modal>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    ...SHADOWS.sm,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    borderRadius: RADIUS.md,
    padding: 3,
    marginVertical: 10,
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
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 30,
  },
  ticketCard: {
    borderRadius: RADIUS.lg,
    padding: 16,
    marginVertical: 6,
    borderWidth: 1,
    ...SHADOWS.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  subjectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  ticketIcon: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectContent: {
    flex: 1,
  },
  subjectText: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  protocolText: {
    fontSize: 11,
    marginTop: 1,
    fontFamily: 'monospace',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  descText: {
    fontSize: 12,
    marginTop: 10,
    lineHeight: 17,
  },
  techInfoGrid: {
    padding: 10,
    borderRadius: RADIUS.sm,
    marginTop: 10,
    gap: 6,
    borderWidth: 1,
  },
  techItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  techItemText: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  timelineSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  timelineTitle: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  timelineList: {
    gap: 0,
  },
  timelineRow: {
    flexDirection: 'row',
    minHeight: 38,
  },
  timelineIndicatorCol: {
    width: 20,
    alignItems: 'center',
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  innerDotPending: {
    width: 4,
    height: 4,
    borderRadius: RADIUS.full,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginVertical: 2,
  },
  timelineContentCol: {
    flex: 1,
    paddingLeft: 8,
    paddingBottom: 8,
  },
  timelineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepTitle: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  stepTimeText: {
    fontSize: 10,
  },
  stepDescText: {
    fontSize: 10.5,
    marginTop: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  copyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    paddingVertical: 9,
    borderRadius: RADIUS.sm,
  },
  copyBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  copyBtnTextSuccess: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  chatBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: RADIUS.sm,
  },
  chatBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
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
