import { ThemeProvider } from "@wrksz/themes/next"
import type { Metadata } from "next"
import { Geist, Geist_Mono, Inter } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/shared/ui/base/toast"
import { cn } from "@/shared/utils"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"]
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"]
})

export const metadata: Metadata = {
  title: "CSK Hub",
  description: "Chalmers Sångkörs digitala nav",
  applicationName: "CSK Hub",
  icons: {
    icon: [
      {
        url: "/favicon-light-16x16.png",
        media: "(prefers-color-scheme: light)",
        sizes: "16x16",
        type: "image/png"
      },
      {
        url: "/favicon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
        sizes: "32x32",
        type: "image/png"
      },
      {
        url: "/favicon-dark-16x16.png",
        media: "(prefers-color-scheme: dark)",
        sizes: "16x16",
        type: "image/png"
      },
      {
        url: "/favicon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
        sizes: "32x32",
        type: "image/png"
      }
    ]
  },
  appleWebApp: {
    capable: true,
    title: "CSK Hub"
  }
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", inter.variable)}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
