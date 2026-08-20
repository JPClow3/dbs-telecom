import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Copy, Headphones, Mail, MapPin, MessageCircle, Phone, User, ChevronRight, LogOut } from 'lucide-react-native';
import { Customer } from '../../types';
import { hapticFeedback } from '../../utils/haptics';
import { ProfileColors } from './types';
import { styles } from './styles';

interface ProfileAccountSectionProps {
  customer: Customer;
  colors: ProfileColors;
  onCopy: (text: string, label: string) => void;
  onOpenWhatsApp: () => void;
  onLogout: () => void;
}

export const ProfileAccountSection: React.FC<ProfileAccountSectionProps> = ({
  customer,
  colors,
  onCopy,
  onOpenWhatsApp,
  onLogout,
}) => (
  <>
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
        onPress={() => onCopy(customer.email, 'E-mail')}
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
        onPress={() => onCopy(customer.telefone, 'Telefone')}
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
        onPress={() => onCopy(customer.endereco, 'Endereço')}
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

      <TouchableOpacity style={styles.channelRow} onPress={onOpenWhatsApp} activeOpacity={0.7}>
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
  </>
);
