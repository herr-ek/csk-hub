"use client"

import { useTheme } from "@wrksz/themes/client"
import { Moon, Sun } from "lucide-react"

import { Button } from "@/shared/ui/base/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/shared/ui/base/dropdown-menu"

export type ModeToggleLabels = {
  dark: string
  light: string
  system: string
  toggle: string
}

export function ModeToggle({ labels }: { labels: ModeToggleLabels }) {
  const { setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="icon">
            <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
            <span className="sr-only">{labels.toggle}</span>
          </Button>
        }
      ></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>{labels.light}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>{labels.dark}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>{labels.system}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
