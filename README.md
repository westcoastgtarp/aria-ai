# Aria AI — Lifeline Care Demo

A deployment-ready prototype for the Aria AI product concept.

## Member experience

- Medication checklist with explicit user confirmation
- “Not recorded” status instead of assuming a dose was missed
- Reminder center
- Aria AI floating companion chat for Lifeline subscribers
- Care Circle concepts
- Distress escalation presentation
- Synthetic incident history
- HIPAA-oriented privacy/security design overview
- Responsive desktop/mobile layout

## Staff portal prototype

Open `staff.html` to preview the internal staff structure.

### Departments

- Founder / Co-Founder — System Administration
- Operations — Customer Support, Sales, Refunds, Operational Audits
- HR — Staff records, disciplinary actions, personnel decisions
- IT — Aria AI and Aria Lifeline logistics, monitoring, integrations, maintenance
- Engineering — Backups, infrastructure recovery, hardware recovery, member recovery tooling

### Hiring flow

1. Candidate
2. Hired
3. Founder / Co-Founder assigns department
4. Founder / Co-Founder assigns initial role / permissions
5. Staff account becomes ready for activation

Department assignment is intentionally part of the hiring process before staff access is activated. HR manages the employee after activation, but initial department placement is controlled by Founder / Co-Founder.

### Planned onboarding phase

Onboarding is not active yet. The future flow is designed to become:

Candidate → Hired → Department Assigned → Onboarding → Training / policy acknowledgments → Access provisioning → Active Employee

## Safety / compliance status

This is a **demo only**. It is intentionally built without a production PHI backend, emergency dispatch, real AI inference, production authentication, or production staff access controls.

Do not enter real health information into the demo.

A production HIPAA-regulated deployment requires much more than frontend code, including applicable administrative, physical, and technical safeguards; formal role/access policies; authentication; encryption/key management; audit controls; applicable vendor/BAA review; risk analysis; incident/breach procedures; workforce training; retention rules; disaster recovery; privacy workflows; and legal/compliance review.

## Run locally

From this directory:

```bash
python3 -m http.server 8080
```

Then open:

- Member portal: `http://localhost:8080`
- Staff portal: `http://localhost:8080/staff.html`

## Production roadmap

1. Identity + MFA + role-based authorization
2. HIPAA-appropriate backend and encrypted ePHI stores where applicable
3. Append-only conversation/event logging
4. Medication/reminder service
5. Approved AI provider + BAA where required
6. Independent safety-classification service
7. Defined escalation workflows
8. Care Circle consent and disclosure rules
9. Responder verification and disclosure logging
10. Staff onboarding workflow
11. Security risk analysis and production readiness review
