import "./globals.css";
import type { Metadata } from "next";
export const metadata:Metadata={title:"WiFi Security Auditor",description:"Authorized Wi-Fi security posture and password-strength auditing dashboard"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}