import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'Berthier — Karargâh',description:'Dikte et. Emrini onayla. Hamleni yap.',manifest:'/manifest.webmanifest',icons:{icon:'/favicon.svg',apple:'/icon-192.png'},appleWebApp:{capable:true,statusBarStyle:'black',title:'Berthier'}};
export const viewport: Viewport = {width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#18191b'};
export default function Layout({children}:{children:React.ReactNode}) { return <html lang="tr" className="dark"><head><link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet"/></head><body>{children}</body></html>; }
