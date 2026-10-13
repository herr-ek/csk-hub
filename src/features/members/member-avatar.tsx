import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/base/avatar"
import { cn } from "@/shared/utils"

export function MemberAvatar({ name, image, large = false }: { name: string; image: string | null; large?: boolean }) {
  const parts = name.trim().split(/\s+/u).filter(Boolean)
  const initials = [parts[0]?.[0], parts.length > 1 ? parts.at(-1)?.[0] : undefined]
    .filter(Boolean)
    .join("")
    .toLocaleUpperCase()
  return (
    <Avatar className={cn("size-14", large && "size-24 sm:size-28")} aria-hidden="true">
      {image ? <AvatarImage src={image} alt="" referrerPolicy="no-referrer" /> : null}
      <AvatarFallback
        className={cn("bg-primary/10 font-heading text-lg font-semibold text-foreground", large && "text-3xl")}
      >
        {initials || "?"}
      </AvatarFallback>
    </Avatar>
  )
}
