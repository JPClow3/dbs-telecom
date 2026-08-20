import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Platform,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SHADOWS, RADIUS } from './src/constants/theme';
import { ThemeProvider, useAppTheme } from './src/context/ThemeContext';
import { Header } from './src/components/Header';
import { OfflineBanner } from './src/components/OfflineBanner';
import { LoginScreen } from './src/screens/LoginScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { InvoicesScreen } from './src/screens/InvoicesScreen';
import { PlansScreen } from './src/screens/PlansScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { storageService } from './src/services/storage';
import { hapticFeedback } from './src/utils/haptics';
import { Customer, DBSPlan } from './src/types';
import { MessageSquare, Receipt, Zap, User } from 'lucide-react-native';

type TabType = 'CHAT' | 'INVOICES' | 'PLANS' | 'PROFILE';

function MainApp() {
  const { colors, isDark } = useAppTheme();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('CHAT');
  const [selectedPlanForChat, setSelectedPlanForChat] = useState<DBSPlan | null>(null);

  // 💾 Restauração automática da sessão salva no AsyncStorage ao abrir o app
  useEffect(() => {
    async function restoreSession() {
      try {
        const savedCustomer = await storageService.getAuthCustomer();
        if (savedCustomer) {
          setCustomer(savedCustomer);
        }
      } catch (e) {
        console.warn('Erro ao restaurar sessão:', e);
      } finally {
        setIsInitializing(false);
      }
    }
    restoreSession();
  }, []);

  const handleSelectPlan = (plan: DBSPlan) => {
    hapticFeedback.selection();
    setSelectedPlanForChat(plan);
    setActiveTab('CHAT');
  };

  const handleTabChange = (tab: TabType) => {
    hapticFeedback.selection();
    setActiveTab(tab);
  };

  const handleLogout = async () => {
    hapticFeedback.medium();
    await storageService.clearAuthCustomer();
    setCustomer(null);
    setSelectedPlanForChat(null);
    setActiveTab('CHAT');
  };

  // Splash / Loading inicial enquanto verifica o AsyncStorage
  if (isInitializing) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={colors.card}
        />
        <View style={styles.splashContainer}>
          <View
            style={[
              styles.splashLogoBadge,
              {
                backgroundColor: isDark ? colors.cardSubdued : colors.white,
                borderColor: colors.border,
              },
            ]}
          >
            <Image
              source={require('./assets/logo.png')}
              style={styles.splashLogo}
              resizeMode="contain"
            />
          </View>
          <View style={styles.splashTitleRow}>
            <Text style={[styles.splashTitle, { color: colors.secondary }]}>DBS</Text>
            <Text style={[styles.splashTitleAccent, { color: colors.primary }]}>TELECOM</Text>
          </View>
          <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 24 }} />
        </View>
      </SafeAreaView>
    );
  }

  // Se não estiver logado, exibe a tela de login
  if (!customer) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={colors.card}
        />
        <OfflineBanner />
        <LoginScreen onLoginSuccess={(cust) => setCustomer(cust)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.card }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.card}
      />

      {/* 📶 Detector de Conectividade Offline */}
      <OfflineBanner />

      {/* Header Oficial DBS Telecom */}
      <Header customer={customer} onLogout={handleLogout} />

      {/* Conteúdo da Aba Ativa */}
      <View style={[styles.screenContent, { backgroundColor: colors.background }]}>
        {activeTab === 'CHAT' && (
          <ChatScreen
            customer={customer}
            selectedPlanToHire={selectedPlanForChat}
            onClearSelectedPlan={() => setSelectedPlanForChat(null)}
            onNavigateToPlans={() => handleTabChange('PLANS')}
            onNavigateToInvoices={() => handleTabChange('INVOICES')}
          />
        )}
        {activeTab === 'INVOICES' && (
          <InvoicesScreen
            customer={customer}
            onNavigateToChat={() => handleTabChange('CHAT')}
          />
        )}
        {activeTab === 'PLANS' && <PlansScreen onSelectPlan={handleSelectPlan} />}
        {activeTab === 'PROFILE' && (
          <ProfileScreen
            customer={customer}
            onLogout={handleLogout}
            onNavigateToTab={(tab) => handleTabChange(tab)}
          />
        )}
      </View>

      {/* Barra de Navegação Inferior (TabBar) Refinada */}
      <View
        style={[
          styles.tabBar,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => handleTabChange('CHAT')}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.tabIconBox,
              activeTab === 'CHAT' && [styles.tabIconBoxActive, { backgroundColor: colors.primaryLight }],
            ]}
          >
            <MessageSquare
              size={18}
              color={activeTab === 'CHAT' ? colors.primary : colors.textMuted}
              strokeWidth={activeTab === 'CHAT' ? 2.5 : 2}
            />
          </View>
          <Text
            style={[
              styles.tabLabel,
              { color: colors.textMuted },
              activeTab === 'CHAT' && { color: isDark ? '#FFA07A' : colors.primaryDark, fontWeight: '800' },
            ]}
          >
            Atendimento
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => handleTabChange('INVOICES')}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.tabIconBox,
              activeTab === 'INVOICES' && [styles.tabIconBoxActive, { backgroundColor: colors.primaryLight }],
            ]}
          >
            <Receipt
              size={18}
              color={activeTab === 'INVOICES' ? colors.primary : colors.textMuted}
              strokeWidth={activeTab === 'INVOICES' ? 2.5 : 2}
            />
          </View>
          <Text
            style={[
              styles.tabLabel,
              { color: colors.textMuted },
              activeTab === 'INVOICES' && { color: isDark ? '#FFA07A' : colors.primaryDark, fontWeight: '800' },
            ]}
          >
            2ª Via Fatura
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => handleTabChange('PLANS')}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.tabIconBox,
              activeTab === 'PLANS' && [styles.tabIconBoxActive, { backgroundColor: colors.primaryLight }],
            ]}
          >
            <Zap
              size={18}
              color={activeTab === 'PLANS' ? colors.primary : colors.textMuted}
              strokeWidth={activeTab === 'PLANS' ? 2.5 : 2}
            />
          </View>
          <Text
            style={[
              styles.tabLabel,
              { color: colors.textMuted },
              activeTab === 'PLANS' && { color: isDark ? '#FFA07A' : colors.primaryDark, fontWeight: '800' },
            ]}
          >
            Planos DBS
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => handleTabChange('PROFILE')}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.tabIconBox,
              activeTab === 'PROFILE' && [styles.tabIconBoxActive, { backgroundColor: colors.primaryLight }],
            ]}
          >
            <User
              size={18}
              color={activeTab === 'PROFILE' ? colors.primary : colors.textMuted}
              strokeWidth={activeTab === 'PROFILE' ? 2.5 : 2}
            />
          </View>
          <Text
            style={[
              styles.tabLabel,
              { color: colors.textMuted },
              activeTab === 'PROFILE' && { color: isDark ? '#FFA07A' : colors.primaryDark, fontWeight: '800' },
            ]}
          >
            Meu Perfil
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <MainApp />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  screenContent: {
    flex: 1,
  },
  splashContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogoBadge: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    ...SHADOWS.md,
    marginBottom: 14,
  },
  splashLogo: {
    width: 58,
    height: 58,
  },
  splashTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  splashTitle: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  splashTitleAccent: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingVertical: 6,
    paddingBottom: Platform.OS === 'ios' ? 18 : 8,
    ...SHADOWS.md,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  tabIconBox: {
    width: 38,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.sm,
  },
  tabIconBoxActive: {},
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
});
