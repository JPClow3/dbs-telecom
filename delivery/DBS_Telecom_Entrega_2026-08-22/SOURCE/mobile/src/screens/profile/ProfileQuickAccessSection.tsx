import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { ChevronRight, MessageSquare, Receipt, Wrench, Zap } from 'lucide-react-native';
import { hapticFeedback } from '../../utils/haptics';
import { ProfileColors } from './types';
import { styles } from './styles';

type ProfileTab = 'CHAT' | 'INVOICES' | 'PLANS' | 'PROFILE';

interface ProfileQuickAccessSectionProps {
  colors: ProfileColors;
  onNavigateToTab: (tab: ProfileTab) => void;
  onOpenTickets: () => void;
}

export const ProfileQuickAccessSection: React.FC<ProfileQuickAccessSectionProps> = ({
  colors,
  onNavigateToTab,
  onOpenTickets,
}) => (
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
      style={[styles.shortcutRow, { borderBottomColor: colors.borderLight }]}
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

    <TouchableOpacity
      style={[styles.shortcutRow, { borderBottomWidth: 0, paddingBottom: 0 }]}
      onPress={() => {
        hapticFeedback.selection();
        onOpenTickets();
      }}
      activeOpacity={0.7}
    >
      <View style={[styles.shortcutIconBox, { backgroundColor: colors.infoLight }]}>
        <Wrench size={16} color={colors.infoDark} strokeWidth={2.2} />
      </View>
      <View style={styles.shortcutContent}>
        <Text style={[styles.shortcutTitle, { color: colors.secondary }]}>Chamados & Ordens de Serviço (O.S.)</Text>
        <Text style={[styles.shortcutDesc, { color: colors.textMuted }]}>Acompanhar visitas técnicas e histórico</Text>
      </View>
      <ChevronRight size={16} color={colors.textMuted} />
    </TouchableOpacity>
  </View>
);
