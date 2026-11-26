import type { Metadata } from "next";
import { Oxanium, Roboto } from "next/font/google";
import "./globals.css";

const roboto = Roboto({ variable: "--font-interface", subsets: ["latin"] });
const oxanium = Oxanium({ variable: "--font-display", subsets: ["latin"] });

export const metadata: Metadata = {
  ...(process.env.APP_URL || process.env.URL ? { metadataBase: new URL(process.env.APP_URL || process.env.URL!) } : {}),
  title: "Granize | Controle financeiro na palma da sua mão",
  description: "Cadastre receitas e despesas, acompanhe o saldo e mantenha seus lançamentos organizados em um painel simples e seguro.",
  icons: { icon: "/granize-mark.png" },
  openGraph: {
    title: "Granize | Controle financeiro na palma da sua mão",
    description: "Controle financeiro na palma da sua mão, com painel simples e integração ao WhatsApp.",
    type: "website",
    images: [{ url: "/og.png", width: 2048, height: 1076, alt: "Painel financeiro Granize" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Granize | Controle financeiro na palma da sua mão",
    description: "Cadastro, dashboard e lançamentos financeiros em uma experiência simples.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body className={`${roboto.variable} ${oxanium.variable}`}>{children}</body></html>;
}
