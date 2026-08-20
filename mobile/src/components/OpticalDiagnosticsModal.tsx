import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { RADIUS, SHADOWS } from '../constants/theme';
import { hapticFeedback } from '../utils/haptics';
import { apiService } from '../services/api';
import { OpticalDiagnosticResult } from '../types';
import {
  Activity,
  X,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  AlertOctagon,
  ShieldCheck,
  Server,
  Zap,
  ArrowRight,
} from 'lucide-react-native';

interface OpticalDiagnosticsModalProps {
  visible: boolean;
  clientId: string;
  isDemo?: boolean;
  onClose: () => void;
  onShowToast: (msg: string) => void;
  onNavigateToChat?: (protocol?: string) => void;
}

export const OpticalDiagnosticsModal: React.FC<OpticalDiagnosticsModalProps> = ({
  visible,
  clientId,
  isDemo = false,
  onClose,
  onShowToast,
  onNavigateToChat,
}) => {
  const { colors } = useAppTheme();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<OpticalDiagnosticResult | null>(null);

  useEffect(() => {
    if (visible && clientId) {
      runDiagnosis();
    }
  }, [visible, clientId]);

  const runDiagnosis = async (simulatedRx?: number) => {
    setLoading(true);
    hapticFeedback.light();
    try {
      const res = await apiService.getOpticalDiagnostics(clientId, simulatedRx);
      setData(res);
      if (res.classification === 'PERFECT') {
        hapticFeedback.success();
      } else if (res.classification === 'WARNING') {
        hapticFeedback.warning();
      } else {
        hapticFeedback.error();
      }
    } catch (e: any) {
      onShowToast('Erro ao ler potência ótica: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = () => {
    if (!data) return null;
    if (data.classification === 'PERFECT') {
      return {
        bg: '#DCFCE7',
        border: '#86EFAC',
        text: '#15803D',
        icon: <CheckCircle2 size={16} color="#15803D" strokeWidth={2.5} />,
      };
    }
    if (data.classification === 'WARNING') {
      return {
        bg: '#FEF3C7',
        border: '#FCD34D',
        text: '#B45309',
        icon: <AlertTriangle size={16} color="#B45309" strokeWidth={2.5} />,
      };
    }
    return {
      bg: '#FEE2E2',
      border: '#FCA5A5',
      text: '#B91C1C',
      icon: <AlertOctagon size={16} color="#B91C1C" strokeWidth={2.5} />,
    };
  };

  const badge = getStatusBadge();

  // Calcula porcentagem na barra de sinal (-15 dBm = 100%, -35 dBm = 0%)
  const rxVal = data?.rxPowerDbm || -20;
  const signalPercent = Math.min(Math.max(Math.round(((rxVal - -35) / (-15 - -35)) * 100), 0), 100);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
            <View style={styles.headerLeft}>
              <View style={[styles.iconBox, { backgroundColor: colors.primaryUltraLight }]}>
                <Activity size={20} color={colors.primary} strokeWidth={2.5} />
              </View>
              <View>
                <Text style={[styles.title, { color: colors.secondary }]}>Telemetria de Sinal Ótico</Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                  {isDemo ? 'Prévia local • telemetria não confirmada' : 'Leitura de Potência RX/TX da Fibra Óptica'}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <X size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textMuted }]}>
                {isDemo ? 'Carregando diagnóstico ilustrativo...' : 'Aferindo atenuação e lasers na porta PON...'}
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
              {isDemo && (
                <View style={[styles.demoNotice, { backgroundColor: colors.warningLight, borderColor: colors.warningBorder }]}>
                  <AlertTriangle size={16} color={colors.warningDark} />
                  <Text style={[styles.demoNoticeText, { color: colors.warningDark }]}>
                    Ambiente de demonstração: leituras RX/TX, ONU e OLT são ilustrativas e não confirmam o provedor. Nenhum chamado preventivo será aberto automaticamente.
                  </Text>
                </View>
              )}

              {/* Card de Nível dBm */}
              <View style={[styles.gaugeCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.gaugeLabel, { color: colors.textMuted }]}>{isDemo ? 'POTÊNCIA RX (PRÉVIA NÃO CONFIRMADA)' : 'POTÊNCIA ÓPTICA RECEBIDA (RX)'}</Text>
                <Text style={[styles.gaugeValue, { color: badge?.text }]}>
                  {data?.rxPowerDbm} <Text style={styles.unitText}>dBm</Text>
                </Text>

                {/* Barra de Progresso Colorida */}
                <View style={styles.meterContainer}>
                  <View style={[styles.meterTrack, { backgroundColor: colors.borderLight }]}>
                    <View
                      style={[
                        styles.meterFill,
                        {
                          width: `${signalPercent}%`,
                          backgroundColor: badge?.text,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.meterLabels}>
                    <Text style={[styles.meterLabelText, { color: colors.danger }]}>Crítico (&lt; -28)</Text>
                    <Text style={[styles.meterLabelText, { color: colors.warning }]}>Moderado (-25 a -27)</Text>
                    <Text style={[styles.meterLabelText, { color: colors.successDark }]}>Ideal (-15 a -24)</Text>
                  </View>
                </View>

                {/* Badge de Status */}
                {badge && (
                  <View style={[styles.statusPill, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                    {badge.icon}
                    <Text style={[styles.statusPillText, { color: badge.text }]}>{isDemo ? `Prévia não confirmada — ${data?.statusLabel}` : data?.statusLabel}</Text>
                  </View>
                )}
              </View>

              {/* Informações Técnicas da Porta PON */}
              <View style={[styles.infoGrid, { borderColor: colors.borderLight, backgroundColor: colors.card }]}>
                <View style={styles.infoCol}>
                  <Text style={[styles.infoTitle, { color: colors.textMuted }]}>{isDemo ? 'TRANSMISSÃO TX (PRÉVIA)' : 'TRANSMISSÃO (TX)'}</Text>
                  <Text style={[styles.infoVal, { color: colors.text }]}>{data?.txPowerDbm} dBm{isDemo ? ' (prévia)' : ''}</Text>
                </View>
                <View style={styles.infoCol}>
                  <Text style={[styles.infoTitle, { color: colors.textMuted }]}>{isDemo ? 'ESTADO ONU (NÃO CONFIRMADO)' : 'ESTADO ONU'}</Text>
                  <Text style={[styles.infoVal, { color: isDemo ? colors.warningDark : colors.successDark }]}>{isDemo ? `${data?.onuStatus} (prévia)` : data?.onuStatus}</Text>
                </View>
                <View style={styles.infoCol}>
                  <Text style={[styles.infoTitle, { color: colors.textMuted }]}>{isDemo ? 'PORTA OLT (ILUSTRATIVA)' : 'PORTA OLT'}</Text>
                  <Text style={[styles.infoVal, { color: colors.text }]}>{data?.ponPort}{isDemo ? ' (prévia)' : ''}</Text>
                </View>
              </View>

              {/* Descrição e Recomendações */}
              <View style={[styles.descCard, { backgroundColor: colors.background, borderColor: colors.borderLight }]}>
                <Text style={[styles.descTitle, { color: colors.secondary }]}>Análise do Link:</Text>
                 <Text style={[styles.descText, { color: colors.text }]}>{isDemo ? `Dado ilustrativo: ${data?.description}` : data?.description}</Text>
                <Text style={[styles.descTitle, { color: colors.secondary, marginTop: 8 }]}>Recomendação:</Text>
                 <Text style={[styles.descText, { color: colors.textMuted }]}>{isDemo ? `Orientação ilustrativa: ${data?.recommendation}` : data?.recommendation}</Text>
              </View>

              {/* Banner de Abertura Automática de Chamado se Crítico */}
              {data?.ticketCreated && !isDemo && (
                <View style={[styles.ticketBanner, { backgroundColor: colors.dangerLight, borderColor: colors.dangerBorder }]}>
                  <View style={styles.ticketHeader}>
                    <ShieldCheck size={18} color={colors.dangerDark} />
                    <Text style={[styles.ticketTitle, { color: colors.dangerDark }]}>
                      Chamado Preventivo Aberto Automaticamente!
                    </Text>
                  </View>
                  <Text style={[styles.ticketDesc, { color: colors.dangerDark }]}>
                    Protocolo: <Text style={{ fontWeight: '900' }}>{data.ticketProtocol}</Text>
                  </Text>
                  <TouchableOpacity
                    style={[styles.chatActionBtn, { backgroundColor: colors.dangerDark }]}
                    onPress={() => {
                      onClose();
                      onNavigateToChat?.(data.ticketProtocol);
                    }}
                  >
                    <Text style={styles.chatActionBtnText}>Acompanhar no Chat de Suporte</Text>
                    <ArrowRight size={14} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              )}

              {isDemo && data?.ticketCreated && (
                <View style={[styles.ticketBanner, { backgroundColor: colors.warningLight, borderColor: colors.warningBorder }]}>
                  <View style={styles.ticketHeader}>
                    <AlertTriangle size={18} color={colors.warningDark} />
                    <Text style={[styles.ticketTitle, { color: colors.warningDark }]}>Chamado não aberto na demonstração</Text>
                  </View>
                  <Text style={[styles.ticketDesc, { color: colors.warningDark }]}>O protocolo exibido é apenas ilustrativo. Nenhuma solicitação foi registrada e não há acompanhamento real.</Text>
                </View>
              )}

              {/* Testes de Simulação para Demonstração */}
              <View style={styles.simButtonsRow}>
                <TouchableOpacity
                  style={[styles.simBtn, { borderColor: colors.successBorder, backgroundColor: colors.successLight }]}
                  onPress={() => runDiagnosis(-19.4)}
                >
                  <Text style={[styles.simBtnText, { color: colors.successDark }]}>Simular Sinal Perfeito</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.simBtn, { borderColor: colors.warningBorder, backgroundColor: colors.warningLight }]}
                  onPress={() => runDiagnosis(-26.5)}
                >
                  <Text style={[styles.simBtnText, { color: colors.warningDark }]}>Simular Atenuação</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.simBtn, { borderColor: colors.dangerBorder, backgroundColor: colors.dangerLight }]}
                  onPress={() => runDiagnosis(-29.8)}
                >
                  <Text style={[styles.simBtnText, { color: colors.dangerDark }]}>Simular Sinal Crítico</Text>
                </TouchableOpacity>
              </View>

              {/* Botão de Repetir Teste */}
              <TouchableOpacity
                style={[styles.refreshBtn, { backgroundColor: colors.primary }]}
                onPress={() => runDiagnosis()}
                activeOpacity={0.85}
              >
                <RefreshCw size={16} color="#FFFFFF" />
                <Text style={styles.refreshBtnText}>{isDemo ? 'Atualizar prévia' : 'Atualizar Diagnóstico'}</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: '90%',
    borderWidth: 1,
    paddingBottom: 24,
    ...SHADOWS.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  closeBtn: {
    padding: 6,
  },
  loadingBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 12,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  demoNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: 12,
  },
  demoNoticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  gaugeCard: {
    padding: 16,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 12,
    ...SHADOWS.sm,
  },
  gaugeLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  gaugeValue: {
    fontSize: 36,
    fontWeight: '900',
    marginVertical: 4,
  },
  unitText: {
    fontSize: 18,
    fontWeight: '700',
  },
  meterContainer: {
    width: '100%',
    marginVertical: 8,
  },
  meterTrack: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 5,
  },
  meterLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  meterLabelText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    marginTop: 6,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  infoGrid: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 12,
    marginBottom: 12,
  },
  infoCol: {
    flex: 1,
    alignItems: 'center',
  },
  infoTitle: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  infoVal: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  descCard: {
    padding: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: 12,
  },
  descTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    marginBottom: 2,
  },
  descText: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  ticketBanner: {
    padding: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: 14,
    gap: 6,
  },
  ticketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ticketTitle: {
    fontSize: 12.5,
    fontWeight: '900',
  },
  ticketDesc: {
    fontSize: 12,
  },
  chatActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    marginTop: 4,
  },
  chatActionBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  simButtonsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  simBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  simBtnText: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: RADIUS.md,
    marginBottom: 20,
    ...SHADOWS.primary,
  },
  refreshBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
