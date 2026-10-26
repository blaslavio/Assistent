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
