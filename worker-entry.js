import baseWorker from './worker.js';
import { handleStaffProvisioningRoute } from './staff-provisioning-api.js';

export default {
  async fetch(request, env, ctx) {
    const response = await handleStaffProvisioningRoute(request, env);
    if (response) return response;
    return baseWorker.fetch(request, env, ctx);
  }
};
