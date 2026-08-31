import React from 'react';
import { Customer } from '../../types';
import { TicketsModal } from '../../components/TicketsModal';
import { SpeedTestModal } from '../../components/SpeedTestModal';
import { WifiManagerModal } from '../../components/WifiManagerModal';
import { OpticalDiagnosticsModal } from '../../components/OpticalDiagnosticsModal';
import { NotificationsModal } from '../../components/NotificationsModal';
import { ReferralModal } from '../../components/ReferralModal';

type ProfileTab = 'CHAT' | 'INVOICES' | 'PLANS' | 'PROFILE';

interface ProfileModalStackProps {
  customer: Customer;
  onNavigateToTab?: (tab: ProfileTab) => void;
  showTicketsModal: boolean;
  showSpeedTestModal: boolean;
  showWifiModal: boolean;
  showOpticalModal: boolean;
  showNotificationsModal: boolean;
  showReferralModal: boolean;
  onShowTicketsModal: (visible: boolean) => void;
  onShowSpeedTestModal: (visible: boolean) => void;
  onShowWifiModal: (visible: boolean) => void;
  onShowOpticalModal: (visible: boolean) => void;
  onShowNotificationsModal: (visible: boolean) => void;
  onShowReferralModal: (visible: boolean) => void;
  onShowToast: (message: string) => void;
}

export const ProfileModalStack: React.FC<ProfileModalStackProps> = ({
  customer,
  onNavigateToTab,
  showTicketsModal,
  showSpeedTestModal,
  showWifiModal,
  showOpticalModal,
  showNotificationsModal,
  showReferralModal,
  onShowTicketsModal,
  onShowSpeedTestModal,
  onShowWifiModal,
  onShowOpticalModal,
  onShowNotificationsModal,
  onShowReferralModal,
  onShowToast,
}) => (
  <>
    <TicketsModal
      visible={showTicketsModal}
      clientId={customer.id}
      onClose={() => onShowTicketsModal(false)}
      onNavigateToChat={() => {
        onShowTicketsModal(false);
        onNavigateToTab?.('CHAT');
      }}
      onShowToast={onShowToast}
    />

    <SpeedTestModal
      visible={showSpeedTestModal}
      isDemo={customer.isDemo}
      onClose={() => onShowSpeedTestModal(false)}
    />

    <WifiManagerModal
      visible={showWifiModal}
      clientId={customer.id}
      isDemo={customer.isDemo}
      onClose={() => onShowWifiModal(false)}
      onShowToast={onShowToast}
    />

    <OpticalDiagnosticsModal
      visible={showOpticalModal}
      clientId={customer.id}
      isDemo={customer.isDemo}
      onClose={() => onShowOpticalModal(false)}
      onShowToast={onShowToast}
      onNavigateToChat={() => {
        onShowOpticalModal(false);
        onNavigateToTab?.('CHAT');
      }}
    />

    <NotificationsModal
      visible={showNotificationsModal}
      clientId={customer.id}
      isDemo={customer.isDemo}
      onClose={() => onShowNotificationsModal(false)}
      onShowToast={onShowToast}
      onNavigateToTab={onNavigateToTab}
    />

    <ReferralModal
      visible={showReferralModal}
      clientId={customer.id}
      isDemo={customer.isDemo}
      onClose={() => onShowReferralModal(false)}
      onShowToast={onShowToast}
    />
  </>
);
