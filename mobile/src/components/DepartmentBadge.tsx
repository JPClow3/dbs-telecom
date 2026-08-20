import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RADIUS, SHADOWS } from '../constants/theme';
import { DepartmentType } from '../types';
import { MessageSquare, ShoppingBag, Wrench, CreditCard } from 'lucide-react-native';
import { useAppTheme } from '../context/ThemeContext';

interface DepartmentBadgeProps {
  department?: DepartmentType;
}

export const DepartmentBadge: React.FC<DepartmentBadgeProps> = ({ department = 'GERAL' }) => {
  const { departments, colors, isDark } = useAppTheme();
  const dept = departments[department] || departments.GERAL;

  const renderIcon = () => {
    switch (department) {
      case 'COMERCIAL':
        return <ShoppingBag size={14} color={dept.color} strokeWidth={2.2} />;
      case 'SUPORTE':
        return <Wrench size={14} color={dept.color} strokeWidth={2.2} />;
      case 'FINANCEIRO':
        return <CreditCard size={14} color={dept.color} strokeWidth={2.2} />;
      default:
        return <MessageSquare size={14} color={dept.color} strokeWidth={2.2} />;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: dept.bgColor, borderColor: dept.borderColor }]}>
      <View style={[styles.iconCircle, { backgroundColor: dept.color + '22' }]}>
        {renderIcon()}
      </View>
      <View style={styles.textContainer}>
        <Text style={[styles.overline, { color: colors.textMuted }]}>Canal em Atendimento</Text>
        <Text style={[styles.name, { color: dept.color }]}>{dept.name}</Text>
      </View>
      <View style={[styles.badgePill, { backgroundColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255, 255, 255, 0.85)' }]}>
        <View style={[styles.pulseDot, { backgroundColor: dept.color }]} />
        <Text style={[styles.badgeText, { color: dept.color }]}>Online</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginHorizontal: 16,
    marginVertical: 6,
    gap: 10,
    ...SHADOWS.sm,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
  },
  overline: {
    fontSize: 9,
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  name: {
    fontSize: 12.5,
    fontWeight: '800',
    marginTop: 0.5,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  pulseDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
});
