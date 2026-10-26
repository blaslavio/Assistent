# Microsoft Entra ID integration

Microsoft sign-in uses the existing Supabase Auth OAuth/PKCE implementation in `extern_inloggen.py`. No simulated login state or second authentication database is added.

## Configuration (administrator)

1. Register an application in Microsoft Entra ID and configure its tenant, client ID, and client secret.
2. In Supabase Authentication > Providers > Azure (Microsoft), configure the tenant/client credentials and enable the provider.
3. Add the Supabase OAuth callback URL shown in the Supabase provider settings to the Entra app registration's redirect URIs.
4. Configure the production application URL and allowed redirect URLs in Supabase. Only use HTTPS production URLs.
5. Store credentials only in Azure and Supabase secret stores; never commit credentials.
6. Confirm the Azure provider appears enabled and perform a real Microsoft login. Verify token exchange, account identity, logout, and user-level database policies.

The app refuses to initiate an unknown, disabled, or unconfigured provider and rejects non-HTTPS return URLs. It does not claim that Azure is connected merely because environment variables exist.

**Security gate:** before enabling sensitive client records, verify tenant restrictions, Supabase RLS and that account identifiers are derived from verified server-side authentication, not from user-supplied form fields. Do not use the Supabase service-role key in browser-facing app code.

## Verified project configuration (2026-10-26)

- Supabase project: `lnjsekmlpjyiwdlzcowa`
- Supabase callback URL: `https://lnjsekmlpjyiwdlzcowa.supabase.co/auth/v1/callback`
- Microsoft Entra client ID: `ab861c49-92d7-4bf0-a9bd-ce83ba09e196`
- Microsoft Entra tenant ID: `fe1f2eaa-37a9-4358-910b-c68959f9fc08`
- Microsoft tenant URL: `https://login.microsoftonline.com/fe1f2eaa-37a9-4358-910b-c68959f9fc08`
- Supabase Azure provider configuration must include client ID, secret **value** (not secret ID), and tenant URL; enabling requires a privileged Supabase Management API call or Dashboard.
- Entra app registration must list the Supabase callback as a **Web** redirect URI.
- Microsoft Azure login requests `email` scope.
- The single-tenant Microsoft app should expose `xms_edov` optional claim for email verification as recommended by Supabase.
- No Azure provider login has been verified yet. Do not report a successful connection until an actual OAuth login completes.

Supabase guide: https://supabase.com/docs/guides/auth/social-sign-in/auth-azure
