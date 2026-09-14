# ApproveHQ Help Screenshot Manifest

This file is the source of truth for screenshots used by onboarding/help documentation.

**Rule:** help screenshots must be captured from the real ApproveHQ app. Do not substitute generated mockups.

## Capture status

The first v1.1 onboarding implementation is being built before the refreshed screenshots are captured. The entries below are intentionally marked `CAPTURE REQUIRED` rather than using fake imagery.

| Screenshot | Workflow | Status | Invalidation sources |
| --- | --- | --- | --- |
| `01-jobs-getting-started.png` | Jobs / Getting Started checklist | CAPTURE REQUIRED | `www/onboarding.js`, `www/app.js`, `www/app.css` |
| `02-add-customer.png` | Add first customer; phone optional | CAPTURE REQUIRED | `www/index.html`, `www/app.js`, `www/new-job-customer.js`, `www/customer-sharing.js`, `www/app.css` |
| `03-create-job.png` | Create draft job | CAPTURE REQUIRED | `www/index.html`, `www/app.js`, `www/new-job-customer.js`, `www/app.css` |
| `04-job-photos.png` | Add photos/details | CAPTURE REQUIRED | `www/app.js`, `www/app-ui-polish.js`, `www/app.css` |
| `05-send-approval.png` | Send Text / native iOS Share; no-phone disabled state | CAPTURE REQUIRED | `www/app.js`, `www/customer-sharing.js`, `www/onboarding.js`, `www/app-ui-polish.js`, `www/app.css` |
| `06-customer-approval.png` | Customer approval result | CAPTURE REQUIRED | customer-facing web UI; backend repository |
| `07-payment-request.png` | Request/track payment; SMS requires customer phone | CAPTURE REQUIRED | `www/app.js`, `www/customer-sharing.js`, Square/payment UI files, `www/app.css` |
| `08-team-help.png` | Team management | CAPTURE REQUIRED | `www/team-member-details.js`, `www/app.css` |

## Capture procedure

Use a dedicated demo/test business with non-sensitive data. Capture from the current TestFlight build after `npx cap sync ios`. Record the version/build and capture date below each updated entry. Crop only to remove OS chrome when appropriate; do not alter app UI or create composite/mock screens that differ from the product.

When a UI/branding change affects an entry, replace the screenshot and update its version/build/date, or add a note explaining why review confirmed the existing screenshot remains accurate.
