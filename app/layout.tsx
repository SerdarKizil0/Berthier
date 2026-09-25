import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'Berthier — Karargâh',description:'Dikte et. Emrini onayla. Hamleni yap.',manifest:'/manifest.webmanifest',icons:{icon:'/favicon.svg',apple:'/icon-192.png'},appleWebApp:{capable:true,statusBarStyle:'default',title:'Berthier'}};
export const viewport: Viewport = {width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#183e35'};
export default function Layout({children}:{children:React.ReactNode}) { return <html lang="tr"><body>{children}</body></html>; }
