# ADR 0004 — Anonymous sign-in during development

Date: 2026-11-12 · Status: accepted (temporary)

## Context
Email-code sign-in needs custom email templates, which Supabase's free plan only allows with a custom SMTP sender.
Derek doesn't want to set that up yet and wants to build features first.

## Decision
- The app signs in with Supabase **anonymous sign-in** on first launch. No login screen.
- RLS, org setup and sync work unchanged (anonymous users are `authenticated` with a real `auth.uid()`).
- The email-code flow (`SignInView`, `SessionStore.sendCode/verify`) stays in the code, unused.
- Sign-out is hidden: signing out of an anonymous account loses access to its data.

## Consequences
- Deleting the app or wiping the simulator orphans that account's server data. Acceptable for dev data only.
- Before real use: set up SMTP (Resend + business domain), then link an email to the anonymous account
  (`auth.updateUser(email:)`) so existing data is kept.
- Anonymous sign-ins are rate-limited per IP (Supabase default 30/hour).
