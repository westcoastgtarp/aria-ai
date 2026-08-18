# Aria AI — Lifeline Care Demo

A static, deployment-ready prototype for the Aria AI product concept.

## Included

- Medication checklist with explicit user confirmation
- “Not recorded” status instead of assuming a dose was missed
- Reminder center
- Lifeline chat UX with a separate demo safety-monitor panel
- Graduated concern/high/critical escalation presentation
- Care Circle consent concepts
- Synthetic incident timeline
- HIPAA-oriented privacy/security design overview
- Responsive desktop/mobile layout

## Safety / compliance status

This is a **demo only**. It is intentionally built without a production PHI backend, emergency dispatch, real AI inference, authentication, or staff access.

Do not enter real health information into the demo.

A production HIPAA-regulated deployment requires much more than frontend code, including (as applicable): formal role/access policies, MFA, encryption/key management, audit controls, BAAs, vendor review, risk analysis, incident/breach procedures, workforce training, retention rules, disaster recovery, privacy workflows, and legal/compliance review.

## Run locally

From this directory:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Static deployment

The folder can be deployed directly to a static host. For Cloudflare Pages Direct Upload, the current documentation uses Wrangler's Pages deploy flow for a folder of prebuilt assets.

## Production roadmap

1. Identity + MFA + role-based authorization
2. HIPAA-appropriate backend and encrypted ePHI stores
3. Append-only conversation/event logging
4. Medication/reminder service
5. Approved AI provider + BAA where required
6. Independent safety-classification service
7. Human-reviewed escalation workflows
8. Care Circle consent and disclosure rules
9. Responder verification and disclosure logging
10. Security risk analysis and production readiness review
