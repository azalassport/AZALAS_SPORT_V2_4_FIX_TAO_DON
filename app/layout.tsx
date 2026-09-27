import "./globals.css";
import type { Metadata, Viewport } from "next";
export const metadata:Metadata={title:"AZALAS Sport | Vận hành",description:"Bứt phá doanh số · Làm chủ đường đua"};
// Keep accessibility zoom; 16px inputs prevent iOS auto-zoom on focus.
export const viewport:Viewport={width:"device-width",initialScale:1,themeColor:"#0a2560"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="vi"><body>{children}</body></html>}
