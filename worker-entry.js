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
import { handleStructuredMemberMedicationRoute } from './member-medications-structured-api.js';
import { handleMemberMedicationsRoute } from './member-medications-api.js';
import { handleMemberRemindersRoute } from './member-reminders-api.js';
import { runMedicationReminderScheduler } from './medication-reminder-scheduler.js';

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
      }
    });

  if (pathname === '/' || pathname === '/index.html') {
    rewriter.on('body', {
      element(element) {
        element.prepend('<script src="/member-medication-structured-form.js?v=20260826-3"></script>', { html: true });
        element.append('<script src="/member-assistant-live.js?v=20260826-4"></script><script src="/member-medication-delete.js?v=20260826-1"></script><script src="/member-reminders-live.js?v=20260826-2"></script><script src="/member-overview-reminders.js?v=20260826-1"></script>', { html: true });
      }
    });
  }

  return rewriter.transform(response);
}

export default {
  async fetch(request, env, ctx) {
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
    ctx.waitUntil(runMedicationReminderScheduler(env,new Date(controller.scheduledTime)));
  }
};
