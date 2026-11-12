import { Inter } from "next/font/google";
import { AuthProvider } from "@/contexts/AuthContext";
import { getSessionContext } from "@/lib/auth/permissions";
import "./globals.css";

const inter = Inter({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-inter",
});

export const metadata = {
    title: "Requisitions Tracker — ESN Porto",
    description:
        "Track who has the cameras, Tondelas, and cards. ESN Porto equipment management.",
    icons: {
        icon: "/assets/favicon.png",
    },
};

// Session lives in cookies → every render is per-request.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }) {
    const session = await getSessionContext();

    return (
        <html lang="en" className={inter.variable} suppressHydrationWarning>
            <body
                style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
                suppressHydrationWarning
            >
                <AuthProvider initial={session}>{children}</AuthProvider>
            </body>
        </html>
    );
}
