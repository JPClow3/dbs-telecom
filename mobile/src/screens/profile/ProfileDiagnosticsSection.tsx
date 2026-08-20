import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Radio, RefreshCw } from 'lucide-react-native';
import { ProfileColors, PingResult } from './types';
import { styles } from './styles';

interface ProfileDiagnosticsSectionProps {
  colors: ProfileColors;
  isNetworkOnline: boolean;
  isDemo?: boolean;
  testingPing: boolean;
  pingResult: PingResult | null;
  onRunDiagnostics: () => void;
}

export const ProfileDiagnosticsSection: React.FC<ProfileDiagnosticsSectionProps> = ({
  colors,
  isNetworkOnline,
  isDemo = false,
  testingPing,
  pingResult,
  onRunDiagnostics,
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
    <View style={[styles.sectionHeader, { borderBottomColor: colors.borderLight }]}>
      <View style={styles.headerLeft}>
        <Radio size={16} color={colors.infoDark} strokeWidth={2.2} />
        <Text style={[styles.sectionTitle, { color: colors.secondary }]}>Status do Aplicativo e Diagnóstico</Text>
      </View>
      <View
        style={[
          styles.liveBadge,
          {
            backgroundColor: isDemo ? colors.warningLight : isNetworkOnline ? colors.infoLight : colors.dangerLight,
          },
        ]}
      >
        <View
          style={[
            styles.liveDot,
            { backgroundColor: isDemo ? colors.warningDark : isNetworkOnline ? colors.infoDark : colors.dangerDark },
          ]}
        />
        <Text
          style={[
            styles.liveText,
            { color: isDemo ? colors.warningDark : isNetworkOnline ? colors.infoDark : colors.dangerDark },
          ]}
        >
          {isDemo ? 'Dados demo' : isNetworkOnline ? 'App online' : 'Sem internet'}
        </Text>
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
        <Text style={[styles.networkValue, { color: colors.text }]}>GPON / fibra (cadastro)</Text>
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
            <Text style={[styles.pingLabel, { color: colors.successDark }]}>Download estimado</Text>
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
      onPress={onRunDiagnostics}
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
);
