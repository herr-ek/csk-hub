import Link from "next/link"
import type { ComponentProps, ReactNode } from "react"
import { app } from "@/core/config/app"
import { cn } from "@/shared/utils"
import { ROUTES } from "./site"

type NavigationFrameProps = Omit<ComponentProps<"header">, "children"> & {
  /** The links in the middle, from `md` up. */
  links?: ReactNode
  /** What sits at the far end, such as the menu button on small screens. */
  end?: ReactNode
  /** The avatar: at the start on small screens, at the end from `md` up. It draws its own ring (`avatar-ring`). */
  account?: ReactNode
}

/**
 * The header: on small screens a bar with the title in the middle, from `md` up text floating over the page, which
 * blurs away beneath it, with the title at the start. It is `--header-height` tall from `md` up.
 *
 * Collapsing: `CollapsingHeader` sets `data-collapsed` on it, and the title here, `TopNavigation` and the
 * `compact-nav` variant in `globals.css` read it.
 */
export function NavigationFrame({ links, end, account, ...props }: NavigationFrameProps) {
  return (
    <>
      <header
        data-navigation=""
        className={cn(
          "group/nav sticky top-0 z-50 border-b bg-background md:pointer-events-none md:fixed md:inset-x-0 md:border-b-0 md:bg-transparent",
          // Keeps the header readable over whatever scrolls beneath it, without a box around it.
          "md:before:absolute md:before:inset-x-0 md:before:top-0 md:before:-z-10 md:before:h-[calc(var(--header-height)_+_2.25rem)] md:before:mask-b-from-60% md:before:bg-background/80 md:before:backdrop-blur-lg"
        )}
        {...props}
      >
        <div className="mx-auto grid w-full max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3 sm:px-6 md:h-(--header-height) lg:px-8">
          <Link
            href={ROUTES.home}
            className="pointer-events-auto col-start-2 row-start-1 rounded-md font-semibold text-base tracking-normal outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-safe:transition-opacity motion-safe:duration-300 md:col-start-1 md:flex md:h-11 md:items-center md:justify-self-start md:group-data-collapsed/nav:pointer-events-none md:group-data-collapsed/nav:opacity-0"
          >
            {app.name}
          </Link>
          {links ? <div className="pointer-events-auto col-start-2 row-start-1 hidden md:block">{links}</div> : null}
          {end ? <div className="pointer-events-auto col-start-3 row-start-1 justify-self-end">{end}</div> : null}
          {account ? (
            <div className="pointer-events-auto relative col-start-1 row-start-1 justify-self-start md:col-start-3 md:justify-self-end md:p-2">
              {account}
            </div>
          ) : null}
        </div>
      </header>
      {/* The room the floating header takes, the same whether or not it is collapsed. */}
      <div aria-hidden="true" className="hidden h-(--header-height) shrink-0 md:block" />
    </>
  )
}
