import { Inter } from "next/font/google";
import { AuthProvider } from "@/contexts/AuthContext";
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

export default function RootLayout({ children }) {
    return (
        <html lang="en" className={inter.variable} suppressHydrationWarning>
            <body
                style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
                suppressHydrationWarning
            >
                <AuthProvider>{children}</AuthProvider>
            </body>
        </html>
    );
}
