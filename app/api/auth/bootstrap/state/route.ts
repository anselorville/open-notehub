import { NextResponse } from 'next/server'
import {
  hasOwnerAccount,
  requiresBootstrapSetupCode,
} from '@/lib/auth-server'

export async function GET() {
  const needsBootstrap = !(await hasOwnerAccount())

  return NextResponse.json({
    needsBootstrap,
    requiresSetupCode: needsBootstrap && requiresBootstrapSetupCode(),
  })
}
