# ReactLab GitHub App setup

ReactLab now uses a **GitHub App's OAuth web flow**, not a personal access token or a broad `repo` OAuth scope. Student credentials never enter the React client. App registration is not yet completed; GitHub features fail closed until configured.

## 1. Register the app

Open https://github.com/settings/apps/new while signed into the GitHub account that should own ReactLab.

| Setting | Value |
| --- | --- |
| Name | A globally unique name, e.g. ReactLab by your-account |
| Homepage | https://your-domain.com (or http://127.0.0.1:5173 for local dev) |
| Callback URL | https://your-domain.com/api/github/callback |
| Expire user authorization tokens | Enabled |
| Request user authorization during installation | Disabled; ReactLab starts OAuth first |
| Device flow | Disabled |
| Webhooks | Disabled; no event subscriptions |
| Who can install | Any account, if students will use their own GitHub accounts |

Select only these repository permissions:

- **Contents: read and write**, for committing practical files.
- **Repository creation: write**, for creating the dedicated repository. Use the specific creation permission, **not Administration**. If the registration UI does not offer it, do not substitute broader permissions: check GitHub's current availability before enabling automated creation.
- **Metadata: read**, required by GitHub.

Leave account, organization, issues, pull requests, workflows, secrets, and all other optional permissions at no access. Students install the app on **Only select repositories**, choosing just their ReactLab practice repository. The server rejects all-repository and multi-repository installations.

Record the App ID, app slug, and Client ID. Generate a Client Secret in GitHub. Do not paste the secret into chat, source files, or any VITE_ variable. No app private key is needed: this implementation uses expiring **user access tokens**, not installation-token minting.

## 2. Configure server settings

Set these using your server / hosting environment's secret/settings interface:

| Name | Value |
| --- | --- |
| APP_ORIGIN | https://your-domain.com (or http://127.0.0.1:5173) |
| GITHUB_APP_ID | App ID |
| GITHUB_APP_SLUG | Slug from github.com/apps/your-app |
| GITHUB_CLIENT_ID | GitHub App Client ID |
| GITHUB_CLIENT_SECRET | Client Secret; secret setting |
| TOKEN_ENCRYPTION_KEY | Random 32-byte key encoded as base64url; secret setting |

Generate the encryption key locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` and put it directly into the secret setting. Never commit it. Rotating the encryption key invalidates existing connections; users reconnect.

The backend provides the database `DB` binding and applies the versioned SQL migration. Vite serves a setup-required response locally; real local OAuth requires a D1/SQLite-backed Worker environment and a registered callback origin.

## 3. Connect and verify

1. Click Connect GitHub, choose a repository name, and Continue with GitHub.
2. GitHub shows the app name and permissions. Authorize there.
3. Back in ReactLab, open Connect GitHub and Create practice repository.
4. Choose repository opens GitHub installation settings. Select **only** the newly created practice repository. Return and Check connection.
5. Sync all now imports existing practicals. Subsequent changed practicals sync after their preview initially renders.
6. Verify a real commit, author attribution, unchanged-run skipping, reconnect after expiry, denial, and disconnect. No live GitHub credentials or registration were available during implementation, so these live acceptance steps remain required.

Commits use the authenticated GitHub account's noreply identity on the repository's default branch. GitHub controls contribution eligibility, private-contribution visibility, and update timing.

## Security and lifetime

- Random OAuth state is bound to the signed-in Site user and an HttpOnly SameSite=Lax browser cookie, expires in 10 minutes, and is atomically consumed once.
- S256 PKCE binds code exchange to the initiating flow; the callback URL comes from a configured exact origin.
- GitHub token exchange and API calls run only on the server. AES-GCM encrypts stored tokens with the Site user as authenticated additional data.
- Opaque session IDs are hashed in D1 and placed in HttpOnly SameSite=Lax cookies (Secure on HTTPS). Tokens are neither serialized into page data nor stored in localStorage.
- Sessions expire after at most 8 hours; reconnect obtains fresh authorization. Refresh tokens are deliberately not retained. Disconnect removes the session and attempts GitHub token revocation; repository backups remain.
- Every mutation checks the exact Origin header and the signed-in user. Repository identity and author are server-owned, and installation access is checked before each sync.
- Sync remains atomic and non-force-pushing. Local notebook code stays local until an explicitly connected sync.

Sources: [GitHub App OAuth](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app), [GitHub App permissions](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps).
