import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp() {
    if (getApps().length > 0) return getApps()[0];

    // Option 1: Use service account JSON file (recommended for production)
    // Set GOOGLE_APPLICATION_CREDENTIALS env var to the path of your service account JSON
    // or provide the credentials directly:
    if (process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT);
        return initializeApp({
            credential: cert(serviceAccount),
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        });
    }

    // Option 2: Default credentials (works in Google Cloud environments)
    return initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
}

let _adminAuth, _adminDb;

export function getAdminAuth() {
    if (!_adminAuth) _adminAuth = getAuth(getAdminApp());
    return _adminAuth;
}

export function getAdminDb() {
    if (!_adminDb) _adminDb = getFirestore(getAdminApp());
    return _adminDb;
}
