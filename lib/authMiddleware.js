import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

/**
 * Verify the Firebase ID token from the Authorization header.
 * Returns { uid, email, ... } on success, or null on failure.
 */
export async function verifyAuth(request) {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return null;
    }

    const token = authHeader.split(" ")[1];
    if (!token) return null;

    try {
        // Checks signature, expiry, audience, issuer
        const decoded = await getAdminAuth().verifyIdToken(token, /* checkRevoked */ true);
        return decoded;
    } catch (error) {
        console.error("Token verification failed:", error.code || error.message);
        return null;
    }
}

/**
 * Check if a user has admin role in Firestore.
 */
export async function isUserAdmin(uid) {
    try {
        const userDoc = await getAdminDb().collection("users").doc(uid).get();
        if (!userDoc.exists) return false;
        return userDoc.data()?.role === "admin";
    } catch (error) {
        console.error("Admin check failed:", error);
        return false;
    }
}

/**
 * Combined: verify auth + require admin role.
 */
export async function verifyAdmin(request) {
    const user = await verifyAuth(request);
    if (!user) {
        console.log("Falha no verifyAuth: Token inválido ou ausente");
        return null;
    }

    console.log("Usuário autenticado no servidor:", user.uid);

    const admin = await isUserAdmin(user.uid);
    if (!admin) {
        console.log("Falha no isUserAdmin: Usuário não tem role admin no Firestore");
        return null;
    }

    return { user, isAdmin: true };
}