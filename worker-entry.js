import baseWorker from './worker.js';
import { handleStaffProvisioningRoute } from './staff-provisioning-api.js';
import { handleMemberSignupRoute } from './member-signup-api.js';
import { handleInvitationManagementRoute } from './invitation-management-api.js';
import { handlePasswordRecoveryRoute } from './password-recovery-api.js';
import { handleStaffTicketRoute } from './staff-ticket-api.js';
import { handleHiringOnboardingRoute } from './hiring-onboarding-api.js';
import { handleCandidateManagementRoute } from './candidate-management-api.js';
import { handleHrRoute } from './hr-api.js';
import { handleAuditRoute } from './audit-api.js';
import { handleMemberEntitlementsRoute } from './member-entitlements-api.js';
import { handleCareCircleRoute } from './care-circle-api.js';
import { handleMemberAssistantRoute } from './member-assistant-api.js';
import { handleMemberConversationsRoute } from './member-conversations-api.js';
import { handleMemberMembershipOptionsRoute } from './member-membership-options-api.js';
import { handleLifelineRiskRoute } from './lifeline-risk-api.js';
import { handleLifelineSupportRoute } from './lifeline-support-api.js';
import { handleLiveSupportAccessRoute } from './live-support-access-api.js';
import { handleLiveSupportHistoryGuardRoute } from './live-support-history-guard-api.js';
import { handleLiveSupportChatRoute } from './live-support-chat-api.js';
import { handleLiveSupportStartRoute } from './live-support-start-api.js';
import { handleLiveSupportEscalationRoute } from './live-support-escalation-api.js';
import { handleStructuredMemberMedicationRoute } from './member-medications-structured-api.js';
import { handleMemberMedicationsRoute } from './member-medications-api.js';
import { handleMemberRemindersRoute } from './member-reminders-api.js';
import { handleMemberNotificationPreferencesRoute } from './member-notification-preferences-api.js';
import { runMedicationReminderScheduler } from './medication-reminder-scheduler.js';
import { runCommunicationDeliveries } from './communication-delivery-runner.js';

function withAriaFormSystem(response,pathname) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html') || typeof HTMLRewriter === 'undefined') return response;

  const rewriter = new HTMLRewriter()
    .on('head', {
      element(element) {
        element.append('<link rel="stylesheet" href="/aria-form-system.css?v=20260824-1" />', { html: true });
        element.append('<link rel="stylesheet" href="/medication-card-cleanup.css?v=20260826-1" />', { html: true });
        element.append('<link rel="stylesheet" href="/medication-structured-form.css?v=20260826-1" />', { html: true });
        element.append('<link rel="stylesheet" href="/member-reminders.css?v=20260826-1" />', { html: true });
        element.append('<link rel="stylesheet" href="/member-overview-reminders.css?v=20260826-1" />', { html: true });
        element.append('<link rel="stylesheet" href="/member-notification-preferences.css?v=20260827-1" />', { html: true });
        element.append('<link rel="stylesheet" href="/member-assistant-support-choice.css?v=20260827-1" />', { html: true });
        element.append('<link rel="stylesheet" href="/live-support-chat.css?v=20260830-2" />', { html: true });
        element.append('<link rel="stylesheet" href="/aria-chat-expand.css?v=20260829-1" />', { html: true });
        if (pathname === '/' || pathname === '/index.html') {
          element.append('<link rel="stylesheet" href="/member-theme.css?v=20260830-1" />', { html: true });
          element.append('<link rel="stylesheet" href="/care-circle-controls.css?v=20260901-2" />', { html: true });
          element.append('<link rel="stylesheet" href="/care-circle-premium.css?v=20260901-1" />', { html: true });
          element.append('<link rel="stylesheet" href="/aria-unified-premium-theme.css?v=20260901-1" />', { html: true });
        }
      }
    });

  if (pathname === '/' || pathname === '/index.html') {
    rewriter.on('body', {
      element(element) {
        element.prepend('<script src="/member-theme.js?v=20260830-1"></script><script src="/member-account-guard.js?v=20260901-1"></script><script src="/member-medication-structured-form.js?v=20260826-3"></script>', { html: true });
        element.append('<script src="/member-live-support-chat.js?v=20260830-3"></script><script src="/member-assistant-live.js?v=20260830-3"></script><script src="/member-live-support-header.js?v=20260828-2"></script><script src="/aria-chat-expand.js?v=20260829-1"></script><script src="/member-medication-delete.js?v=20260826-1"></script><script src="/member-reminders-live.js?v=20260827-1"></script><script src="/member-notification-preferences.js?v=20260827-4"></script><script src="/member-overview-reminders.js?v=20260826-1"></script><script src="/member-navigation-state.js?v=20260826-1"></script><script src="/care-circle-controls.js?v=20260901-2"></script><script src="/care-circle-premium.js?v=20260901-1"></script>', { html: true });
      }
    });
  }

  return rewriter.transform(response);
}

export default {
  async fetch(request, env, ctx) {
    const liveSupportEscalationResponse = await handleLiveSupportEscalationRoute(request, env);
    if (liveSupportEscalationResponse) return liveSupportEscalationResponse;

    const liveSupportStartResponse = await handleLiveSupportStartRoute(request, env);
    if (liveSupportStartResponse) return liveSupportStartResponse;

    const liveSupportChatResponse = await handleLiveSupportChatRoute(request, env);
    if (liveSupportChatResponse) return liveSupportChatResponse;

    const lifelineSupportResponse = await handleLifelineSupportRoute(request, env);
    if (lifelineSupportResponse) return lifelineSupportResponse;

    const lifelineRiskResponse = await handleLifelineRiskRoute(request, env);
    if (lifelineRiskResponse) return lifelineRiskResponse;

    const structuredMedicationResponse = await handleStructuredMemberMedicationRoute(request, env);
    if (structuredMedicationResponse) return structuredMedicationResponse;

    const medicationsResponse = await handleMemberMedicationsRoute(request, env);
    if (medicationsResponse) return medicationsResponse;

    const remindersResponse = await handleMemberRemindersRoute(request, env);
    if (remindersResponse) return remindersResponse;

    const notificationPreferencesResponse = await handleMemberNotificationPreferencesRoute(request, env);
    if (notificationPreferencesResponse) return notificationPreferencesResponse;

    const conversationsResponse = await handleMemberConversationsRoute(request, env);
    if (conversationsResponse) return conversationsResponse;

    const assistantResponse = await handleMemberAssistantRoute(request, env);
    if (assistantResponse) return assistantResponse;

    const membershipOptionsResponse = await handleMemberMembershipOptionsRoute(request, env);
    if (membershipOptionsResponse) return membershipOptionsResponse;

    const careCircleResponse = await handleCareCircleRoute(request, env);
    if (careCircleResponse) return careCircleResponse;

    const memberEntitlementsResponse = await handleMemberEntitlementsRoute(request, env);
    if (memberEntitlementsResponse) return memberEntitlementsResponse;

    const auditResponse = await handleAuditRoute(request, env);
    if (auditResponse) return auditResponse;

    const hrResponse = await handleHrRoute(request, env);
    if (hrResponse) return hrResponse;

    const candidateManagementResponse = await handleCandidateManagementRoute(request, env);
    if (candidateManagementResponse) return candidateManagementResponse;

    const hiringResponse = await handleHiringOnboardingRoute(request, env);
    if (hiringResponse) return hiringResponse;

    const liveSupportHistoryGuardResponse = await handleLiveSupportHistoryGuardRoute(request, env);
    if (liveSupportHistoryGuardResponse) return liveSupportHistoryGuardResponse;

    const liveSupportResponse = await handleLiveSupportAccessRoute(request, env);
    if (liveSupportResponse) return liveSupportResponse;

    const staffTicketResponse = await handleStaffTicketRoute(request, env);
    if (staffTicketResponse) return staffTicketResponse;

    const staffResponse = await handleStaffProvisioningRoute(request, env);
    if (staffResponse) return staffResponse;

    const invitationResponse = await handleInvitationManagementRoute(request, env);
    if (invitationResponse) return invitationResponse;

    const passwordRecoveryResponse = await handlePasswordRecoveryRoute(request, env);
    if (passwordRecoveryResponse) return passwordRecoveryResponse;

    const memberSignupResponse = await handleMemberSignupRoute(request, env);
    if (memberSignupResponse) return memberSignupResponse;

    const response = await baseWorker.fetch(request, env, ctx);
    return withAriaFormSystem(response,new URL(request.url).pathname);
  },

  async scheduled(controller,env,ctx) {
    const scheduledAt=new Date(controller.scheduledTime);
    ctx.waitUntil((async()=>{
      await runMedicationReminderScheduler(env,scheduledAt);
      await runCommunicationDeliveries(env,scheduledAt);
    })());
  }
};