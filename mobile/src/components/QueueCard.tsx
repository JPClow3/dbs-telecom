import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SHADOWS, RADIUS } from '../constants/theme';
import { QueueCardData } from '../types';
import { apiService } from '../services/api';
import { useAppTheme } from '../context/ThemeContext';
import { hapticFeedback } from '../utils/haptics';
import { UserCheck, Clock, Users, XCircle, ArrowRight, Headset } from 'lucide-react-native';

interface QueueCardProps {
  queue: QueueCardData;
  clientId: string;
  /** A locally generated queue must be visibly treated as a preview. */
  isDemo?: boolean;
  onCancelQueue?: () => void;
  onAdvanceQueue?: (updated: QueueCardData) => void;
}

export const QueueCard: React.FC<QueueCardProps> = ({
  queue: initialQueue,
  clientId,
  isDemo = false,
  onCancelQueue,
  onAdvanceQueue,
}) => {
  const { colors, isDark } = useAppTheme();
  const [queue, setQueue] = useState<QueueCardData>(initialQueue);
  const [loading, setLoading] = useState(false);

  // ⚡ Sincronização em tempo real via Server-Sent Events (SSE) sem polling
  useEffect(() => {
    const unsubscribe = apiService.subscribeQueueStream(clientId, (data) => {
      const entry = data.entry;
      if (entry) {
        setQueue((prev) => {
          if (prev.position !== entry.position || prev.status !== entry.status) {
            if (entry.status === 'ASSIGNED') {
              hapticFeedback.success();
            } else {
              hapticFeedback.light();
            }
          }
          return entry;
        });
        if (onAdvanceQueue) {
          onAdvanceQueue(entry);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [clientId]);

  const handleAdvance = async () => {
    hapticFeedback.medium();
    setLoading(true);
    try {
      const res = await apiService.advanceQueue(clientId);
      if (res?.entry) {
        setQueue(res.entry);
        if (onAdvanceQueue) onAdvanceQueue(res.entry);
      }
    } catch (e) {
      console.warn('Erro ao avançar fila:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    hapticFeedback.light();
    setLoading(true);
    try {
      await apiService.leaveQueue(clientId);
      setQueue((prev) => ({ ...prev, status: 'CANCELLED' }));
      if (onCancelQueue) onCancelQueue();
    } catch (e) {
      console.warn('Erro ao cancelar fila:', e);
    } finally {
      setLoading(false);
    }
  };

  const isAssigned = queue.status === 'ASSIGNED' || queue.status === 'IN_SERVICE';
  const isCancelled = queue.status === 'CANCELLED';

  if (isCancelled) {
    return (
      <View
        style={[
          styles.cancelledCard,
          {
            backgroundColor: colors.dangerLight,
            borderColor: colors.dangerBorder,
          },
        ]}
      >
        <XCircle size={18} color={colors.dangerDark} strokeWidth={2.2} />
        <Text style={[styles.cancelledText, { color: colors.dangerDark }]}>
          Você saiu da fila de atendimento humano.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.card,
        isAssigned
          ? [
              styles.cardAssigned,
              {
                backgroundColor: colors.successLight,
                borderColor: colors.successBorder,
              },
            ]
          : [
              styles.cardQueued,
              {
                backgroundColor: colors.card,
                borderColor: colors.primaryBorder,
              },
            ],
      ]}
    >
      {/* Header com Status */}
      <View style={styles.headerRow}>
        <View
          style={[
            styles.iconBox,
            isAssigned
              ? [styles.iconBoxAssigned, { backgroundColor: colors.card }]
              : [styles.iconBoxQueued, { backgroundColor: colors.primaryLight }],
          ]}
        >
          {isAssigned ? (
            <Headset size={16} color={colors.successDark} strokeWidth={2.5} />
          ) : (
            <Users size={16} color={colors.primary} strokeWidth={2.5} />
          )}
        </View>
        <View style={styles.headerInfo}>
          <Text
            style={[
              styles.headerTitle,
              isAssigned
                ? { color: colors.successDark }
                : { color: isDark ? '#FFA07A' : colors.primaryDark },
            ]}
          >
            {isAssigned ? 'Atendente Humano Conectado' : 'Fila de Espera Virtual'}
          </Text>
          <Text style={[styles.departmentLabel, { color: colors.textMuted }]}>
            Setor: {queue.department} • Protocolo: {queue.queueId}
          </Text>
        </View>
      </View>

      {isDemo && (
        <View
          style={[styles.demoNotice, { backgroundColor: colors.warningLight, borderColor: colors.warningBorder }]}
          accessibilityLiveRegion="polite"
        >
          <Text style={[styles.demoNoticeText, { color: colors.warningDark }]}>Prévia local: nenhum atendimento foi solicitado.</Text>
        </View>
      )}

      {/* Corpo: Informações de Fila ou Atendente */}
      {!isAssigned ? (
        <View style={styles.queueBody}>
          <View
            style={[
              styles.metricsRow,
              {
                backgroundColor: colors.cardSubdued,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.metricItem}>
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Sua Posição</Text>
              <View style={styles.positionBadge}>
                <Text style={[styles.positionNumber, { color: colors.primary }]}>
                  #{queue.position}
                </Text>
                <Text style={[styles.positionSuffix, { color: colors.textSecondary }]}>lugar</Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.metricItem}>
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Tempo Estimado</Text>
              <View style={styles.timeBadge}>
                <Clock size={14} color={colors.warningDark} strokeWidth={2.2} />
                <Text style={[styles.timeNumber, { color: colors.warningDark }]}>
                  ~{queue.estimatedWaitMinutes} min
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.progressContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.progressText, { color: colors.textMuted }]}>
              {isDemo
                ? 'Esta é uma simulação local; a fila real só aparece após confirmação do servidor.'
                : 'Aguardando atendente disponível. Você será atendido em instantes!'}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.assignedBody}>
          <View
            style={[
              styles.agentCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.successBorder,
              },
            ]}
          >
            <UserCheck size={20} color={colors.successDark} strokeWidth={2.5} />
            <View style={styles.agentInfo}>
              <Text style={[styles.agentName, { color: colors.text }]}>
                {queue.assignedAgent?.name || 'Mariana Souza'}
              </Text>
              <Text style={[styles.agentRole, { color: colors.textSecondary }]}>
                {queue.assignedAgent?.role || 'Especialista em Atendimento DBS'}
              </Text>
            </View>
          </View>
          <Text style={[styles.assignedMessage, { color: colors.textSecondary }]}>
            "Olá! Sou a Mariana da equipe de atendimento da DBS Telecom. Como posso te auxiliar com sua solicitação hoje?"
          </Text>
        </View>
      )}

      {/* Ações */}
      {!isDemo && <View style={styles.actionsRow}>
        {!isAssigned ? (
          <>
            <TouchableOpacity
              style={[
                styles.cancelBtn,
                {
                  backgroundColor: colors.cardSubdued,
                  borderColor: colors.border,
                },
              ]}
              onPress={handleCancel}
              disabled={loading}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Cancelar espera de atendimento"
            >
              <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>
                Cancelar espera
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.advanceBtn, { backgroundColor: colors.primary }]}
              onPress={handleAdvance}
              disabled={loading}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={queue.position > 1 ? 'Simular avanço da fila' : 'Conectar atendente'}
            >
              <Text style={styles.advanceBtnText}>
                {queue.position > 1 ? 'Simular avanço (#1)' : 'Conectar atendente'}
              </Text>
              <ArrowRight size={13} color="#FFFFFF" strokeWidth={2.5} />
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.connectedBtn, { backgroundColor: colors.successDark }]}
            onPress={() => {}}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Atendimento em andamento"
          >
            <Text style={styles.connectedBtnText}>Atendimento em andamento</Text>
          </TouchableOpacity>
        )}
      </View>}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.md,
    padding: 13,
    marginTop: 8,
    ...SHADOWS.md,
  },
  demoNotice: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    padding: 9,
    marginTop: 10,
  },
  demoNoticeText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  cardQueued: {
    borderWidth: 1.5,
  },
  cardAssigned: {
    borderWidth: 1.5,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxQueued: {},
  iconBoxAssigned: {},
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  departmentLabel: {
    fontSize: 10.5,
    marginTop: 1,
  },
  queueBody: {
    marginTop: 10,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: RADIUS.sm,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
  },
  metricItem: {
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  positionBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  positionNumber: {
    fontSize: 18,
    fontWeight: '900',
  },
  positionSuffix: {
    fontSize: 11,
    fontWeight: '700',
  },
  divider: {
    width: 1,
    height: 30,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeNumber: {
    fontSize: 14,
    fontWeight: '800',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 4,
  },
  progressText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
  },
  assignedBody: {
    marginTop: 10,
  },
  agentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  agentInfo: {
    flex: 1,
  },
  agentName: {
    fontSize: 13,
    fontWeight: '800',
  },
  agentRole: {
    fontSize: 11,
    marginTop: 1,
  },
  assignedMessage: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  advanceBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    ...SHADOWS.primary,
  },
  advanceBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  connectedBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    alignItems: 'center',
  },
  connectedBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cancelledCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 10,
    marginTop: 8,
  },
  cancelledText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
