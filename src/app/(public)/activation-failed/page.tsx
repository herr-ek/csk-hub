import type { Metadata } from "next"
import { ActivationFailed } from "@/account/activation"

export const metadata: Metadata = {
  title: "Activation link expired · CSK Hub"
}

export default function ActivationFailedPage() {
  return <ActivationFailed />
}
