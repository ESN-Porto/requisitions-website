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

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (firebaseUser) => {
            if (firebaseUser) {
                setUser(firebaseUser);
                const userDoc = await getDoc(doc(getFirebaseDb(), "users", firebaseUser.uid));
                if (userDoc.exists()) {
                    setUserData({ id: firebaseUser.uid, ...userDoc.data() });
                } else {
                    // First login — create user profile
                    // Check if they are in the strict auto-admin list
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
                    await setDoc(doc(getFirebaseDb(), "users", firebaseUser.uid), newUserData);
                    setUserData({ id: firebaseUser.uid, ...newUserData });
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