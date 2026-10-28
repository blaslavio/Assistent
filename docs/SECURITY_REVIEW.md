# Security review

The current authentication flow requires review before beta. Base64 encoding does not provide encryption. Avoid passing passwords through model API keys, and avoid retaining passwords in cache keys. Migrate to short-lived, server-validated tokens after auditing the edge function and existing sessions.

Do not change production authentication without tests and a rollback plan.
