# Supabase Auth Email Templates

These templates match the Scan-in dark UI with green accents and are designed for Supabase Auth emails.

## How to use
1. Open your Supabase project.
2. Go to **Authentication → Email Templates**.
3. Select the template type (Confirm signup, Invite, Magic link, Change email, Reset password, Reauthentication).
4. Copy the HTML from the matching file below and paste it into Supabase.

## Files
- confirm-signup.html
- invite.html
- magic-link.html
- change-email.html
- reset-password.html
- reauthenticate.html

## Notes
- Templates use Supabase placeholders like `{{ .ConfirmationURL }}` and `{{ .NewEmail }}`.
- Update the brand name or colors if needed.
