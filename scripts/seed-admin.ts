#!/usr/bin/env bun
import { describeOutcome, seedAdmin } from "@/lib/auth/seed-admin";

const email = process.env.ADMIN_EMAIL?.trim();

if (!email) {
  console.error(
    "ADMIN_EMAIL is not set. Set it to the address of the first Admin and run again.",
  );
  process.exit(1);
}

try {
  console.log(describeOutcome(await seedAdmin(email)));
  // The connection pool keeps the event loop alive; nothing else is pending.
  process.exit(0);
} catch (error) {
  console.error("Could not seed the first Admin:", error);
  process.exit(1);
}
