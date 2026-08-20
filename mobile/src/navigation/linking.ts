import { LinkingOptions } from '@react-navigation/native';
import { RootStackParamList } from './types';

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    'dbs://',
    'https://dbstelecom.com.br',
    'https://*.dbstelecom.com.br',
    'http://localhost:19006',
    'http://localhost:8081',
  ],
  config: {
    screens: {
      Login: 'login',
      MainTabs: {
        screens: {
          Chat: 'chat',
          Invoices: 'invoices/:invoiceId?',
          Plans: 'plans',
          Profile: 'profile',
        },
      },
    },
  },
};
