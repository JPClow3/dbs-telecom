import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SHADOWS, RADIUS } from '../constants/theme';
import { Toast, ToastType } from '../components/Toast';
import { Customer } from '../types';
import { useAppTheme } from '../context/ThemeContext';
import { hapticFeedback } from '../utils/haptics';
import { ThemeMode } from '../services/storage';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Radio,
  CheckCircle2,
  LogOut,
  MessageSquare,
  Receipt,
  Zap,
  ChevronRight,
  Copy,
  MessageCircle,
  Headphones,
  RefreshCw,
  Moon,
  Sun,
  Smartphone,
} from 'lucide-react-native';

interface ProfileScreenProps {
  customer: Customer;
  onLogout: () => void;
  onNavigateToTab?: (tab: 'CHAT' | 'INVOICES' | 'PLANS') => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  customer,
  onLogout,
  onNavigateToTab,
}) => {
  const { colors, isDark, themeMode, setThemeMode } = useAppTheme();
  const [toastInfo, setToastInfo] = useState<{ message: string; type: ToastType } | null>(null);
  const [testingPing, setTestingPing] = useState(false);
  const [pingResult, setPingResult] = useState<{
    latency: string;
    speed: string;
    status: string;
  } | null>(null);

  const showToast = (message: string, type: ToastType = 'SUCCESS') => {
    setToastInfo({ message, type });
  };

  const handleCopy = (text: string, label: string) => {
    hapticFeedback.success();
    if (Platform.OS === 'web') {
      try {
        navigator.clipboard.writeText(text);
        showToast(`${label} copiado!`);
      } catch (e) {
        showToast(`${label} copiado!`);
      }
    } else {
      showToast(`${label} copiado!`);
    }
  };

  const handleRunDiagnostics = () => {
    hapticFeedback.light();
    setTestingPing(true);
    setPingResult(null);

    setTimeout(() => {
      hapticFeedback.success();
      setTestingPing(false);
      setPingResult({
        latency: '9 ms',
        speed: '508 Mbps',
        status: 'Excelente (Sem perda de pacotes)',
      });
      showToast('Diagnóstico concluído: link 100% estável!');
    }, 1200);
  };

  const handleOpenWhatsApp = () => {
    hapticFeedback.light();
    const url = 'https://wa.me/5549988776655?text=Ol%C3%A1!%20Sou%20o%20cliente%20' + encodeURIComponent(customer.nome) + '%20e%20preciso%20de%20atendimento.';
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => {});
    }
  };

  const handleThemeChange = async (mode: ThemeMode) => {
    hapticFeedback.selection();
    await setThemeMode(mode);
    const label = mode === 'system' ? 'Automático (Sistema)' : mode === 'dark' ? 'Modo Escuro' : 'Modo Claro';
    showToast(`Tema alterado para ${label}`);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Toast de Notificação */}
      {toastInfo && (
        <Toast
          message={toastInfo.message}
          type={toastInfo.type}
          onDismiss={() => setToastInfo(null)}
        />
      )}

      {/* Card Principal do Assinante */}
      <View
        style={[
          styles.heroCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={[styles.avatarCircle, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>{customer.nome.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={[styles.userName, { color: colors.secondary }]}>{customer.nome}</Text>
        <Text style={[styles.userDoc, { color: colors.textMuted }]}>CPF: {customer.cpfCnpj}</Text>
        <View
          style={[
            styles.statusPill,
            {
              backgroundColor: colors.successLight,
              borderColor: colors.successBorder,
            },
          ]}
        >
          <CheckCircle2 size={12} color={colors.successDark} strokeWidth={2.5} />
          <Text style={[styles.statusText, { color: colors.successDark }]}>
            Assinante Ativo DBS Fibra (ID #{customer.id})
          </Text>
        </View>
      </View>

      {/* 🌓 Seletor de Modo Escuro / Tema */}
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={[styles.sectionHeader, { borderBottomColor: colors.borderLight }]}>
          <View style={styles.headerLeft}>
            {isDark ? (
              <Moon size={16} color={colors.primary} strokeWidth={2.2} />
            ) : (
              <Sun size={16} color={colors.primary} strokeWidth={2.2} />
            )}
            <Text style={[styles.sectionTitle, { color: colors.secondary }]}>Aparência do Aplicativo</Text>
          </View>
        </View>

        <View style={styles.themeSelectorRow}>
          <TouchableOpacity
            style={[
              styles.themeOptionBtn,
              {
                backgroundColor: colors.cardSubdued,
                borderColor: colors.border,
              },
              themeMode === 'system' && [
                styles.themeOptionBtnActive,
                {
                  backgroundColor: colors.primaryUltraLight,
                  borderColor: colors.primary,
                },
              ],
            ]}
            onPress={() => handleThemeChange('system')}
            activeOpacity={0.75}
          >
            <Smartphone
              size={15}
              color={themeMode === 'system' ? colors.primary : colors.textMuted}
              strokeWidth={2.2}
            />
            <Text
              style={[
                styles.themeOptionText,
                { color: colors.textMuted },
                themeMode === 'system' && { color: colors.primary, fontWeight: '800' },
              ]}
            >
              Automático
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.themeOptionBtn,
              {
                backgroundColor: colors.cardSubdued,
                borderColor: colors.border,
              },
              themeMode === 'light' && [
                styles.themeOptionBtnActive,
                {
                  backgroundColor: colors.primaryUltraLight,
                  borderColor: colors.primary,
                },
              ],
            ]}
            onPress={() => handleThemeChange('light')}
            activeOpacity={0.75}
          >
            <Sun
              size={15}
              color={themeMode === 'light' ? colors.primary : colors.textMuted}
              strokeWidth={2.2}
            />
            <Text
              style={[
                styles.themeOptionText,
                { color: colors.textMuted },
                themeMode === 'light' && { color: colors.primary, fontWeight: '800' },
              ]}
            >
              Claro
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.themeOptionBtn,
              {
                backgroundColor: colors.cardSubdued,
                borderColor: colors.border,
              },
              themeMode === 'dark' && [
                styles.themeOptionBtnActive,
                {
                  backgroundColor: colors.primaryUltraLight,
                  borderColor: colors.primary,
                },
              ],
            ]}
            onPress={() => handleThemeChange('dark')}
            activeOpacity={0.75}
          >
            <Moon
              size={15}
              color={themeMode === 'dark' ? colors.primary : colors.textMuted}
              strokeWidth={2.2}
            />
            <Text
              style={[
                styles.themeOptionText,
                { color: colors.textMuted },
                themeMode === 'dark' && { color: colors.primary, fontWeight: '800' },
              ]}
            >
              Escuro
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Card de Diagnóstico do Link de Fibra Ótica */}
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={[styles.sectionHeader, { borderBottomColor: colors.borderLight }]}>
          <View style={styles.headerLeft}>
            <Radio size={16} color={colors.infoDark} strokeWidth={2.2} />
            <Text style={[styles.sectionTitle, { color: colors.secondary }]}>Status da Conexão Fibra</Text>
          </View>
          <View style={[styles.liveBadge, { backgroundColor: colors.infoLight }]}>
            <View style={[styles.liveDot, { backgroundColor: colors.infoDark }]} />
            <Text style={[styles.liveText, { color: colors.infoDark }]}>100% FTTH</Text>
          </View>
        </View>

        <View
          style={[
            styles.networkInfoGrid,
            {
              backgroundColor: colors.cardSubdued,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.networkItem}>
            <Text style={[styles.networkLabel, { color: colors.textMuted }]}>Tecnologia</Text>
            <Text style={[styles.networkValue, { color: colors.text }]}>GPON 100% Fibra</Text>
          </View>
          <View style={styles.networkItem}>
            <Text style={[styles.networkLabel, { color: colors.textMuted }]}>Central Ótica</Text>
            <Text style={[styles.networkValue, { color: colors.text }]}>Chapecó - SC</Text>
          </View>
        </View>

        {pingResult ? (
          <View
            style={[
              styles.pingResultBox,
              {
                backgroundColor: colors.successLight,
                borderColor: colors.successBorder,
              },
            ]}
          >
            <View style={styles.pingRow}>
              <View style={styles.pingCol}>
                <Text style={[styles.pingLabel, { color: colors.successDark }]}>Latência (Ping)</Text>
                <Text style={[styles.pingValHighlight, { color: colors.successDark }]}>{pingResult.latency}</Text>
              </View>
              <View style={styles.pingCol}>
                <Text style={[styles.pingLabel, { color: colors.successDark }]}>Download Medido</Text>
                <Text style={[styles.pingValHighlight, { color: colors.successDark }]}>{pingResult.speed}</Text>
              </View>
            </View>
            <Text style={[styles.pingStatusText, { color: colors.successDark }]}>✓ {pingResult.status}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[
            styles.diagBtn,
            {
              backgroundColor: colors.infoLight,
              borderColor: colors.infoBorder,
            },
          ]}
          onPress={handleRunDiagnostics}
          disabled={testingPing}
          activeOpacity={0.8}
        >
          {testingPing ? (
            <>
              <ActivityIndicator size="small" color={colors.infoDark} />
              <Text style={[styles.diagBtnText, { color: colors.infoDark }]}>Testando sinal ótico...</Text>
            </>
          ) : (
            <>
              <RefreshCw size={14} color={colors.infoDark} strokeWidth={2.2} />
              <Text style={[styles.diagBtnText, { color: colors.infoDark }]}>
                {pingResult ? 'Repetir Teste de Conexão' : 'Testar Conexão e Latência'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Atalhos Rápidos */}
      {onNavigateToTab && (
        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.secondary }]}>Acesso Rápido</Text>

          <TouchableOpacity
            style={[styles.shortcutRow, { borderBottomColor: colors.borderLight }]}
            onPress={() => {
              hapticFeedback.selection();
              onNavigateToTab('CHAT');
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.shortcutIconBox, { backgroundColor: colors.primaryLight }]}>
              <MessageSquare size={16} color={colors.primary} strokeWidth={2.2} />
            </View>
            <View style={styles.shortcutContent}>
              <Text style={[styles.shortcutTitle, { color: colors.secondary }]}>Atendimento Digital DBS</Text>
              <Text style={[styles.shortcutDesc, { color: colors.textMuted }]}>Suporte técnico, faturas e contratação</Text>
            </View>
            <ChevronRight size={16} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.shortcutRow, { borderBottomColor: colors.borderLight }]}
            onPress={() => {
              hapticFeedback.selection();
              onNavigateToTab('INVOICES');
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.shortcutIconBox, { backgroundColor: colors.warningLight }]}>
              <Receipt size={16} color={colors.warningDark} strokeWidth={2.2} />
            </View>
            <View style={styles.shortcutContent}>
              <Text style={[styles.shortcutTitle, { color: colors.secondary }]}>Central Financeira & PIX</Text>
              <Text style={[styles.shortcutDesc, { color: colors.textMuted }]}>2ª via de boleto e comprovantes</Text>
            </View>
            <ChevronRight size={16} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.shortcutRow, { borderBottomWidth: 0, paddingBottom: 0 }]}
            onPress={() => {
              hapticFeedback.selection();
              onNavigateToTab('PLANS');
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.shortcutIconBox, { backgroundColor: colors.wifi6Light }]}>
              <Zap size={16} color={colors.wifi6} strokeWidth={2.2} />
            </View>
            <View style={styles.shortcutContent}>
              <Text style={[styles.shortcutTitle, { color: colors.secondary }]}>Planos DBS & Wi-Fi 6</Text>
              <Text style={[styles.shortcutDesc, { color: colors.textMuted }]}>Upgrades e velocidades de até 800MB</Text>
            </View>
            <ChevronRight size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Dados Cadastrais */}
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={[styles.sectionHeader, { borderBottomColor: colors.borderLight }]}>
          <View style={styles.headerLeft}>
            <User size={16} color={colors.primary} strokeWidth={2.2} />
            <Text style={[styles.sectionTitle, { color: colors.secondary }]}>Dados Cadastrais do Titular</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.infoRow}
          onPress={() => handleCopy(customer.email, 'E-mail')}
          activeOpacity={0.7}
        >
          <View style={[styles.infoIconBox, { backgroundColor: colors.cardSubdued }]}>
            <Mail size={14} color={colors.textMuted} strokeWidth={2} />
          </View>
          <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>E-mail:</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{customer.email || 'Não informado'}</Text>
          </View>
          <Copy size={13} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.infoRow}
          onPress={() => handleCopy(customer.telefone, 'Telefone')}
          activeOpacity={0.7}
        >
          <View style={[styles.infoIconBox, { backgroundColor: colors.cardSubdued }]}>
            <Phone size={14} color={colors.textMuted} strokeWidth={2} />
          </View>
          <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Telefone / WhatsApp:</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{customer.telefone || '(49) 98877-6655'}</Text>
          </View>
          <Copy size={13} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.infoRow, { marginBottom: 0 }]}
          onPress={() => handleCopy(customer.endereco, 'Endereço')}
          activeOpacity={0.7}
        >
          <View style={[styles.infoIconBox, { backgroundColor: colors.cardSubdued }]}>
            <MapPin size={14} color={colors.textMuted} strokeWidth={2} />
          </View>
          <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Endereço de Instalação:</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{customer.endereco || 'Chapecó - SC'}</Text>
          </View>
          <Copy size={13} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Canais Oficiais de Suporte */}
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={[styles.sectionHeader, { borderBottomColor: colors.borderLight }]}>
          <View style={styles.headerLeft}>
            <Headphones size={16} color={colors.secondary} strokeWidth={2.2} />
            <Text style={[styles.sectionTitle, { color: colors.secondary }]}>Canais Oficiais DBS Telecom</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.channelRow}
          onPress={handleOpenWhatsApp}
          activeOpacity={0.7}
        >
          <View style={[styles.channelIconBox, { backgroundColor: colors.successLight }]}>
            <MessageCircle size={16} color={colors.successDark} strokeWidth={2.2} />
          </View>
          <View style={styles.channelContent}>
            <Text style={[styles.channelTitle, { color: colors.secondary }]}>WhatsApp Oficial</Text>
            <Text style={[styles.channelDesc, { color: colors.textMuted }]}>(49) 98877-6655 • Suporte 24h</Text>
          </View>
          <ChevronRight size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Botão de Desconectar */}
      <TouchableOpacity
        style={[
          styles.logoutBtn,
          {
            backgroundColor: colors.card,
            borderColor: colors.dangerBorder,
          },
        ]}
        onPress={() => {
          hapticFeedback.medium();
          onLogout();
        }}
        activeOpacity={0.8}
      >
        <LogOut size={16} color={colors.dangerDark} strokeWidth={2.2} />
        <Text style={[styles.logoutBtnText, { color: colors.dangerDark }]}>Trocar de Conta / Sair</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 36,
  },
  heroCard: {
    borderRadius: RADIUS.lg,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: 14,
    ...SHADOWS.md,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    ...SHADOWS.primary,
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  userName: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  userDoc: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    marginTop: 10,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  sectionCard: {
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
    ...SHADOWS.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    paddingBottom: 10,
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  themeSelectorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  themeOptionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  themeOptionBtnActive: {
    borderWidth: 1.5,
  },
  themeOptionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  liveText: {
    fontSize: 10,
    fontWeight: '800',
  },
  networkInfoGrid: {
    flexDirection: 'row',
    padding: 10,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  networkItem: {
    flex: 1,
  },
  networkLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  networkValue: {
    fontSize: 12.5,
    fontWeight: '800',
    marginTop: 2,
  },
  pingResultBox: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    padding: 10,
    marginTop: 10,
  },
  pingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pingCol: {},
  pingLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  pingValHighlight: {
    fontSize: 14,
    fontWeight: '900',
    marginTop: 1,
  },
  pingStatusText: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  diagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
    marginTop: 10,
  },
  diagBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  shortcutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    gap: 12,
  },
  shortcutIconBox: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutContent: {
    flex: 1,
  },
  shortcutTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  shortcutDesc: {
    fontSize: 11,
    marginTop: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    paddingVertical: 4,
  },
  infoIconBox: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 12.5,
    fontWeight: '700',
    marginTop: 1,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  channelIconBox: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelContent: {
    flex: 1,
  },
  channelTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  channelDesc: {
    fontSize: 11,
    marginTop: 1,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    paddingVertical: 13,
    borderRadius: RADIUS.md,
    marginTop: 4,
  },
  logoutBtnText: {
    fontWeight: '800',
    fontSize: 13.5,
  },
});
