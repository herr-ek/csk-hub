import { ThemeProvider } from "@wrksz/themes/next"
import type { Metadata } from "next"
import { Geist, Geist_Mono, Inter } from "next/font/google"
import { notFound } from "next/navigation"
import "@/app/globals.css"
import { app } from "@/core/config/app"
import { NextIntlClientProvider } from "@/core/i18n/client"
import { isLocale } from "@/core/i18n/locales"
import { getMessages } from "@/core/i18n/messages"
import { routing } from "@/core/i18n/routing"
import { getLocale, getTranslations } from "@/core/i18n/server"
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata")

  return {
    title: {
      default: app.name,
      template: `%s · ${app.name}`
    },
    description: t("description"),
    applicationName: app.name,
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
      title: app.name
    }
  }
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale()

  if (!isLocale(locale)) {
    notFound()
  }

  return (
    <html
      lang={locale}
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", inter.variable)}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider
          locale={locale}
          // TODO: Split up per feature if performance gets bad
          messages={getMessages(locale)}
          formats={{}}
          timeZone="UTC"
        >
          <ThemeProvider>
            {children}
            <Toaster />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
