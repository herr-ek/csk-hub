import { z } from "zod"
import { locales } from "./locales"

export const localeSchema = z.enum(locales)
