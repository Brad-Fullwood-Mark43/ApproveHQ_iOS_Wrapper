# ApproveHQ iOS Wrapper

Native iOS wrapper for the ApproveHQ web application.

## Architecture

- **Core application/backend:** existing Next.js app hosted on Railway
- **iOS shell:** Capacitor + Xcode
- **Production web app:** https://www.4fenterprises.org

The iOS app will progressively add native capabilities around the existing web application instead of rewriting the product in Swift.

## Initial goals

1. Launch directly into the signed-in app experience instead of the public marketing site.
2. Preserve existing authentication, jobs, customers, approvals, Square payments, Twilio SMS, and tenant isolation.
3. Add native iOS capabilities incrementally:
   - APNs push notifications
   - deep links to jobs
   - native camera/photo picker
   - native share sheet
   - haptics
   - external browser handling for Square/OAuth
   - native status bar, safe areas, keyboard handling, and offline states
4. Reach an internal TestFlight build before App Store submission.

## Proposed identifiers

- **App name:** ApproveHQ
- **Bundle ID:** `com.4fenterprises.approvehq`

These can still be changed before the first App Store record is created.

## Local bootstrap

The Xcode project should be generated locally on a Mac with current Node.js, CocoaPods/Xcode tooling, and Capacitor installed.

```bash
npm install
npx cap sync ios
npx cap open ios
```

## Important

Do not place Railway, Square, Twilio, database, or other server secrets in this repository or in the iOS bundle. Those remain server-side in the existing application.
