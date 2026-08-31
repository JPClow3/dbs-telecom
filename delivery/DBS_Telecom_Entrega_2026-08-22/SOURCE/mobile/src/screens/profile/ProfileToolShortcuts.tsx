import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Activity, Bell, ChevronRight, Gauge, Gift, Wifi } from 'lucide-react-native';
import { hapticFeedback } from '../../utils/haptics';
import { ProfileColors } from './types';
import { styles } from './styles';

interface ProfileToolShortcutsProps {
  colors: ProfileColors;
  onOpenSpeedTest: () => void;
  onOpenWifi: () => void;
  onOpenOptical: () => void;
  onOpenReferral: () => void;
  onOpenNotifications: () => void;
}

interface ToolShortcutProps {
  colors: ProfileColors;
  icon: React.ReactNode;
  title: string;
  description: string;
  accessibilityLabel: string;
  onPress: () => void;
}

const ToolShortcut: React.FC<ToolShortcutProps> = ({
  colors,
  icon,
  title,
  description,
  accessibilityLabel,
  onPress,
}) => (
  <TouchableOpacity
    style={[
      styles.speedTestEntry,
      {
        backgroundColor: colors.card,
        borderColor: colors.border,
      },
    ]}
    onPress={onPress}
    activeOpacity={0.85}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
  >
    <View style={[styles.speedTestIcon, { backgroundColor: colors.primaryUltraLight }]}>{icon}</View>
    <View style={{ flex: 1 }}>
      <Text style={[styles.speedTestTitle, { color: colors.secondary }]}>{title}</Text>
      <Text style={[styles.speedTestDesc, { color: colors.textMuted }]}>{description}</Text>
    </View>
    <ChevronRight size={18} color={colors.textMuted} />
  </TouchableOpacity>
);

export const ProfileToolShortcuts: React.FC<ProfileToolShortcutsProps> = ({
  colors,
  onOpenSpeedTest,
  onOpenWifi,
  onOpenOptical,
  onOpenReferral,
  onOpenNotifications,
}) => (
  <>
    <ToolShortcut
      colors={colors}
      icon={<Gauge size={22} color={colors.primary} strokeWidth={2.2} />}
      title="Teste de Velocidade Real"
      description="Download, Upload, Ping e Jitter em tempo real"
      accessibilityLabel="Abrir teste de velocidade local"
      onPress={() => {
        hapticFeedback.medium();
        onOpenSpeedTest();
      }}
    />
    <ToolShortcut
      colors={colors}
      icon={<Wifi size={22} color={colors.primary} strokeWidth={2.2} />}
      title="Gerenciador Wi-Fi & Visitas"
      description="Alterar senhas, redes 2.4/5GHz e QR Code para visitas"
      accessibilityLabel="Abrir gerenciador de Wi-Fi"
      onPress={() => {
        hapticFeedback.medium();
        onOpenWifi();
      }}
    />
    <ToolShortcut
      colors={colors}
      icon={<Activity size={22} color={colors.primary} strokeWidth={2.2} />}
      title="Telemetria de Sinal Ótico"
      description="Aferição de potência RX/TX na porta PON da ONU"
      accessibilityLabel="Abrir telemetria de sinal ótico"
      onPress={() => {
        hapticFeedback.medium();
        onOpenOptical();
      }}
    />
    <ToolShortcut
      colors={colors}
      icon={<Gift size={22} color={colors.primary} strokeWidth={2.2} />}
      title="Indique e Ganhe 50% OFF"
      description="Extrato de indicações e descontos na fatura"
      accessibilityLabel="Abrir programa Indique e Ganhe"
      onPress={() => {
        hapticFeedback.medium();
        onOpenReferral();
      }}
    />
    <ToolShortcut
      colors={colors}
      icon={<Bell size={22} color={colors.primary} strokeWidth={2.2} />}
      title="Central de Notificações"
      description="Lembretes de fatura, manutenções e avisos de O.S."
      accessibilityLabel="Abrir central de notificações"
      onPress={() => {
        hapticFeedback.medium();
        onOpenNotifications();
      }}
    />
  </>
);
