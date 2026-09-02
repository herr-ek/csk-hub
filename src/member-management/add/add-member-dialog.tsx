"use client"

import { useState } from "react"
import { Button } from "@/shared/ui/base/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/shared/ui/base/dialog"
import { AddMemberForm } from "./add-member-form"

export function AddMemberDialog() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button">Add member</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add member</DialogTitle>
          <DialogDescription>Create a new account for a CSK member.</DialogDescription>
        </DialogHeader>
        <AddMemberForm />
      </DialogContent>
    </Dialog>
  )
}
