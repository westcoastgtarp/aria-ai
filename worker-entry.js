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

export default {
  async fetch(request, env, ctx) {
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

    return baseWorker.fetch(request, env, ctx);
  }
};
