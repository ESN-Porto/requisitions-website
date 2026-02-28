import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getApp() {
    if (getApps().length > 0) return getApps()[0];
    return initializeApp(firebaseConfig);
}

// Lazy initialization — only create Firebase instances when actually used at runtime
let _auth, _db;

export function getFirebaseAuth() {
    if (!_auth) _auth = getAuth(getApp());
    return _auth;
}

export function getFirebaseDb() {
    if (!_db) _db = getFirestore(getApp());
    return _db;
}



export const googleProvider = new GoogleAuthProvider();
