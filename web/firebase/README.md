# Firebase Auth setup (Artist Atlas)

Artist Atlas ships a **demonstrative** login: sign up / sign in / Google / sign out and session persistence are all
real, but the account gates **nothing** — a prominent "Explore the demo" bypass grants full parity with the
signed-in state. So there is **no Firestore, no RTDB, no Admin SDK, and no server-side token verification**:
client-side Firebase Auth only. Only `firebase/app` and `firebase/auth` are imported.

## 1. Create the Firebase project

1. In the [Firebase console](https://console.firebase.google.com/), create a project (or reuse one).
2. Add a **Web app** (`</>`). Copy the web config values — they are a **public identifier, not a secret** (see below).
3. **Authentication → Sign-in method:** enable **Email/Password** and **Google**.
4. **Authentication → Settings → Authorized domains:** add `localhost` (already present) and your Vercel domains
   (e.g. `artist-atlas.vercel.app` and any preview domains you use). Google sign-in popups fail from an
   unauthorized domain.

## 2. Keep Firestore disabled / default-deny

This app uses no database in Firebase. **Do not create a Firestore database in test mode.** If one already exists
(or the console creates one during setup), deploy the default-deny rules in [`firestore.rules`](./firestore.rules):

```bash
# optional, only if a Firestore database exists under the project:
firebase deploy --only firestore:rules
```

Those rules deny all reads and writes (`allow read, write: if false;`). Never ship test-mode rules for this project.

## 3. Set the env vars

The Firebase **web config is public by design** — it ships in the client bundle, so it uses the `NEXT_PUBLIC_`
prefix (the one documented exception in [`../.env.example`](../.env.example)). Account security is enforced by the
Auth provider settings and Security Rules, **never** by hiding the `apiKey`.

Locally, copy `web/.env.example` to `web/.env` and fill in the `NEXT_PUBLIC_FIREBASE_*` block. On Vercel, set the
same vars under **Project → Settings → Environment Variables** (Production **and** Preview).

Required together: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`,
`NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`. Optional:
`NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`.

**Leave them all unset to disable sign-in entirely:** the login page then hides the credential form, shows a muted
"Sign-in isn't configured in this environment" note, and offers only the demo bypass. No crash, no broken form.

## 4. Sign out

Logout calls `signOut(auth)`, so Firebase invalidates the refresh token — we don't rely on clearing client state alone.
