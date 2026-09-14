# ApproveHQ Onboarding & Help Standard

Status: v1.1 implementation reference
Owner: Product / ApproveHQ

## Goal
A first-time user should understand the core ApproveHQ workflow within 30 seconds without needing external training.

For design-approval businesses, the core path is:

1. Add/select a customer.
2. Create a draft job and add the details/photos the customer needs.
3. Send the approval text.
4. Track approval and payment.

The app must explain that creating a job does **not** notify the customer. Sending the approval text is a separate, explicit action.

## Onboarding layers

### 1. First-login welcome
Show once per business/device after a successful login. Keep it short and skippable. Explain the three-step workflow and offer `Get started` and `Not now`.

### 2. Interactive Getting Started checklist
Show on the Jobs screen until the core workflow has been completed. It must reflect real application state rather than a manually checked tutorial:

- Add first customer
- Create first job
- Send first approval

Each incomplete step has a button that navigates directly to the relevant screen/action. Completed steps are visibly checked.

### 3. Contextual empty states
Empty screens must explain both what the area is and the next action. Avoid dead-end messages such as `No jobs yet.` or `No customers yet.` when a useful call to action can be shown.

### 4. Persistent Help
Settings contains a Getting Started / Help entry so onboarding is recoverable after first login. Help should cover customers, jobs, photos, approvals, payments, and team management. Owner/admin-only topics should only be emphasized to users who can perform them.

### 5. Short video
A 45–60 second overview may supplement onboarding, but it must not be required to understand the product. Suggested sequence: customer → job → photo/details → send approval → customer view → approval returned.

## Brand standard
Onboarding is part of ApproveHQ, not a separate tutorial theme. Reuse the production app's typography, spacing, cards, buttons, blue palette, A✓ mark, and plain-language voice. Do not introduce a competing color system or illustration style.

## Screenshot standard
Help documentation must use **actual current ApproveHQ screenshots** captured from a current TestFlight/production-equivalent build. Do not use mockups as help screenshots.

Canonical screenshot directory: `docs/help/screenshots/`

Canonical screenshot manifest: `docs/help/SCREENSHOTS.md`

Each screenshot entry must record:

- filename
- screen/workflow represented
- app version/build captured
- date captured
- source UI files that can invalidate it

Screenshots must not contain real customer PII, phone numbers, payment details, tokens, or other production-sensitive information. Use a dedicated demo/test business and test customer data.

## Documentation-change trigger
UI and branding changes can make help misleading. Any PR/commit that changes user-visible workflow or branding must also review onboarding/help.

At minimum, changes to these areas trigger a documentation review:

- `www/index.html`
- `www/app.css`
- `www/app.js`
- `www/*workflow*.js`
- `www/*settings*.js`
- `www/team-member-details.js`
- `www/new-job-customer.js`
- `branding/**`

The repository includes `scripts/check-help-docs.sh`. It compares changed files with the screenshot manifest/help docs and emits a visible warning/failure when UI/branding changes occur without a corresponding help-documentation update. The intended resolution is either update the affected help/screenshots or explicitly update the manifest to document that the UI change was reviewed and does not invalidate screenshots.

## Definition of done for a user-visible UI change
Before release:

- Walk the affected flow on the current iOS build.
- Confirm onboarding text still matches the actual buttons and screen names.
- Review affected entries in `docs/help/SCREENSHOTS.md`.
- Replace stale screenshots with captures from the current app.
- Confirm screenshots contain no real customer data.
- Confirm Help links/actions still navigate correctly.
- Confirm first-time onboarding and returning-user behavior both work.

## v1.1 test plan
Test with a brand-new business/account and with an established business.

New business: first login shows Welcome; Get Started reveals checklist; Add Customer opens customer creation; successful customer creation updates progress; Create Job opens the job flow; sending first approval completes onboarding.

Existing business: onboarding should infer progress from existing customers/jobs/sent jobs. It must never force an experienced business through completed steps.

Returning user: dismissing Welcome must not block the app; Help remains available from Settings; checklist remains available until the workflow is complete.

## Future
Rental businesses should receive a workflow-specific checklist rather than design-approval terminology. Keep the onboarding engine shared, but define steps by business/workflow type as rental onboarding matures.
