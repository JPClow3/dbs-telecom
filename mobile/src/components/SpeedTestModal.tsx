import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { SHADOWS, RADIUS } from '../constants/theme';
import { useAppTheme } from '../context/ThemeContext';
import { hapticFeedback } from '../utils/haptics';
import { SpeedTestMetrics } from '../types';
import { apiService } from '../services/api';
import {
  Gauge,
  ArrowDownCircle,
  ArrowUpCircle,
  Activity,
  Zap,
  CheckCircle2,
  X,
  RotateCcw,
  Wifi,
  Sparkles,
} from 'lucide-react-native';

interface SpeedTestModalProps {
  visible: boolean;
  isDemo?: boolean;
  onClose: () => void;
}

export type TestStage = 'IDLE' | 'PING' | 'DOWNLOAD' | 'UPLOAD' | 'COMPLETED';

export const SpeedTestModal: React.FC<SpeedTestModalProps> = ({ visible, isDemo: customerIsDemo = false, onClose }) => {
  const { colors, isDark } = useAppTheme();
  const [stage, setStage] = useState<TestStage>('IDLE');
  const [stageMessage, setStageMessage] = useState('Pressione Iniciar para testar sua conexão');
  const [liveMbps, setLiveMbps] = useState(0);
  const [metrics, setMetrics] = useState<SpeedTestMetrics | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const displayIsDemo = customerIsDemo || isDemo;

  // Animação do ponteiro velocímetro (0 graus a 180 graus)
  const needleAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (stage === 'DOWNLOAD' || stage === 'UPLOAD') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [stage]);

  const animateNeedleToMbps = (mbps: number) => {
    // Normaliza 0-600 Mbps para 0-180 graus
    const clamped = Math.min(Math.max(mbps, 0), 600);
    const targetDeg = (clamped / 600) * 180;

    Animated.timing(needleAnim, {
      toValue: targetDeg,
      duration: 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const handleStartTest = async () => {
    hapticFeedback.medium();
    setMetrics(null);
    setIsDemo(customerIsDemo);
    setLiveMbps(0);
    animateNeedleToMbps(0);

    // 1. Etapa de PING & JITTER
    setStage('PING');
    setStageMessage(customerIsDemo ? 'Simulando latência e jitter (dados ilustrativos)...' : 'Medindo latência de rede e jitter...');
    await new Promise((r) => setTimeout(r, 600));

    // 2. Etapa de DOWNLOAD
    setStage('DOWNLOAD');
    setStageMessage(customerIsDemo ? 'Simulando download (prévia não confirmada)...' : 'Testando velocidade de download FTTH...');
    hapticFeedback.selection();

    // Simula ramp-up visual realista durante a medição do throughput
    let currentVal = 40;
    const downloadRamp = setInterval(() => {
      currentVal += Math.floor(25 + Math.random() * 45);
      if (currentVal > 512) currentVal = 508 + Math.floor(Math.random() * 12);
      setLiveMbps(currentVal);
      animateNeedleToMbps(currentVal);
    }, 120);

    let testResults: SpeedTestMetrics;
    let resultIsDemo = customerIsDemo;
    if (customerIsDemo) {
      await new Promise((r) => setTimeout(r, 500));
      testResults = {
        pingMs: 8,
        jitterMs: 1.1,
        downloadMbps: 508.4,
        uploadMbps: 254.2,
        packetLossPercent: 0,
        status: 'Prévia local — não confirma o desempenho da operadora',
        timestamp: new Date().toISOString(),
      };
    } else {
      try {
        testResults = await apiService.runRealSpeedTest((msg) => {
          setStageMessage(msg);
        });
        resultIsDemo = /offline|local|fallback|demo|simula/i.test(testResults.status);
        setIsDemo(resultIsDemo);
      } catch {
        resultIsDemo = true;
        setIsDemo(true);
        testResults = {
          pingMs: 8,
          jitterMs: 1.1,
          downloadMbps: 508.4,
          uploadMbps: 254.2,
          packetLossPercent: 0,
          status: 'Prévia local — não confirma o desempenho da operadora',
          timestamp: new Date().toISOString(),
        };
      }
    }

    clearInterval(downloadRamp);
    setLiveMbps(testResults.downloadMbps);
    animateNeedleToMbps(testResults.downloadMbps);
    hapticFeedback.medium();
    await new Promise((r) => setTimeout(r, 800));

    // 3. Etapa de UPLOAD
    setStage('UPLOAD');
    setStageMessage(customerIsDemo ? 'Simulando upload (prévia não confirmada)...' : 'Testando velocidade de upload...');
    let uploadVal = 30;
    const uploadRamp = setInterval(() => {
      uploadVal += Math.floor(20 + Math.random() * 30);
      if (uploadVal > testResults.uploadMbps) uploadVal = testResults.uploadMbps;
      setLiveMbps(uploadVal);
      animateNeedleToMbps(uploadVal);
    }, 120);

    await new Promise((r) => setTimeout(r, 1200));
    clearInterval(uploadRamp);
    setLiveMbps(testResults.uploadMbps);
    animateNeedleToMbps(testResults.uploadMbps);

    // 4. Finalização
    setMetrics(testResults);
    setStage('COMPLETED');
    setStageMessage(resultIsDemo ? 'Prévia de velocidade finalizada — não confirma o desempenho da operadora.' : 'Teste de velocidade finalizado com sucesso!');
    hapticFeedback.success();
  };

  const needleRotation = needleAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ['-90deg', '90deg'],
  });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          {/* Cabeçalho */}
          <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
            <View style={styles.titleRow}>
              <View style={[styles.iconBadge, { backgroundColor: colors.primaryUltraLight }]}>
                <Gauge size={20} color={colors.primary} strokeWidth={2.2} />
              </View>
              <View>
                <Text style={[styles.title, { color: colors.secondary }]}>SpeedTest DBS</Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                  {displayIsDemo
                    ? 'Prévia local • não confirma o desempenho da operadora'
                    : 'Medição com servidor configurado pela API'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <X size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Área do Velocímetro Circular */}
          <View style={styles.gaugeContainer}>
            <View
              style={[
                styles.gaugeArc,
                {
                  borderColor: isDark ? '#334155' : '#E2E8F0',
                  borderTopColor: colors.primary,
                  borderRightColor: stage === 'COMPLETED' ? colors.success : colors.primary,
                },
              ]}
            >
              {/* Ponteiro Animado */}
              <Animated.View
                style={[
                  styles.needleWrapper,
                  {
                    transform: [{ rotate: needleRotation }],
                  },
                ]}
              >
                <View style={[styles.needle, { backgroundColor: colors.primary }]} />
                <View style={[styles.needleCenter, { backgroundColor: colors.primary }]} />
              </Animated.View>

              {/* Valor Central de Mbps */}
              <View style={styles.gaugeCenterText}>
                <Animated.Text
                  style={[
                    styles.gaugeNumber,
                    { color: colors.secondary },
                    stage !== 'IDLE' && { transform: [{ scale: pulseAnim }] },
                  ]}
                >
                  {stage === 'COMPLETED' && metrics ? metrics.downloadMbps.toFixed(0) : liveMbps.toFixed(0)}
                </Animated.Text>
                <Text style={[styles.gaugeUnit, { color: isDark ? '#FFA07A' : colors.primaryDark }]}>
                  {stage === 'UPLOAD' ? `Mbps UPLOAD${displayIsDemo ? ' (PRÉVIA)' : ''}` : `Mbps DOWNLOAD${displayIsDemo ? ' (PRÉVIA)' : ''}`}
                </Text>
              </View>
            </View>

            {/* Marcadores de Escala */}
            <View style={styles.scaleMarkers}>
              <Text style={[styles.scaleText, { color: colors.textSubtle }]}>0</Text>
              <Text style={[styles.scaleText, { color: colors.textSubtle }]}>150</Text>
              <Text style={[styles.scaleText, { color: colors.textSubtle }]}>300</Text>
              <Text style={[styles.scaleText, { color: colors.textSubtle }]}>600+ Mbps</Text>
            </View>

            <Text style={[styles.stageMessage, { color: colors.textSecondary }]}>{stageMessage}</Text>
          </View>

          {/* Métricas Principais (Ping, Jitter, Download, Upload) */}
          <View style={styles.metricsGrid}>
            {/* Ping */}
            <View style={[styles.metricCard, { backgroundColor: colors.cardSubdued, borderColor: colors.border }]}>
              <View style={styles.metricHeader}>
                <Activity size={14} color={colors.textMuted} strokeWidth={2.2} />
                <Text style={[styles.metricLabel, { color: colors.textMuted }]}>PING</Text>
              </View>
              <Text style={[styles.metricValue, { color: colors.text }]}>
                {metrics ? `${metrics.pingMs} ms` : stage === 'PING' ? '...' : '--'}
              </Text>
            </View>

            {/* Jitter */}
            <View style={[styles.metricCard, { backgroundColor: colors.cardSubdued, borderColor: colors.border }]}>
              <View style={styles.metricHeader}>
                <Zap size={14} color={colors.textMuted} strokeWidth={2.2} />
                <Text style={[styles.metricLabel, { color: colors.textMuted }]}>JITTER</Text>
              </View>
              <Text style={[styles.metricValue, { color: colors.text }]}>
                {metrics ? `${metrics.jitterMs} ms` : stage === 'PING' ? '...' : '--'}
              </Text>
            </View>

            {/* Download */}
            <View style={[styles.metricCard, { backgroundColor: colors.cardSubdued, borderColor: colors.border }]}>
              <View style={styles.metricHeader}>
                <ArrowDownCircle size={14} color={colors.primary} strokeWidth={2.2} />
                  <Text style={[styles.metricLabel, { color: colors.primary }]}>{displayIsDemo ? 'DOWNLOAD (PRÉVIA)' : 'DOWNLOAD'}</Text>
              </View>
              <Text style={[styles.metricValue, { color: colors.primary, fontWeight: '800' }]}>
                {metrics ? `${metrics.downloadMbps} M` : stage === 'DOWNLOAD' ? `${liveMbps}` : '--'}
              </Text>
            </View>

            {/* Upload */}
            <View style={[styles.metricCard, { backgroundColor: colors.cardSubdued, borderColor: colors.border }]}>
              <View style={styles.metricHeader}>
                <ArrowUpCircle size={14} color={colors.success} strokeWidth={2.2} />
                <Text style={[styles.metricLabel, { color: colors.success }]}>{displayIsDemo ? 'UPLOAD (PRÉVIA)' : 'UPLOAD'}</Text>
              </View>
              <Text style={[styles.metricValue, { color: colors.success, fontWeight: '800' }]}>
                {metrics ? `${metrics.uploadMbps} M` : stage === 'UPLOAD' ? `${liveMbps}` : '--'}
              </Text>
            </View>
          </View>

          {/* Badge de Qualidade quando concluído */}
          {stage === 'COMPLETED' && metrics && (
            <View
              style={[
                styles.qualityBanner,
                {
                  backgroundColor: displayIsDemo ? colors.warningLight : colors.successLight,
                  borderColor: displayIsDemo ? colors.warningBorder : colors.successBorder,
                },
              ]}
            >
              <Sparkles size={16} color={displayIsDemo ? colors.warningDark : colors.successDark} strokeWidth={2.2} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.qualityTitle, { color: displayIsDemo ? colors.warningDark : colors.successDark }]}>
                  {displayIsDemo ? 'Prévia de desempenho (não confirmada)' : 'Conexão de Alta Performance'}
                </Text>
                <Text style={[styles.qualityDesc, { color: displayIsDemo ? colors.warningDark : colors.successDark }]}>
                  {displayIsDemo
                    ? 'Reconecte ao servidor para obter uma leitura válida da sua conexão.'
                    : 'Ideal para Streaming 4K/8K, Jogos Online sem lag e chamadas de vídeo.'}
                </Text>
              </View>
            </View>
          )}

          {/* Botão de Ação */}
          <View style={styles.actions}>
            {stage === 'IDLE' && (
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={handleStartTest}
                accessibilityRole="button"
                accessibilityLabel={customerIsDemo ? 'Iniciar prévia de velocidade' : 'Iniciar teste de velocidade'}
                activeOpacity={0.85}
              >
                <Wifi size={18} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.primaryBtnText}>{customerIsDemo ? 'Iniciar prévia de velocidade' : 'Iniciar Teste de Velocidade'}</Text>
              </TouchableOpacity>
            )}

            {(stage === 'PING' || stage === 'DOWNLOAD' || stage === 'UPLOAD') && (
              <View style={[styles.testingBtn, { backgroundColor: colors.primaryUltraLight }]}>
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={[styles.testingBtnText, { color: colors.primary }]}>{customerIsDemo ? 'Gerando prévia ilustrativa...' : 'Medindo Conexão...'}</Text>
              </View>
            )}

            {stage === 'COMPLETED' && (
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.secondary }]}
                onPress={handleStartTest}
                accessibilityRole="button"
                accessibilityLabel={customerIsDemo ? 'Executar prévia novamente' : 'Testar novamente'}
                activeOpacity={0.85}
              >
                <RotateCcw size={18} color="#FFFFFF" strokeWidth={2.2} />
                <Text style={styles.primaryBtnText}>{customerIsDemo ? 'Executar prévia novamente' : 'Testar Novamente'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalContainer: {
    borderRadius: RADIUS.xl,
    padding: 20,
    borderWidth: 1,
    ...SHADOWS.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 11.5,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  gaugeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  gaugeArc: {
    width: 210,
    height: 110,
    borderTopLeftRadius: 110,
    borderTopRightRadius: 110,
    borderWidth: 14,
    borderBottomWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  needleWrapper: {
    position: 'absolute',
    bottom: -8,
    width: 14,
    height: 90,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  needle: {
    width: 4,
    height: 70,
    borderRadius: 2,
  },
  needleCenter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    position: 'absolute',
    bottom: 0,
  },
  gaugeCenterText: {
    position: 'absolute',
    bottom: 4,
    alignItems: 'center',
  },
  gaugeNumber: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
  },
  gaugeUnit: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: -2,
  },
  scaleMarkers: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 220,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  scaleText: {
    fontSize: 10,
    fontWeight: '600',
  },
  stageMessage: {
    fontSize: 12.5,
    fontWeight: '600',
    marginTop: 14,
    textAlign: 'center',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    padding: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  qualityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: 16,
  },
  qualityTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  qualityDesc: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  actions: {
    marginTop: 4,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    ...SHADOWS.primary,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
  },
  testingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
  },
  testingBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
