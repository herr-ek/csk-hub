import Link from "next/link"
import type { ComponentProps } from "react"
import { app } from "@/core/config/app"
import { cn } from "@/shared/utils"
import { ROUTES } from "./site"

/**
 * The header's title, with room around it for the rest as grid cells: on small screens a bar with the title in the
 * middle column, from `md` up text floating over the page, which blurs away beneath it, with the title in the first.
 */
export function NavigationFrame({ children, ...props }: ComponentProps<"header">) {
  return (
    <>
      <header
        data-navigation=""
        className={cn(
          "group/nav sticky top-0 z-50 border-b bg-background md:pointer-events-none md:fixed md:inset-x-0 md:border-b-0 md:bg-transparent",
          // Keeps the header readable over whatever scrolls beneath it, without a box around it.
          "md:before:absolute md:before:inset-x-0 md:before:top-0 md:before:-z-10 md:before:h-28 md:before:mask-b-from-60% md:before:bg-background/80 md:before:backdrop-blur-lg"
        )}
        {...props}
      >
        <div className="mx-auto grid w-full max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link
            href={ROUTES.home}
            className="pointer-events-auto col-start-2 row-start-1 rounded-md font-semibold text-base tracking-normal outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-safe:transition-opacity motion-safe:duration-300 md:col-start-1 md:flex md:h-11 md:items-center md:justify-self-start md:group-data-collapsed/nav:pointer-events-none md:group-data-collapsed/nav:opacity-0"
          >
            {app.name}
          </Link>
          {children}
        </div>
      </header>
      {/* The room the floating header takes, the same whether or not it is collapsed. */}
      <div aria-hidden="true" className="hidden h-19 shrink-0 md:block" />
    </>
  )
}
