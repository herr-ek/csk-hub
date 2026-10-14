import Link from "next/link"
import { Fragment, type ReactNode } from "react"
import { useTranslations } from "@/core/i18n/translations"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@/shared/ui/base/breadcrumb"
import { type MenuRouteId, ROUTES, routeTrail } from "./site"

export interface PageBreadcrumbProps {
  /** The deepest known route; its ancestors come from `ROUTE_PARENTS`. */
  route: MenuRouteId
  /** The page's own label when it sits below `route`, such as a post title. Without it, `route` is the current page. */
  current?: ReactNode
}

/** Shows where a nested page sits in the menu hierarchy. Render it first in the screen's main column. */
export function PageBreadcrumb({ route, current }: PageBreadcrumbProps) {
  const t = useTranslations("Navigation")
  const trail = routeTrail(route)
  const links = current === undefined ? trail.slice(0, -1) : trail
  const page = current === undefined ? t(`routes.${route}`) : current

  return (
    <Breadcrumb aria-label={t("breadcrumb")}>
      <BreadcrumbList className="flex-nowrap">
        {links.map((id) => (
          <Fragment key={id}>
            <BreadcrumbItem className="shrink-0">
              <BreadcrumbLink render={<Link href={ROUTES[id]} />}>{t(`routes.${id}`)}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </Fragment>
        ))}
        <BreadcrumbItem className="min-w-0">
          <BreadcrumbPage className="truncate">{page}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}
