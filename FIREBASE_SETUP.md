# CaseGraph Firebase setup

The GitHub Pages frontend uses Firebase Authentication and Cloud Firestore. The admin console also uses Firebase callable Cloud Functions for the shared secret.

## 1. Add the Web API key

Open `firebase-config.js` and replace only:

```js
apiKey: "PASTE_FIREBASE_WEB_API_KEY_HERE",
```

with the Web API Key shown in Firebase Console → Project settings → General → Your apps → Web app.

The Firebase Web API key is a public client identifier, not an admin secret. Restrict it in Google Cloud Console to the CaseGraph GitHub Pages referrers and the APIs this app uses. Never put service-account JSON or Admin SDK credentials in this repository.

## 2. Enable sign-in

Firebase Console → Authentication → Sign-in method → Email/Password → Enable.

## 3. Publish Firestore rules

Firebase Console → Firestore Database → Rules. Publish the contents of `firestore.rules`. The `private/**` path is explicitly inaccessible from browsers.

## 4. Create administrator accounts

1. Open `admin.html` and create/sign in to an account.
2. Copy the displayed UID.
3. In Firestore create `admins/{UID}` (document ID must exactly match the UID).
4. Repeat for each administrator.

Only an existing project owner should create these admin records in Firebase Console. The website cannot grant admin privileges.

## 5. Deploy the secure shared-token functions

**Important:** the shared token is not stored as plaintext and is never returned to the browser. Cloud Functions encrypts it using AES-256-GCM. The encryption key is stored separately in Google Secret Manager. All admins use the same saved token through trusted server-side functions.

Cloud Functions deployment requires the Firebase project to use the Blaze billing plan. Review billing and quotas before enabling it.

Install the Firebase CLI and log in on your own computer. From the repository folder:

```bash
npm install -g firebase-tools
firebase login
firebase use osint-f2966
```

Generate a 32-byte encryption key locally and save it as a Firebase secret. Do not paste this key or the service token into GitHub, source code, or chats:

```bash
openssl rand -base64 32
firebase functions:secrets:set CASEGRAPH_TOKEN_ENCRYPTION_KEY
```

When prompted, paste the generated base64 key into the terminal. Then deploy:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

After deployment, open `admin.html`, sign in as an admin, and enter the shared service token in the **Общий токен** section. The page only shows whether a token is configured; it cannot reveal the saved secret again. To rotate it, enter a replacement. To remove it, use **Удалить**.

The token is encrypted before being written to `private/sharedToken`; Firestore client rules deny all browser access to that document. The encryption key is not stored in Firestore or this repository. The current functions provide secure storage, status, replacement, and deletion. A future server-side integration should consume the secret inside a Cloud Function rather than send it to frontend JavaScript.

## 6. Current app behavior

- The Config Vault reads approved documents from `configs`.
- Imported configs stay in the current browser's local storage until submitted.
- New submissions are stored in `submissions` with status `pending`.
- Admins can review and approve/reject submissions.
- The main graph workspace in `index.html` still stores its graph and settings locally.
- Public voting/download counters and trusted server-side aggregation are not implemented.
