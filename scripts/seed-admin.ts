#!/usr/bin/env bun
import { auth } from '@/core/auth'

await auth.api.createUser({
  body: {
    email: 'admin@example.com',
    password: 'password',
    name: 'Admin',
    role: 'admin',
  },
})

console.log('Created admin@example.com.')
