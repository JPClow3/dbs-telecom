import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Switch,
  Platform,
} from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { RADIUS, SHADOWS } from '../constants/theme';
import { hapticFeedback } from '../utils/haptics';
import { apiService } from '../services/api';
import { WifiSettings } from '../types';
import { QRCodeView } from './QRCodeView';
import {
  Wifi,
  QrCode,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  X,
  CheckCircle2,
  Copy,
  Users,
  Radio,
  Sliders,
  Shield,
  AlertTriangle,
} from 'lucide-react-native';

interface WifiManagerModalProps {
  visible: boolean;
  clientId: string;
  isDemo?: boolean;
  onClose: () => void;
  onShowToast: (msg: string) => void;
}

export const WifiManagerModal: React.FC<WifiManagerModalProps> = ({
  visible,
  clientId,
  isDemo = false,
  onClose,
  onShowToast,
}) => {
  const { colors } = useAppTheme();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rebooting, setRebooting] = useState(false);
  const [settings, setSettings] = useState<WifiSettings | null>(null);

  // Form states
  const [ssid2G, setSsid2G] = useState('');
  const [ssid5G, setSsid5G] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Guest network states
  const [guestEnabled, setGuestEnabled] = useState(true);
  const [guestSsid, setGuestSsid] = useState('');
  const [guestPassword, setGuestPassword] = useState('');
  const [showGuestPassword, setShowGuestPassword] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  useEffect(() => {
    if (visible && clientId) {
      loadSettings();
    }
  }, [visible, clientId]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await apiService.getWifiSettings(clientId);
      setSettings(data);
      setSsid2G(data.ssid2G);
      setSsid5G(data.ssid5G);
      setPassword(data.password);
      setGuestEnabled(data.guestEnabled);
      setGuestSsid(data.guestSsid);
      setGuestPassword(data.guestPassword);
    } catch (e: any) {
      onShowToast('Falha ao carregar Wi-Fi: ' + (e.message || 'Erro de conexão'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (isDemo) {
      onShowToast('Prévia local: alterações de Wi-Fi não foram enviadas ao roteador.');
      return;
    }
    if (password.length < 8) {
      onShowToast('A senha principal deve ter no mínimo 8 caracteres.');
      return;
    }
    if (guestEnabled && guestPassword.length < 8) {
      onShowToast('A senha da rede de visitas deve ter no mínimo 8 caracteres.');
      return;
    }

    setSaving(true);
    hapticFeedback.selection();
    try {
      const updated = await apiService.updateWifiSettings(clientId, {
        ssid2G,
        ssid5G,
        password,
        guestEnabled,
        guestSsid,
        guestPassword,
      });
      setSettings(updated);
      hapticFeedback.success();
      onShowToast('Configurações de Wi-Fi atualizadas via TR-069!');
    } catch (e: any) {
      onShowToast(e.message || 'Erro ao salvar alterações');
    } finally {
      setSaving(false);
    }
  };

  const handleRestartWifi = async () => {
    if (isDemo) {
      onShowToast('Prévia local: o roteador não pode ser reiniciado neste ambiente.');
      return;
    }
    setRebooting(true);
    hapticFeedback.medium();
    try {
      const res = await apiService.restartWifi(clientId);
      hapticFeedback.success();
      onShowToast(res.message);
    } catch (e: any) {
      onShowToast('Erro ao reiniciar Wi-Fi: ' + e.message);
    } finally {
      setRebooting(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    hapticFeedback.selection();
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    onShowToast(`${label} copiado!`);
  };

  const guestQrString = `WIFI:T:WPA;S:${guestSsid};P:${guestPassword};;`;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
            <View style={styles.headerLeft}>
              <View style={[styles.iconBox, { backgroundColor: colors.primaryUltraLight }]}>
                <Wifi size={20} color={colors.primary} strokeWidth={2.5} />
              </View>
              <View>
                <Text style={[styles.title, { color: colors.secondary }]}>Gerenciador Wi-Fi</Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                  {isDemo ? 'Prévia local • sem acesso ao roteador' : 'TR-069 & Compartilhamento de Rede'}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textMuted }]}>
                {isDemo ? 'Carregando dados ilustrativos de Wi-Fi...' : 'Sincronizando com o Roteador Wi-Fi...'}
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
              {isDemo && (
                <View style={[styles.demoNotice, { backgroundColor: colors.warningLight, borderColor: colors.warningBorder }]}>
                  <AlertTriangle size={16} color={colors.warningDark} />
                  <Text style={[styles.demoNoticeText, { color: colors.warningDark }]}>
                    Ambiente de demonstração: dados da rede são ilustrativos e o status do roteador não foi confirmado. Alterações e reinicializações estão desativadas.
                  </Text>
                </View>
              )}

              {/* Status da Rede */}
              <View style={[styles.statusBanner, { backgroundColor: isDemo ? colors.warningLight : colors.primaryUltraLight, borderColor: isDemo ? colors.warningBorder : colors.primaryBorder }]}>
                <View style={styles.statusRow}>
                  <Radio size={16} color={isDemo ? colors.warningDark : colors.primary} />
                  <Text style={[styles.statusText, { color: isDemo ? colors.warningDark : colors.primary }]}>
                    {isDemo
                      ? `Prévia: status do roteador não confirmado • ${settings?.connectedDevices || 5} aparelhos ilustrativos`
                      : `Roteador Dual-Band Online • ${settings?.connectedDevices || 5} aparelhos conectados`}
                  </Text>
                </View>
              </View>

              {/* Seção Rede Principal (2.4G & 5G) */}
              <View style={[styles.sectionBlock, { borderColor: colors.borderLight }]}>
                <View style={styles.sectionHeader}>
                  <Sliders size={16} color={colors.primary} />
                  <Text style={[styles.sectionTitle, { color: colors.secondary }]}>Rede Wi-Fi Principal</Text>
                </View>

                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Nome da Rede (2.4 GHz)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  value={ssid2G}
                  onChangeText={setSsid2G}
                  placeholder="Nome do Wi-Fi 2.4G"
                  placeholderTextColor={colors.textMuted}
                />

                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Nome da Rede Turbo (5 GHz)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  value={ssid5G}
                  onChangeText={setSsid5G}
                  placeholder="Nome do Wi-Fi 5G"
                  placeholderTextColor={colors.textMuted}
                />

                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Senha do Wi-Fi (mín. 8 dígitos)</Text>
                <View style={[styles.passwordWrapper, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.passwordInput, { color: colors.text }]}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    placeholder="Senha da rede principal"
                    placeholderTextColor={colors.textMuted}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                    {showPassword ? <EyeOff size={18} color={colors.textMuted} /> : <Eye size={18} color={colors.textMuted} />}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Seção Rede de Visitas & QR Code */}
              <View style={[styles.sectionBlock, { borderColor: colors.borderLight }]}>
                <View style={styles.sectionHeaderBetween}>
                  <View style={styles.sectionHeaderLeft}>
                    <Users size={16} color={colors.primary} />
                    <Text style={[styles.sectionTitle, { color: colors.secondary }]}>Rede de Visitas (Isolada)</Text>
                  </View>
                  <Switch
                    value={guestEnabled}
                    onValueChange={setGuestEnabled}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                {guestEnabled && (
                  <>
                    <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Nome da Rede de Visitas</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                      value={guestSsid}
                      onChangeText={setGuestSsid}
                      placeholder="Nome da Rede Visitas"
                      placeholderTextColor={colors.textMuted}
                    />

                    <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Senha para Visitas</Text>
                    <View style={[styles.passwordWrapper, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <TextInput
                        style={[styles.passwordInput, { color: colors.text }]}
                        value={guestPassword}
                        onChangeText={setGuestPassword}
                        secureTextEntry={!showGuestPassword}
                        placeholder="Senha para visitas"
                        placeholderTextColor={colors.textMuted}
                      />
                      <TouchableOpacity onPress={() => setShowGuestPassword(!showGuestPassword)} style={styles.eyeBtn}>
                        {showGuestPassword ? <EyeOff size={18} color={colors.textMuted} /> : <Eye size={18} color={colors.textMuted} />}
                      </TouchableOpacity>
                    </View>

                    {/* Botão Gerar QR Code para Visitas */}
                    <TouchableOpacity
                      style={[styles.qrCodeBtn, { backgroundColor: colors.secondary }]}
                    onPress={() => {
                        hapticFeedback.medium();
                        setShowQrModal(true);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={isDemo ? 'Gerar QR Code ilustrativo' : 'Gerar QR Code para visitas conectarem'}
                      activeOpacity={0.85}
                    >
                      <QrCode size={18} color="#FFFFFF" />
                      <Text style={styles.qrCodeBtnText}>Gerar QR Code para Visitas Conectarem</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>

              {/* Ações de Salvar e Reiniciar */}
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.rebootBtn, { borderColor: colors.border }]}
                  onPress={handleRestartWifi}
                  disabled={rebooting || isDemo}
                  accessibilityRole="button"
                  accessibilityLabel={isDemo ? 'Reiniciar (demo) — indisponível' : 'Reiniciar Wi-Fi'}
                  activeOpacity={0.8}
                >
                  <RefreshCw size={16} color={isDemo ? colors.textMuted : colors.text} />
                  <Text style={[styles.rebootBtnText, { color: colors.text }]}>
                    {rebooting ? 'Reiniciando...' : isDemo ? 'Reiniciar (demo)' : 'Reiniciar Wi-Fi'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                  onPress={handleSave}
                  disabled={saving || isDemo}
                  accessibilityRole="button"
                  accessibilityLabel={isDemo ? 'Salvar (demo) — indisponível' : 'Salvar alterações'}
                  activeOpacity={0.85}
                >
                  <CheckCircle2 size={16} color={isDemo ? colors.textMuted : '#FFFFFF'} strokeWidth={2.5} />
                  <Text style={styles.saveBtnText}>
                    {saving ? 'Aplicando...' : isDemo ? 'Salvar (demo)' : 'Salvar Alterações'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {/* Sub-modal: QR Code de Visitas */}
          <Modal visible={showQrModal} transparent animationType="fade" onRequestClose={() => setShowQrModal(false)}>
            <View style={styles.qrOverlay}>
              <View style={[styles.qrCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.qrCardHeader}>
                  <Text style={[styles.qrCardTitle, { color: colors.secondary }]}>Conexão Fácil para Visitas</Text>
                  <TouchableOpacity onPress={() => setShowQrModal(false)}>
                    <X size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>

                <Text style={[styles.qrCardDesc, { color: colors.textMuted }]}>
                  {isDemo
                    ? 'QR Code ilustrativo: não use estes dados para conectar um dispositivo real.'
                    : 'Peça para sua visita apontar a câmera do smartphone para o QR Code abaixo para conectar automaticamente!'}
                </Text>

                <View style={styles.qrWrapper}>
                  <QRCodeView value={guestQrString} size={210} color="#1E293B" backgroundColor="#FFFFFF" />
                </View>

                <View style={[styles.qrInfoBox, { backgroundColor: colors.background, borderColor: colors.borderLight }]}>
                  <Text style={[styles.qrInfoLabel, { color: colors.textMuted }]}>Rede: <Text style={{ fontWeight: '800', color: colors.text }}>{guestSsid}</Text></Text>
                  <Text style={[styles.qrInfoLabel, { color: colors.textMuted }]}>Senha: <Text style={{ fontWeight: '800', color: colors.text }}>{guestPassword}</Text></Text>
                </View>

                <View style={styles.qrActions}>
                  <TouchableOpacity
                    style={[styles.copyBtn, { backgroundColor: colors.primaryUltraLight, borderColor: colors.primaryBorder }]}
                    onPress={() => copyToClipboard(guestPassword, 'Senha')}
                    accessibilityRole="button"
                    accessibilityLabel={isDemo ? 'Copiar senha ilustrativa' : 'Copiar senha'}
                  >
                    <Copy size={16} color={colors.primary} />
                    <Text style={[styles.copyBtnText, { color: colors.primary }]}>{isDemo ? 'Copiar prévia' : 'Copiar Senha'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
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
  statusBanner: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: 14,
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  sectionBlock: {
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: 14,
    marginBottom: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionHeaderBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
    marginTop: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    fontWeight: '600',
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 9,
    fontSize: 13,
    fontWeight: '600',
  },
  eyeBtn: {
    padding: 4,
  },
  qrCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: RADIUS.sm,
    marginTop: 12,
  },
  qrCodeBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12.5,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    marginBottom: 20,
  },
  rebootBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    paddingVertical: 13,
    borderRadius: RADIUS.md,
  },
  rebootBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  saveBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: RADIUS.md,
    ...SHADOWS.primary,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  // QR Modal
  qrOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  qrCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: RADIUS.xl,
    padding: 20,
    borderWidth: 1,
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  qrCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 8,
  },
  qrCardTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  qrCardDesc: {
    fontSize: 11.5,
    textAlign: 'center',
    marginBottom: 16,
  },
  qrWrapper: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    ...SHADOWS.md,
  },
  qrInfoBox: {
    width: '100%',
    padding: 10,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    marginTop: 14,
    gap: 4,
  },
  qrInfoLabel: {
    fontSize: 11.5,
  },
  qrActions: {
    width: '100%',
    marginTop: 12,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  copyBtnText: {
    fontWeight: '800',
    fontSize: 12,
  },
});
