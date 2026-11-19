const crypto = require("node:crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();
const encryptionKey = defineSecret("CASEGRAPH_TOKEN_ENCRYPTION_KEY");

async function requireAdmin(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in is required.");
  }
  const adminDoc = await db.collection("admins").doc(request.auth.uid).get();
  if (!adminDoc.exists) {
    throw new HttpsError("permission-denied", "Administrator access required.");
  }
}

function getEncryptionKey() {
  const raw = encryptionKey.value();
  let key;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new HttpsError("failed-precondition", "Encryption key is invalid.");
  }
  if (key.length !== 32) {
    throw new HttpsError("failed-precondition", "Encryption key must decode to exactly 32 bytes.");
  }
  return key;
}

exports.setSharedToken = onCall(
  { region: "us-central1", secrets: [encryptionKey], maxInstances: 3 },
  async (request) => {
    await requireAdmin(request);
    const token = request.data && request.data.token;
    if (typeof token !== "string" || token.trim().length < 8 || token.length > 8192) {
      throw new HttpsError("invalid-argument", "Token must contain between 8 and 8192 characters.");
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(token.trim(), "utf8"),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    await db.collection("private").doc("sharedToken").set({
      version: 1,
      algorithm: "AES-256-GCM",
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      updatedBy: request.auth.uid,
      updatedAt: FieldValue.serverTimestamp()
    });

    return { saved: true };
  }
);

exports.getSharedTokenStatus = onCall(
  { region: "us-central1", maxInstances: 3 },
  async (request) => {
    await requireAdmin(request);
    const snapshot = await db.collection("private").doc("sharedToken").get();
    return { configured: snapshot.exists && typeof snapshot.get("ciphertext") === "string" };
  }
);

exports.deleteSharedToken = onCall(
  { region: "us-central1", maxInstances: 3 },
  async (request) => {
    await requireAdmin(request);
    await db.collection("private").doc("sharedToken").delete();
    return { deleted: true };
  }
);
