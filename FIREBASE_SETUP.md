# CaseGraph Firebase setup

The GitHub Pages frontend uses Firebase Authentication and Cloud Firestore.

## 1. Add the Web API key

Open `firebase-config.js` and replace only:

```js
apiKey: "PASTE_FIREBASE_WEB_API_KEY_HERE",
```

with the Web API Key shown in Firebase Console → Project settings → General → Your apps → Web app.

The Firebase Web API key is a public client identifier, not an admin secret. Restrict it in Google Cloud Console to the CaseGraph GitHub Pages referrers and the APIs this app uses. Never put service-account JSON or Admin SDK credentials in this repository.

## 2. Enable sign-in

Firebase Console → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.

## 3. Publish Firestore rules

Firebase Console → Firestore Database → Rules. Replace the editor contents with `firestore.rules` from this repository, then Publish.

Keep rules in production mode. Do not use open test rules.

## 4. Create the moderator account

1. Open the deployed `admin.html` page.
2. Create an account or sign in with the intended moderator email.
3. Copy the UID shown on that page.
4. In Firebase Console → Firestore Database → Data, create a collection named `admins`.
5. Create a document whose document ID is exactly that UID, for example `admins/PASTE_UID_HERE`. A field such as `enabled: true` may be added; the document's existence is what the current rules check.

Only create this document yourself in the Firebase Console. The website cannot grant admin privileges.

## 5. Current behavior and limitations

- The Config Vault reads approved documents from `configs`.
- Imported configs stay in the current browser's local storage until the signed-in user submits them.
- New submissions are stored in `submissions` with status `pending`.
- The moderation page allows only the UID listed in `admins` to review and approve/reject submissions.
- The main graph workspace in `index.html` still stores its graph and settings locally. This first integration does not sync graph data between devices.
- Public voting/download counters and trusted server-side aggregation are not implemented in this phase.
- No Cloud Functions, service-account key, or billing upgrade is required for this first phase.

If the catalog shows a Firestore permission error, check that the published rules match `firestore.rules`, that Email/Password is enabled, and that the moderator UID document exists.
