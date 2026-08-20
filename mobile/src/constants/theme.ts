export const LIGHT_COLORS = {
  // Brand Primary (DBS Telecom Manual de Marca: Laranja Vibrante #F84B03 & Laranja #FB8200)
  primary: '#F84B03',
  primaryHover: '#E04100',
  primaryDark: '#C93800',
  primaryDeep: '#A12A00',
  primaryOrange: '#FB8200',
  primaryLight: '#FFF1EB',
  primaryUltraLight: '#FFF8F5',
  primaryBorder: '#FED7C7',
  primaryGlow: 'rgba(248, 75, 3, 0.15)',

  // Brand Secondary & Cinza Escuro (#4B4C51)
  secondary: '#1E293B',
  secondaryLight: '#334155',
  secondaryMuted: '#4B4C51',
  slateDark: '#4B4C51',
  slateMedium: '#64748B',
  slateLight: '#94A3B8',

  // Backgrounds & Surface Elevation
  background: '#F8FAFC',
  backgroundAlt: '#F1F5F9',
  card: '#FFFFFF',
  cardSubdued: '#F8FAFC',
  cardElevated: '#FFFFFF',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  borderDark: '#CBD5E1',

  // Text Hierarchy
  text: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#64748B',
  textSubtle: '#94A3B8',
  white: '#FFFFFF',

  // Status & Utility Colors
  success: '#10B981',
  successDark: '#059669',
  successLight: '#ECFDF5',
  successBorder: '#A7F3D0',

  warning: '#F59E0B',
  warningDark: '#D97706',
  warningLight: '#FFFBEB',
  warningBorder: '#FDE68A',

  info: '#0284C7',
  infoDark: '#0369A1',
  infoLight: '#F0F9FF',
  infoBorder: '#BAE6FD',

  danger: '#EF4444',
  dangerDark: '#DC2626',
  dangerLight: '#FEF2F2',
  dangerBorder: '#FECACA',

  // Wi-Fi 6 & Tech Accents
  wifi6: '#6366F1',
  wifi6Dark: '#4F46E5',
  wifi6Light: '#EEF2FF',
  wifi6Border: '#C7D2FE',
};

export const DARK_COLORS: typeof LIGHT_COLORS = {
  // Brand Primary Adaptado para Dark Mode
  primary: '#F84B03',
  primaryHover: '#FF5E1E',
  primaryDark: '#FF6D33',
  primaryDeep: '#FF8252',
  primaryOrange: '#FB8200',
  primaryLight: '#381C12',
  primaryUltraLight: '#26140D',
  primaryBorder: '#5E2816',
  primaryGlow: 'rgba(248, 75, 3, 0.35)',

  // Brand Secondary & Cinza Escuro (#4B4C51) do Manual de Marca
  secondary: '#F8FAFC',
  secondaryLight: '#E2E8F0',
  secondaryMuted: '#94A3B8',
  slateDark: '#4B4C51',
  slateMedium: '#64748B',
  slateLight: '#94A3B8',

  // Dark Surfaces com Base no Cinza Escuro DBS #4B4C51
  background: '#121316',
  backgroundAlt: '#1A1B21',
  card: '#1E1F26',
  cardSubdued: '#282932',
  cardElevated: '#32343E',
  border: '#3A3B44',
  borderLight: '#2C2D36',
  borderDark: '#4B4C51',

  // Text Hierarchy Dark
  text: '#F8FAFC',
  textSecondary: '#E2E8F0',
  textMuted: '#94A3B8',
  textSubtle: '#64748B',
  white: '#FFFFFF',

  // Status & Utility Dark
  success: '#10B981',
  successDark: '#34D399',
  successLight: '#0F291E',
  successBorder: '#1A4D38',

  warning: '#F59E0B',
  warningDark: '#FBBF24',
  warningLight: '#2B200E',
  warningBorder: '#4D3B16',

  info: '#38BDF8',
  infoDark: '#60A5FA',
  infoLight: '#102436',
  infoBorder: '#1D4566',

  danger: '#F87171',
  dangerDark: '#FCA5A5',
  dangerLight: '#2F1515',
  dangerBorder: '#542222',

  // Wi-Fi 6 & Tech Accents Dark
  wifi6: '#818CF8',
  wifi6Dark: '#A5B4FC',
  wifi6Light: '#1E1E38',
  wifi6Border: '#363666',
};

// Fallback padrão para manter compatibilidade
export const COLORS = LIGHT_COLORS;

export function getThemeColors(isDark: boolean): typeof LIGHT_COLORS {
  return isDark ? DARK_COLORS : LIGHT_COLORS;
}

export const SHADOWS = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
  },
  primary: {
    shadowColor: '#F84B03',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 4,
  },
  success: {
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
};

export const RADIUS = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  full: 9999,
};

export const DEPARTMENTS = {
  GERAL: {
    name: 'Atendimento Digital DBS',
    subtitle: 'Central do Assinante & Informações',
    color: '#F84B03',
    bgColor: '#FFF1EB',
    borderColor: '#FED7C7',
    badgeText: 'Davi • Assistente Oficial',
  },
  COMERCIAL: {
    name: 'Comercial & Planos',
    subtitle: 'Fibra Ótica, Upgrades & Wi-Fi 6',
    color: '#059669',
    bgColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    badgeText: 'Consultor de Planos',
  },
  SUPORTE: {
    name: 'Suporte Técnico Nível 1',
    subtitle: 'Diagnóstico & Conexão Fibra',
    color: '#0284C7',
    bgColor: '#F0F9FF',
    borderColor: '#BAE6FD',
    badgeText: 'Especialista em Conexão',
  },
  FINANCEIRO: {
    name: 'Central Financeira',
    subtitle: '2ª Via de Fatura, Boletos & PIX',
    color: '#D97706',
    bgColor: '#FFFBEB',
    borderColor: '#FDE68A',
    badgeText: 'Faturamento & Pagamentos',
  },
};

export const DARK_DEPARTMENTS: typeof DEPARTMENTS = {
  GERAL: {
    name: 'Atendimento Digital DBS',
    subtitle: 'Central do Assinante & Informações',
    color: '#F84B03',
    bgColor: '#381C12',
    borderColor: '#5E2816',
    badgeText: 'Davi • Assistente Oficial',
  },
  COMERCIAL: {
    name: 'Comercial & Planos',
    subtitle: 'Fibra Ótica, Upgrades & Wi-Fi 6',
    color: '#34D399',
    bgColor: '#0F291E',
    borderColor: '#1A4D38',
    badgeText: 'Consultor de Planos',
  },
  SUPORTE: {
    name: 'Suporte Técnico Nível 1',
    subtitle: 'Diagnóstico & Conexão Fibra',
    color: '#38BDF8',
    bgColor: '#102436',
    borderColor: '#1D4566',
    badgeText: 'Especialista em Conexão',
  },
  FINANCEIRO: {
    name: 'Central Financeira',
    subtitle: '2ª Via de Fatura, Boletos & PIX',
    color: '#FBBF24',
    bgColor: '#2B200E',
    borderColor: '#4D3B16',
    badgeText: 'Faturamento & Pagamentos',
  },
};

export function getThemeDepartments(isDark: boolean): typeof DEPARTMENTS {
  return isDark ? DARK_DEPARTMENTS : DEPARTMENTS;
}
