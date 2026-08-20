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
import { COLORS, SHADOWS, RADIUS } from '../constants/theme';
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
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'DONE'>('ALL');
  const [copiedProtocol, setCopiedProtocol] = useState<string | null>(null);

  const fetchTickets = async () => {
    try {
      const data = await apiService.getClientTickets(clientId);
      setTickets(data);
    } catch (e) {
      console.warn('Erro ao carregar chamados:', e);
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
        <View style={[styles.statusBadge, styles.statusBadgeDone]}>
          <CheckCircle2 size={11} color={COLORS.successDark} strokeWidth={2.5} />
          <Text style={styles.statusTextDone}>Concluído</Text>
        </View>
      );
    }

    if (status === 'EC' || label.includes('Caminho')) {
      return (
        <View style={[styles.statusBadge, styles.statusBadgeEnRoute]}>
          <Truck size={11} color={COLORS.primaryDark} strokeWidth={2.5} />
          <Text style={styles.statusTextEnRoute}>Técnico a Caminho</Text>
        </View>
      );
    }

    if (status === 'AN' || label.includes('Análise') || label.includes('Analise')) {
      return (
        <View style={[styles.statusBadge, styles.statusBadgeAnalysis]}>
          <Clock size={11} color={COLORS.infoDark} strokeWidth={2.5} />
          <Text style={styles.statusTextAnalysis}>Em Análise</Text>
        </View>
      );
    }

    return (
      <View style={[styles.statusBadge, styles.statusBadgeOpen]}>
        <AlertCircle size={11} color={COLORS.warningDark} strokeWidth={2.5} />
        <Text style={styles.statusTextOpen}>{label}</Text>
      </View>
    );
  };

  const renderTicketCard = ({ item }: { item: TicketRecord }) => {
    return (
      <View style={styles.ticketCard}>
        {/* Header do Card com Assunto e Status */}
        <View style={styles.cardHeader}>
          <View style={styles.subjectBox}>
            <View style={styles.ticketIcon}>
              <Wrench size={16} color={COLORS.primary} strokeWidth={2.2} />
            </View>
            <View style={styles.subjectContent}>
              <Text style={styles.subjectText}>{item.assunto}</Text>
              <Text style={styles.protocolText}>Protocolo: #{item.protocolo || item.id}</Text>
            </View>
          </View>
          {getStatusBadge(item)}
        </View>

        {/* Mensagem / Descrição */}
        <Text style={styles.descText}>{item.mensagem}</Text>

        {/* Informações do Técnico e Previsão */}
        {(item.nome_tecnico || item.previsao_visita) && (
          <View style={styles.techInfoGrid}>
            {item.nome_tecnico && (
              <View style={styles.techItem}>
                <User size={13} color={COLORS.textMuted} strokeWidth={2} />
                <Text style={styles.techItemText}>Técnico: {item.nome_tecnico}</Text>
              </View>
            )}
            {item.previsao_visita && (
              <View style={styles.techItem}>
                <Calendar size={13} color={COLORS.primaryDark} strokeWidth={2} />
                <Text style={[styles.techItemText, { color: COLORS.primaryDark, fontWeight: '700' }]}>
                  Previsão: {item.previsao_visita}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Timeline de Etapas */}
        {item.etapas && item.etapas.length > 0 && (
          <View style={styles.timelineSection}>
            <Text style={styles.timelineTitle}>ETAPAS DO ATENDIMENTO</Text>
            <View style={styles.timelineList}>
              {item.etapas.map((step, idx) => {
                const isLast = idx === item.etapas!.length - 1;
                return (
                  <View key={idx} style={styles.timelineRow}>
                    <View style={styles.timelineIndicatorCol}>
                      <View
                        style={[
                          styles.timelineDot,
                          step.concluido ? styles.timelineDotDone : styles.timelineDotPending,
                        ]}
                      >
                        {step.concluido ? (
                          <Check size={9} color={COLORS.white} strokeWidth={3} />
                        ) : (
                          <View style={styles.innerDotPending} />
                        )}
                      </View>
                      {!isLast && (
                        <View
                          style={[
                            styles.timelineLine,
                            step.concluido ? styles.timelineLineDone : styles.timelineLinePending,
                          ]}
                        />
                      )}
                    </View>

                    <View style={styles.timelineContentCol}>
                      <View style={styles.timelineHeaderRow}>
                        <Text
                          style={[
                            styles.stepTitle,
                            step.concluido && styles.stepTitleDone,
                          ]}
                        >
                          {step.titulo}
                        </Text>
                        {step.dataHora && (
                          <Text style={styles.stepTimeText}>{step.dataHora}</Text>
                        )}
                      </View>
                      <Text style={styles.stepDescText}>{step.descricao}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Botões de Ação */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.copyBtn}
            onPress={() => handleCopy(item.protocolo || item.id || '')}
            activeOpacity={0.75}
          >
            {copiedProtocol === (item.protocolo || item.id) ? (
              <>
                <Check size={13} color={COLORS.successDark} strokeWidth={2.5} />
                <Text style={styles.copyBtnTextSuccess}>Copiado!</Text>
              </>
            ) : (
              <>
                <Copy size={13} color={COLORS.textSecondary} strokeWidth={2.2} />
                <Text style={styles.copyBtnText}>Copiar Protocolo</Text>
              </>
            )}
          </TouchableOpacity>

          {onNavigateToChat && (
            <TouchableOpacity
              style={styles.chatBtn}
              onPress={() => {
                onClose();
                onNavigateToChat(item.protocolo || item.id);
              }}
              activeOpacity={0.75}
            >
              <MessageSquare size={13} color={COLORS.white} strokeWidth={2.2} />
              <Text style={styles.chatBtnText}>Falar no Chat</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header Modal */}
        <View style={styles.header}>
          <View style={styles.headerTitleGroup}>
            <ShieldCheck size={20} color={COLORS.primary} strokeWidth={2.2} />
            <Text style={styles.headerTitle}>Central de Chamados (O.S.)</Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <X size={20} color={COLORS.secondary} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        {/* Abas de Filtro */}
        <View style={styles.filterTabs}>
          <TouchableOpacity
            style={[styles.filterTab, filter === 'ALL' && styles.filterTabActive]}
            onPress={() => setFilter('ALL')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterTabText, filter === 'ALL' && styles.filterTabTextActive]}>
              Todos ({tickets.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, filter === 'ACTIVE' && styles.filterTabActive]}
            onPress={() => setFilter('ACTIVE')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterTabText, filter === 'ACTIVE' && styles.filterTabTextActive]}>
              Em Andamento ({tickets.filter((t) => t.status !== 'C' && t.status !== 'F' && t.statusLabel !== 'Concluído').length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, filter === 'DONE' && styles.filterTabActive]}
            onPress={() => setFilter('DONE')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterTabText, filter === 'DONE' && styles.filterTabTextActive]}>
              Concluídos ({tickets.filter((t) => t.status === 'C' || t.status === 'F' || t.statusLabel === 'Concluído').length})
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Consultando Ordens de Serviço no sistema IXC...</Text>
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
                  setRefreshing(true);
                  fetchTickets();
                }}
                colors={[COLORS.primary]}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconBox}>
                  <CheckCircle2 size={36} color={COLORS.successDark} strokeWidth={2} />
                </View>
                <Text style={styles.emptyTitle}>Nenhum Chamado Encontrado</Text>
                <Text style={styles.emptyText}>
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
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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
    color: COLORS.secondary,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.cardSubdued,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: COLORS.cardSubdued,
    borderRadius: RADIUS.md,
    padding: 3,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: RADIUS.sm,
  },
  filterTabActive: {
    backgroundColor: COLORS.white,
    ...SHADOWS.sm,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  filterTabTextActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 30,
  },
  ticketCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
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
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectContent: {
    flex: 1,
  },
  subjectText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  protocolText: {
    fontSize: 11,
    color: COLORS.textMuted,
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
  statusBadgeDone: {
    backgroundColor: COLORS.successLight,
    borderColor: COLORS.successBorder,
  },
  statusBadgeEnRoute: {
    backgroundColor: COLORS.primaryUltraLight,
    borderColor: COLORS.primaryBorder,
  },
  statusBadgeAnalysis: {
    backgroundColor: COLORS.infoLight,
    borderColor: COLORS.infoBorder,
  },
  statusBadgeOpen: {
    backgroundColor: COLORS.warningLight,
    borderColor: COLORS.warningBorder,
  },
  statusTextDone: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.successDark,
  },
  statusTextEnRoute: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primaryDark,
  },
  statusTextAnalysis: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.infoDark,
  },
  statusTextOpen: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.warningDark,
  },
  descText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 10,
    lineHeight: 17,
  },
  techInfoGrid: {
    backgroundColor: COLORS.cardSubdued,
    padding: 10,
    borderRadius: RADIUS.sm,
    marginTop: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  techItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  techItemText: {
    fontSize: 11.5,
    color: COLORS.text,
    fontWeight: '500',
  },
  timelineSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  timelineTitle: {
    fontSize: 9.5,
    fontWeight: '800',
    color: COLORS.textMuted,
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
  timelineDotDone: {
    backgroundColor: COLORS.success,
  },
  timelineDotPending: {
    backgroundColor: COLORS.cardSubdued,
    borderWidth: 1.5,
    borderColor: COLORS.borderDark,
  },
  innerDotPending: {
    width: 4,
    height: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.textMuted,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginVertical: 2,
  },
  timelineLineDone: {
    backgroundColor: COLORS.success,
  },
  timelineLinePending: {
    backgroundColor: COLORS.border,
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
    color: COLORS.textMuted,
  },
  stepTitleDone: {
    color: COLORS.secondary,
    fontWeight: '800',
  },
  stepTimeText: {
    fontSize: 10,
    color: COLORS.textSubtle,
  },
  stepDescText: {
    fontSize: 10.5,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  copyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.cardSubdued,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 9,
    borderRadius: RADIUS.sm,
  },
  copyBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  copyBtnTextSuccess: {
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.successDark,
  },
  chatBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingVertical: 9,
    borderRadius: RADIUS.sm,
  },
  chatBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: COLORS.white,
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
    color: COLORS.textMuted,
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
    backgroundColor: COLORS.successLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});
