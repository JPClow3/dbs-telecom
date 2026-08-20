import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { COLORS, SHADOWS, RADIUS } from '../constants/theme';
import { QueueCardData } from '../types';
import { apiService } from '../services/api';
import { UserCheck, Clock, Users, XCircle, ArrowRight, Headset } from 'lucide-react-native';

interface QueueCardProps {
  queue: QueueCardData;
  clientId: string;
  onCancelQueue?: () => void;
  onAdvanceQueue?: (updated: QueueCardData) => void;
}

export const QueueCard: React.FC<QueueCardProps> = ({
  queue: initialQueue,
  clientId,
  onCancelQueue,
  onAdvanceQueue,
}) => {
  const [queue, setQueue] = useState<QueueCardData>(initialQueue);
  const [loading, setLoading] = useState(false);

  const handleAdvance = async () => {
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
      <View style={styles.cancelledCard}>
        <XCircle size={18} color={COLORS.dangerDark} strokeWidth={2.2} />
        <Text style={styles.cancelledText}>Você saiu da fila de atendimento humano.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, isAssigned ? styles.cardAssigned : styles.cardQueued]}>
      {/* Header com Status */}
      <View style={styles.headerRow}>
        <View style={[styles.iconBox, isAssigned ? styles.iconBoxAssigned : styles.iconBoxQueued]}>
          {isAssigned ? (
            <Headset size={16} color={COLORS.successDark} strokeWidth={2.5} />
          ) : (
            <Users size={16} color={COLORS.primary} strokeWidth={2.5} />
          )}
        </View>
        <View style={styles.headerInfo}>
          <Text style={[styles.headerTitle, isAssigned ? styles.titleAssigned : styles.titleQueued]}>
            {isAssigned ? 'Atendente Humano Conectado' : 'Fila de Espera Virtual'}
          </Text>
          <Text style={styles.departmentLabel}>
            Setor: {queue.department} • Protocolo: {queue.queueId}
          </Text>
        </View>
      </View>

      {/* Corpo: Informações de Fila ou Atendente */}
      {!isAssigned ? (
        <View style={styles.queueBody}>
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Sua Posição</Text>
              <View style={styles.positionBadge}>
                <Text style={styles.positionNumber}>#{queue.position}</Text>
                <Text style={styles.positionSuffix}>lugar</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Tempo Estimado</Text>
              <View style={styles.timeBadge}>
                <Clock size={14} color={COLORS.warningDark} strokeWidth={2.2} />
                <Text style={styles.timeNumber}>~{queue.estimatedWaitMinutes} min</Text>
              </View>
            </View>
          </View>

          <View style={styles.progressContainer}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.progressText}>
              Aguardando atendente disponível. Você será atendido em instantes!
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.assignedBody}>
          <View style={styles.agentCard}>
            <UserCheck size={20} color={COLORS.successDark} strokeWidth={2.5} />
            <View style={styles.agentInfo}>
              <Text style={styles.agentName}>{queue.assignedAgent?.name || 'Mariana Souza'}</Text>
              <Text style={styles.agentRole}>
                {queue.assignedAgent?.role || 'Especialista em Atendimento DBS'}
              </Text>
            </View>
          </View>
          <Text style={styles.assignedMessage}>
            "Olá! Sou a Mariana da equipe de atendimento da DBS Telecom. Como posso te auxiliar com sua solicitação hoje?"
          </Text>
        </View>
      )}

      {/* Ações */}
      <View style={styles.actionsRow}>
        {!isAssigned ? (
          <>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleCancel}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelBtnText}>Cancelar espera</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.advanceBtn}
              onPress={handleAdvance}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.advanceBtnText}>
                {queue.position > 1 ? 'Simular avanço (#1)' : 'Conectar atendente'}
              </Text>
              <ArrowRight size={13} color={COLORS.white} strokeWidth={2.5} />
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={styles.connectedBtn}
            onPress={() => {}}
            activeOpacity={0.9}
          >
            <Text style={styles.connectedBtnText}>Atendimento em andamento</Text>
          </TouchableOpacity>
        )}
      </View>
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
  cardQueued: {
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.primaryBorder,
  },
  cardAssigned: {
    backgroundColor: COLORS.successLight,
    borderWidth: 1.5,
    borderColor: COLORS.successBorder,
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
  iconBoxQueued: {
    backgroundColor: COLORS.primaryLight,
  },
  iconBoxAssigned: {
    backgroundColor: COLORS.white,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  titleQueued: {
    color: COLORS.primaryDark,
  },
  titleAssigned: {
    color: COLORS.successDark,
  },
  departmentLabel: {
    fontSize: 10.5,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  queueBody: {
    marginTop: 10,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: COLORS.backgroundAlt,
    borderRadius: RADIUS.sm,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metricItem: {
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
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
    color: COLORS.primary,
  },
  positionSuffix: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  divider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.border,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeNumber: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.warningDark,
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
    color: COLORS.textMuted,
    lineHeight: 15,
  },
  assignedBody: {
    marginTop: 10,
  },
  agentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.white,
    padding: 10,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.successBorder,
  },
  agentInfo: {
    flex: 1,
  },
  agentName: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text,
  },
  agentRole: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  assignedMessage: {
    fontSize: 12,
    color: COLORS.textSecondary,
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
    backgroundColor: COLORS.cardSubdued,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  advanceBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    ...SHADOWS.primary,
  },
  advanceBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: COLORS.white,
  },
  connectedBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.successDark,
    alignItems: 'center',
  },
  connectedBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.white,
  },
  cancelledCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.dangerLight,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    borderRadius: RADIUS.md,
    padding: 10,
    marginTop: 8,
  },
  cancelledText: {
    fontSize: 12,
    color: COLORS.dangerDark,
    fontWeight: '700',
  },
});
