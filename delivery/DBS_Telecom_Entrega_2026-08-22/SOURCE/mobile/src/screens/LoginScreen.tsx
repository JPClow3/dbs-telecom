import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Linking,
} from 'react-native';
import { SHADOWS, RADIUS } from '../constants/theme';
import { apiService, setAuthToken, startDemoMode } from '../services/api';
import { storageService } from '../services/storage';
import { biometricsService, BiometricCapability } from '../services/biometrics';
import { useAppTheme } from '../context/ThemeContext';
import { hapticFeedback } from '../utils/haptics';
import { AuthSession, Customer } from '../types';
import {
  ShieldCheck,
  ArrowRight,
  User,
  Lock,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  MessageCircle,
  X,
  Fingerprint,
  ScanFace,
} from 'lucide-react-native';

interface LoginScreenProps {
  onLoginSuccess: (customer: Customer) => void;
}

// A demo shortcut is intentionally unavailable in production builds. It only
// fills development test credentials; it never bypasses the live login token.
const DEMO_SHORTCUT_ENABLED =
  typeof __DEV__ !== 'undefined' &&
  __DEV__ === true &&
  (process.env as Record<string, string | undefined>)?.EXPO_PUBLIC_DEMO_MODE === 'true';

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const { colors, isDark } = useAppTheme();
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [password, setPassword] = useState('');
  const [passwordManuallyEdited, setPasswordManuallyEdited] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [biometricCap, setBiometricCap] = useState<BiometricCapability | null>(null);
  const [savedBioSession, setSavedBioSession] = useState<AuthSession | null>(null);

  // 🔐 Verifica capacidade biométrica ao carregar a tela
  useEffect(() => {
    const initBiometrics = async () => {
      const cap = await biometricsService.checkCapabilities();
      setBiometricCap(cap);
      if (cap.available) {
        const session = await biometricsService.getBiometricSession();
        setSavedBioSession(session);
      }
    };
    initBiometrics();
  }, []);

  const handleTextChange = (text: string) => {
    setErrorMessage('');
    const clean = text.replace(/\D/g, '');
    if (clean.length <= 11) {
      // Máscara de CPF: 000.000.000-00
      let formatted = clean;
      if (clean.length > 9) {
        formatted = `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9, 11)}`;
      } else if (clean.length > 6) {
        formatted = `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6)}`;
      } else if (clean.length > 3) {
        formatted = `${clean.slice(0, 3)}.${clean.slice(3)}`;
      }
      setCpfCnpj(formatted);
      if (!passwordManuallyEdited) {
        setPassword(clean);
      }
    } else if (clean.length <= 14) {
      // Máscara de CNPJ: 00.000.000/0000-00
      let formatted = clean;
      if (clean.length > 12) {
        formatted = `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12, 14)}`;
      } else if (clean.length > 8) {
        formatted = `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8)}`;
      } else if (clean.length > 5) {
        formatted = `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5)}`;
      } else if (clean.length > 2) {
        formatted = `${clean.slice(0, 2)}.${clean.slice(2)}`;
      }
      setCpfCnpj(formatted);
      if (!passwordManuallyEdited) {
        setPassword(clean);
      }
    } else {
      setCpfCnpj(text);
    }
  };

  const handleClearCpf = () => {
    hapticFeedback.light();
    setCpfCnpj('');
    if (!passwordManuallyEdited) {
      setPassword('');
    }
  };

  const handleLogin = async (docToUse?: string, passToUse?: string) => {
    hapticFeedback.medium();
    const doc = docToUse || cpfCnpj;
    const pass = passToUse !== undefined ? passToUse : (password || doc);

    if (!doc) {
      hapticFeedback.warning();
      setErrorMessage('Por favor, digite o CPF ou CNPJ do titular.');
      return;
    }

    // Validação básica de comprimento antes de chamar o servidor: evita
    // requisições fadadas a falhar e dá feedback imediato ao usuário.
    const digits = doc.replace(/\D/g, '');
    if (digits.length !== 11 && digits.length !== 14) {
      hapticFeedback.warning();
      setErrorMessage('Digite um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const res = await apiService.loginClient(doc, pass);
      if (res.found && res.authenticated && res.token && res.client) {
        hapticFeedback.success();
        // The customer is not an authentication proof; persist the signed token
        // and customer atomically before entering the authenticated tree.
        await storageService.saveAuthSession({
          customer: res.client,
          token: res.token,
          mode: res.mode === 'demo' || res.client.isDemo ? 'demo' : 'live',
        });
        // Habilita biometria por padrão se disponível
        if (biometricCap?.available) {
          await biometricsService.enableForCustomer();
        }
        onLoginSuccess(res.client);
      } else {
        hapticFeedback.error();
        setErrorMessage(
          res.found
            ? 'O servidor não retornou uma sessão válida. Digite suas credenciais novamente.'
            : 'Credenciais inválidas ou cliente não localizado. Verifique o CPF e a senha.'
        );
      }
    } catch (e: any) {
      hapticFeedback.error();
      setErrorMessage(e?.message || 'Erro de conexão com o sistema da DBS Telecom. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // 🔐 Autenticação Biométrica Rápida
  const handleBiometricLogin = async () => {
    hapticFeedback.medium();
    if (!savedBioSession) {
      setErrorMessage('A sessão biométrica expirou. Digite seu CPF e senha para entrar novamente.');
      return;
    }

    const result = await biometricsService.authenticate(
      savedBioSession
        ? `Olá, ${savedBioSession.customer.nome}! Confirme sua identidade para entrar`
        : 'Confirme sua biometria para acessar a DBS Telecom'
    );

    if (result.success) {
      hapticFeedback.success();
      const session = await biometricsService.getBiometricSession();
      if (!session) {
        await storageService.clearAuthSession();
        await biometricsService.disable();
        setSavedBioSession(null);
        setErrorMessage('A sessão biométrica expirou. Digite seu CPF e senha para entrar novamente.');
        return;
      }

      // Biometric re-auth may restore a complete token-backed session only. It
      // must never turn an identity-only record into an authenticated session.
      setAuthToken(session.token);
      onLoginSuccess(session.customer);
    } else if (result.error) {
      hapticFeedback.warning();
      setErrorMessage('Biometria não validada. Digite seu CPF e senha para entrar.');
    }
  };

  const handleQuickDemoLogin = () => {
    if (!DEMO_SHORTCUT_ENABLED) return;
    hapticFeedback.light();
    const demoDoc = '154.293.707-89';
    const demoPass = '15429370789';
    setCpfCnpj(demoDoc);
    setPassword(demoPass);
    try {
      const demoCustomer = startDemoMode();
      setErrorMessage('Modo DEMO local ativo. Dados e ações nesta sessão são simulados.');
      onLoginSuccess(demoCustomer);
    } catch (e: any) {
      setErrorMessage(e?.message || 'A demonstração local está desabilitada.');
    }
  };

  const handleWhatsAppContact = () => {
    hapticFeedback.light();
    const url = 'https://wa.me/5549988776655?text=Ol%C3%A1!%20Gostaria%20de%20informa%C3%A7%C3%B5es%20sobre%20a%20DBS%20Telecom.';
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => {});
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Cabeçalho da Marca */}
        <View style={styles.header}>
          <View
            style={[
              styles.logoBadge,
              {
                backgroundColor: isDark ? colors.cardSubdued : colors.white,
                borderColor: colors.border,
              },
            ]}
          >
            <Image
              source={require('../../assets/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <View style={styles.titleRow}>
            <Text style={[styles.brandTitle, { color: colors.secondary }]}>DBS</Text>
            <Text style={[styles.brandTitleAccent, { color: colors.primary }]}>TELECOM</Text>
          </View>
          <Text style={[styles.tagline, { color: colors.textMuted }]}>
            Central do Assinante & Atendimento Digital
          </Text>
        </View>

        {/* Card Principal de Login */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.secondary }]}>Acesse sua Conta</Text>
            <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
              Digite seu CPF/CNPJ cadastrado para consultar faturas, suporte e planos.
            </Text>
          </View>

          {/* Campo CPF */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
              CPF OU CNPJ DO TITULAR
            </Text>
            <View
              style={[
                styles.inputWrapper,
                {
                  backgroundColor: colors.cardSubdued,
                  borderColor: colors.border,
                },
              ]}
            >
              <User size={18} color={colors.textMuted} strokeWidth={2} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="000.000.000-00"
                placeholderTextColor={colors.textSubtle}
                value={cpfCnpj}
                onChangeText={handleTextChange}
                keyboardType="numeric"
                maxLength={18}
                autoCapitalize="none"
              />
              {cpfCnpj.length > 0 && (
                <TouchableOpacity onPress={handleClearCpf} style={styles.clearBtn} activeOpacity={0.7}>
                  <X size={15} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Campo Senha */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>SENHA DE ACESSO</Text>
              <Text style={[styles.inputHint, { color: isDark ? '#FFA07A' : colors.primaryDark }]}>
                Padrão: CPF (sem pontos)
              </Text>
            </View>
            <View
              style={[
                styles.inputWrapper,
                {
                  backgroundColor: colors.cardSubdued,
                  borderColor: colors.border,
                },
              ]}
            >
              <Lock size={18} color={colors.textMuted} strokeWidth={2} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Digite sua senha"
                placeholderTextColor={colors.textSubtle}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setPasswordManuallyEdited(true);
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => {
                  hapticFeedback.light();
                  setShowPassword(!showPassword);
                }}
                style={styles.eyeBtn}
                activeOpacity={0.7}
              >
                {showPassword ? (
                  <EyeOff size={18} color={colors.textMuted} />
                ) : (
                  <Eye size={18} color={colors.textMuted} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {errorMessage ? (
            <View
              style={[
                styles.errorBox,
                {
                  backgroundColor: colors.dangerLight,
                  borderColor: colors.dangerBorder,
                },
              ]}
            >
              <AlertCircle size={15} color={colors.dangerDark} strokeWidth={2.2} />
              <Text style={[styles.errorText, { color: colors.dangerDark }]}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* Botão Principal de Login */}
          <TouchableOpacity
            style={[styles.loginBtn, { backgroundColor: colors.primary }]}
            onPress={() => handleLogin()}
            disabled={loading}
            activeOpacity={0.85}
            testID="login-btn"
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.loginBtnText}>Entrar na Minha Conta</Text>
                <ArrowRight size={18} color="#FFFFFF" strokeWidth={2.5} />
              </>
            )}
          </TouchableOpacity>

          {/* 🔐 Botão de Login com Biometria (FaceID / Fingerprint) */}
          {biometricCap?.available && savedBioSession && (
            <TouchableOpacity
              style={[
                styles.biometricBtn,
                {
                  backgroundColor: colors.cardSubdued,
                  borderColor: colors.border,
                },
              ]}
              onPress={handleBiometricLogin}
              activeOpacity={0.8}
              testID="biometric-login-btn"
              accessibilityRole="button"
            >
              {biometricCap?.biometryType === 'FACIAL_RECOGNITION' ? (
                <ScanFace size={20} color={colors.primary} strokeWidth={2.2} />
              ) : (
                <Fingerprint size={20} color={colors.primary} strokeWidth={2.2} />
              )}
              <Text style={[styles.biometricBtnText, { color: colors.text }]}>
                {`Entrar como ${savedBioSession.customer.nome.split(' ')[0]} (${biometricCap.label || 'Biometria'})`}
              </Text>
            </TouchableOpacity>
          )}

          {/* Atalho Discreto para Testes / Demonstração */}
          {DEMO_SHORTCUT_ENABLED && (
            <TouchableOpacity
              style={[
                styles.demoHelper,
                {
                  backgroundColor: colors.primaryUltraLight,
                  borderColor: colors.primaryBorder,
                },
              ]}
              onPress={handleQuickDemoLogin}
              activeOpacity={0.7}
              testID="demo-login-btn"
              accessibilityRole="button"
            >
              <Sparkles size={13} color={colors.primary} strokeWidth={2.2} />
              <Text style={[styles.demoHelperText, { color: colors.textSecondary }]}>{''}
                Demonstração local (não é uma autenticação) <Text style={[styles.demoHelperBold, { color: isDark ? '#FFA07A' : colors.primaryDark }]}>{''}
                  • preencher dados de teste
                </Text>
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Rodapé com Suporte e Segurança */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.supportLink} onPress={handleWhatsAppContact} activeOpacity={0.7}>
            <MessageCircle size={15} color={isDark ? '#FFA07A' : colors.primaryDark} strokeWidth={2.2} />
            <Text style={[styles.supportLinkText, { color: isDark ? '#FFA07A' : colors.primaryDark }]}>
              Precisa de ajuda para acessar? Fale no WhatsApp
            </Text>
          </TouchableOpacity>

          <View style={styles.securityBadge}>
            <ShieldCheck size={13} color={colors.textSubtle} strokeWidth={2} />
            <Text style={[styles.securityText, { color: colors.textSubtle }]}>
              Ambiente Seguro • DBS Telecom Fibra Ótica
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoBadge: {
    width: 76,
    height: 76,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    ...SHADOWS.md,
    marginBottom: 12,
  },
  logo: {
    width: 54,
    height: 54,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  brandTitleAccent: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  tagline: {
    fontSize: 12.5,
    marginTop: 4,
    fontWeight: '500',
  },
  card: {
    borderRadius: RADIUS.xl,
    padding: 22,
    borderWidth: 1,
    ...SHADOWS.md,
  },
  cardHeader: {
    marginBottom: 18,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  cardSubtitle: {
    fontSize: 12.5,
    marginTop: 4,
    lineHeight: 17,
  },
  inputGroup: {
    marginBottom: 14,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 5,
  },
  inputHint: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 15,
    fontWeight: '600',
  },
  clearBtn: {
    padding: 6,
  },
  eyeBtn: {
    padding: 6,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    padding: 10,
    borderRadius: RADIUS.sm,
    marginBottom: 14,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    marginTop: 4,
    ...SHADOWS.primary,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  biometricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 13,
    borderRadius: RADIUS.md,
    marginTop: 10,
    borderWidth: 1.5,
  },
  biometricBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  demoHelper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 10,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  demoHelperText: {
    fontSize: 11.5,
  },
  demoHelperBold: {
    fontWeight: '800',
  },
  footer: {
    alignItems: 'center',
    marginTop: 20,
    gap: 10,
  },
  supportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  supportLinkText: {
    fontSize: 12,
    fontWeight: '700',
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  securityText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
