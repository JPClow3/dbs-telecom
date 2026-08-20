import { NavigatorScreenParams } from '@react-navigation/native';
import { Customer, DBSPlan } from '../types';

export type MainTabParamList = {
  Chat: { selectedPlanToHire?: DBSPlan | null } | undefined;
  Invoices: { invoiceId?: string; filter?: 'ALL' | 'PENDING' | 'PAID' } | undefined;
  Plans: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
};
