import React from 'react';
import { Text, View } from 'react-native';
import { AlertCircle, CheckCircle2 } from 'lucide-react-native';
import { Customer } from '../../types';
import { ProfileColors } from './types';
import { styles } from './styles';

interface ProfileHeroProps {
  customer: Customer;
  colors: ProfileColors;
}

export const ProfileHero: React.FC<ProfileHeroProps> = ({ customer, colors }) => (
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
          borderColor: customer.isDemo ? colors.warningBorder : colors.successBorder,
          ...(customer.isDemo ? { backgroundColor: colors.warningLight } : {}),
        },
      ]}
    >
      {customer.isDemo ? (
        <AlertCircle size={12} color={colors.warningDark} strokeWidth={2.5} />
      ) : (
        <CheckCircle2 size={12} color={colors.successDark} strokeWidth={2.5} />
      )}
      <Text style={[styles.statusText, { color: customer.isDemo ? colors.warningDark : colors.successDark }]}>
        {customer.isDemo
          ? `Ambiente de demonstração — cadastro não confirmado (ID #${customer.id})`
          : `Assinante Ativo DBS Fibra (ID #${customer.id})`}
      </Text>
    </View>
  </View>
);
