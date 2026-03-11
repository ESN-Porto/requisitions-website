"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { getFirebaseAuth, googleProvider, getFirebaseDb } from "@/lib/firebase";

const AUTO_ADMIN_EMAILS = [
    "wpa@esnporto.org",
    "office.team@esnporto.org",
    "treasurer@esnporto.org",
];

const AuthContext = createContext({});

/**
 * Check if an email is allowed to create an account.
 * @esnporto.org emails are always allowed.
 * Other emails must be in the allowlist (unless allowAllEmails is true).
 */
async function isEmailAllowed(email) {
    if (!email) return false;
    const lower = email.toLowerCase();

    // @esnporto.org emails are always allowed
    if (lower.endsWith("@esnporto.org")) return true;

    try {
        const settingsDoc = await getDoc(doc(getFirebaseDb(), "settings", "emailAllowlist"));
        if (!settingsDoc.exists()) {
            // If no settings doc exists yet, deny non-ESN emails by default
            return false;
        }
        const data = settingsDoc.data();
        if (data.allowAllEmails) return true;

        const allowedEmails = (data.emails || []).map((e) => e.toLowerCase());
        return allowedEmails.includes(lower);
    } catch (error) {
        console.error("Error checking email allowlist:", error);
        return false;
    }
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (firebaseUser) => {
            if (firebaseUser) {
                const userDocRef = doc(getFirebaseDb(), "users", firebaseUser.uid);
                const userDoc = await getDoc(userDocRef);

                if (userDoc.exists()) {
                    // Existing user — always let them in
                    setUser(firebaseUser);
                    setUserData({ id: firebaseUser.uid, ...userDoc.data() });
                    setAuthError(null);
                } else {
                    // First login — check if email is allowed before creating profile
                    const allowed = await isEmailAllowed(firebaseUser.email);

                    if (!allowed) {
                        // Not authorized — sign out and show error
                        await signOut(getFirebaseAuth());
                        setUser(null);
                        setUserData(null);
                        setAuthError(
                            "Please use your ESN mailing list email to sign in. If you have problems, contact the IT manager."
                        );
                        setLoading(false);
                        return;
                    }

                    // Allowed — create user profile
                    const isAutoAdmin = AUTO_ADMIN_EMAILS.includes(
                        firebaseUser.email?.toLowerCase()
                    );

                    const newUserData = {
                        email: firebaseUser.email,
                        name: firebaseUser.displayName,
                        photoURL: firebaseUser.photoURL,
                        role: isAutoAdmin ? "admin" : "member",
                        createdAt: serverTimestamp(),
                    };
                    await setDoc(userDocRef, newUserData);
                    setUser(firebaseUser);
                    setUserData({ id: firebaseUser.uid, ...newUserData });
                    setAuthError(null);
                }
            } else {
                setUser(null);
                setUserData(null);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const signInWithGoogle = async () => {
        try {
            setAuthError(null);
            await signInWithPopup(getFirebaseAuth(), googleProvider);
        } catch (error) {
            console.error("Sign in error:", error);
        }
    };

    const logout = async () => {
        try {
            await signOut(getFirebaseAuth());
        } catch (error) {
            console.error("Sign out error:", error);
        }
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                userData,
                loading,
                authError,
                signInWithGoogle,
                logout,
                isAdmin: userData?.role === "admin",
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);