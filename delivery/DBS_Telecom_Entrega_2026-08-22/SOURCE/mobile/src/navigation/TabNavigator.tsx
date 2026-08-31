import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { MainTabParamList } from './types';
import { useAppTheme } from '../context/ThemeContext';
import { hapticFeedback } from '../utils/haptics';
import { Customer, DBSPlan } from '../types';
import { SHADOWS, RADIUS } from '../constants/theme';
import { MessageSquare, Receipt, Zap, User } from 'lucide-react-native';

import { ChatScreen } from '../screens/ChatScreen';
import { InvoicesScreen } from '../screens/InvoicesScreen';
import { PlansScreen } from '../screens/PlansScreen';
import { ProfileScreen } from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

interface TabNavigatorProps {
  customer: Customer;
  onLogout: () => void;
}

export const TabNavigator: React.FC<TabNavigatorProps> = ({ customer, onLogout }) => {
  const { colors, isDark } = useAppTheme();
  const navigation = useNavigation<any>();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingVertical: 6,
          paddingBottom: Platform.OS === 'ios' ? 22 : 8,
          height: Platform.OS === 'ios' ? 76 : 64,
          ...SHADOWS.md,
        },
        tabBarLabelStyle: {
          fontSize: 10.5,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarActiveTintColor: isDark ? '#FFA07A' : colors.primaryDark,
        tabBarInactiveTintColor: colors.textMuted,
      }}
      screenListeners={{
        tabPress: () => {
          hapticFeedback.selection();
        },
      }}
    >
      <Tab.Screen
        name="Chat"
        options={{
          tabBarLabel: 'Atendimento',
          tabBarIcon: ({ focused, color }) => (
            <View
              style={[
                styles.iconContainer,
                focused && [styles.iconContainerActive, { backgroundColor: colors.primaryLight }],
              ]}
            >
              <MessageSquare size={18} color={color} strokeWidth={focused ? 2.5 : 2} />
            </View>
          ),
        }}
      >
        {({ route }) => (
          <ChatScreen
            customer={customer}
            selectedPlanToHire={route.params?.selectedPlanToHire}
            onClearSelectedPlan={() => {
              // Limpa o parâmetro na rota do Chat (mesma rota que o recebeu);
              // setParams no nível de MainTabs não afetava esta rota e o valor
              // persistia, reenviando a mensagem ao remontar.
              navigation.navigate('Chat', { selectedPlanToHire: null });
            }}
            onNavigateToPlans={() => navigation.navigate('Plans')}
            onNavigateToInvoices={() => navigation.navigate('Invoices')}
          />
        )}
      </Tab.Screen>

      <Tab.Screen
        name="Invoices"
        options={{
          tabBarLabel: '2ª Via Fatura',
          tabBarIcon: ({ focused, color }) => (
            <View
              style={[
                styles.iconContainer,
                focused && [styles.iconContainerActive, { backgroundColor: colors.primaryLight }],
              ]}
            >
              <Receipt size={18} color={color} strokeWidth={focused ? 2.5 : 2} />
            </View>
          ),
        }}
      >
        {() => (
          <InvoicesScreen
            customer={customer}
            onNavigateToChat={() => navigation.navigate('Chat')}
          />
        )}
      </Tab.Screen>

      <Tab.Screen
        name="Plans"
        options={{
          tabBarLabel: 'Planos DBS',
          tabBarIcon: ({ focused, color }) => (
            <View
              style={[
                styles.iconContainer,
                focused && [styles.iconContainerActive, { backgroundColor: colors.primaryLight }],
              ]}
            >
              <Zap size={18} color={color} strokeWidth={focused ? 2.5 : 2} />
            </View>
          ),
        }}
      >
        {() => (
          <PlansScreen
            customer={customer}
            onSelectPlan={(plan: DBSPlan) => {
              hapticFeedback.selection();
              navigation.navigate('Chat', { selectedPlanToHire: plan });
            }}
          />
        )}
      </Tab.Screen>

      <Tab.Screen
        name="Profile"
        options={{
          tabBarLabel: 'Meu Perfil',
          tabBarIcon: ({ focused, color }) => (
            <View
              style={[
                styles.iconContainer,
                focused && [styles.iconContainerActive, { backgroundColor: colors.primaryLight }],
              ]}
            >
              <User size={18} color={color} strokeWidth={focused ? 2.5 : 2} />
            </View>
          ),
        }}
      >
        {() => (
          <ProfileScreen
            customer={customer}
            onLogout={onLogout}
            onNavigateToTab={(tab) => {
              if (tab === 'CHAT') navigation.navigate('Chat');
              else if (tab === 'INVOICES') navigation.navigate('Invoices');
              else if (tab === 'PLANS') navigation.navigate('Plans');
            }}
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  iconContainer: {
    width: 38,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.sm,
  },
  iconContainerActive: {},
});
