# Play Console release checks

Use this flow before distributing a build to testers or uploading it to Google Play Console.

## Required command

```sh
npm run build:android:play
```

This command is the release gate. It runs `npm run test:preplay` first and only starts the EAS production Android build if all checks pass.

The gate also requires a clean git tree when building, so the AAB can always be traced back to committed code.

As a safety net, EAS also runs `npm run test:preplay` through the `eas-build-post-install` hook. If someone starts `eas build` directly, the remote build should still fail before producing an AAB when these checks fail.

## What the preflight checks cover

- Production EAS profile creates an Android App Bundle.
- Production API URLs point to `https://wel-fy.it/api/expense-tracker/`.
- Camera/photo permissions are intentional and audio recording stays blocked.
- Login remains admin-provisioned only.
- Expense list/detail use the stored currency instead of a fixed EUR symbol.
- Detail/edit action buttons are localized and have Android safe-area padding.
- OCR hidden merchant address/VAT fields are reset between scans.
- Pull sync accepts `merchant_address`, `merchantAddress`, and legacy `location`.
- Create/update sync sends merchant address/VAT and stores the server id after create.
- Duplicate expense fingerprint behavior remains stable.
- AAB/APK artifacts stay out of git.

## Local-only check

```sh
npm run test:preplay
```

This runs the same checks but does not require a clean git tree. It is useful while developing.

## Manual smoke test still required

The automated gate does not replace one real Android run. Before sending the build to testers, install the AAB through Play internal testing and verify:

1. Login works with a real user.
2. Existing server expenses are downloaded.
3. A receipt can be captured/imported.
4. OCR fallback/manual entry works.
5. A new expense syncs and receives a server id.
6. Edit/delete buttons work and do not overlap the Android navigation bar.
