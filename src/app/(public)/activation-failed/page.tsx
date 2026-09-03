import type { Metadata } from "next"
import { ActivationFailed } from "@/features/account/activation"

export const metadata: Metadata = {
  title: "Activation link expired · CSK Hub"
}

export default function ActivationFailedPage() {
  return <ActivationFailed />
}
