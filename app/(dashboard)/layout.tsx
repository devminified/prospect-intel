'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useCurrentTeam } from '@/lib/queries/team'
import { useUpworkAccess } from '@/lib/queries/upwork-profiles'

/**
 * Nav links + the role gate for each. Mirrors the role matrix in
 * lib/rbac.ts and the per-module isolation rule (outbound vs Upwork):
 *
 *   Outbound module (existing):
 *     - Dashboard / Leads / Team open to outbound roles (every team
 *       role except `bidder` — bidders are Upwork-only).
 *     - Plans / Batches / ICP are the `createWork` set: owner,
 *       manager, lead_gen.
 *     - Email is owner-only — single team mailbox.
 *
 *   Upwork module (Phase 11A+):
 *     - Visible only when `useUpworkAccess()` reports has_access.
 *       Owner always passes; everyone else needs an explicit
 *       upwork_profile_members row. The team-wide `manager` role does
 *       NOT confer Upwork access — outbound manager ≠ Upwork manager.
 *
 * `roles` undefined = visible to anyone with team membership; the page
 * itself still gates write actions.
 */
const OUTBOUND_BASE_ROLES = ['owner', 'manager', 'lead_gen', 'cold_caller', 'closer']
const CREATE_WORK_ROLES = ['owner', 'manager', 'lead_gen']
const OUTBOUND_NAV: Array<{ href: string; label: string; roles?: string[] }> = [
  { href: '/dashboard', label: 'Dashboard', roles: OUTBOUND_BASE_ROLES },
  { href: '/leads', label: 'Leads', roles: OUTBOUND_BASE_ROLES },
  { href: '/plans', label: 'Plans', roles: CREATE_WORK_ROLES },
  { href: '/batches', label: 'Batches', roles: CREATE_WORK_ROLES },
  { href: '/settings/icp', label: 'ICP', roles: CREATE_WORK_ROLES },
  { href: '/settings/email', label: 'Email', roles: ['owner'] },
  { href: '/settings/team', label: 'Team' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()
  const teamQ = useCurrentTeam()
  const upworkAccessQ = useUpworkAccess()
  const myRole = teamQ.data?.my_role ?? null
  const upworkAccess = upworkAccessQ.data
  // While role is unknown, hide role-gated items rather than flashing
  // them and yanking them away.
  const visibleOutboundNav = OUTBOUND_NAV.filter(
    (n) => !n.roles || (myRole && n.roles.includes(myRole))
  )
  const showUpworkTab = !!upworkAccess?.has_access

  // Pure-bidder redirect: if the user has only Upwork access (team role
  // 'bidder' with profile membership) and they land on an outbound-only
  // route, bounce them to /upwork. Owners and outbound roles aren't
  // touched.
  useEffect(() => {
    if (!upworkAccess) return
    if (!upworkAccess.is_pure_upwork) return
    if (pathname.startsWith('/upwork')) return
    if (pathname.startsWith('/no-team')) return
    router.replace('/upwork')
  }, [upworkAccess, pathname, router])

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
      if (!user) {
        router.push('/login')
        return
      }
      // Authenticated but no team membership → orphan account.
      // Bounce to /no-team rather than letting them hit dashboard
      // routes that will all 403. /api/team is the canonical probe —
      // it throws ForbiddenError when there's no team.
      void (async () => {
        try {
          const { data: sessionData } = await supabase.auth.getSession()
          const token = sessionData.session?.access_token
          if (!token) return
          const res = await fetch('/api/team', {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (res.status === 403) router.push('/no-team')
        } catch {
          // best-effort — transient probe failure shouldn't yank the user.
        }
      })()
      void registerSelfIp()
    }

    // Capture this session's IP so the open-tracking pixel can flag opens
    // that originate from the sender (e.g. browsing the Sent folder in Zoho)
    // and exclude them from real-recipient open counts.
    const registerSelfIp = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (!token) return
        await fetch('/api/auth/heartbeat', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
      } catch {
        // best-effort, ignore
      }
    }

    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          router.push('/login')
        } else if (event === 'SIGNED_IN') {
          setUser(session.user)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  // Hold the shell until role + upwork access have settled. Without
  // this the page paints with default route (e.g. /dashboard), the
  // pure-bidder redirect fires once `upworkAccessQ` resolves, and the
  // user sees a flash → bounce to /upwork. Both queries have a 60s
  // staleTime, so this only adds a loader on first mount per session.
  const rolesSettled = !teamQ.isPending && !upworkAccessQ.isPending
  // The pure-bidder redirect runs in a useEffect, which fires AFTER the
  // first render with settled data. Stay on the loader while the
  // redirect is imminent so children never paint on the wrong route.
  const pureBidderRedirectPending =
    !!upworkAccess?.is_pure_upwork &&
    !pathname.startsWith('/upwork') &&
    !pathname.startsWith('/no-team')
  if (loading || (user && (!rolesSettled || pureBidderRedirectPending))) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    )
  }
  if (!user) return null

  return (
    <div className="min-h-screen bg-muted/30">
      <nav className="bg-background border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-6">
              <h1 className="text-xl font-semibold">Prospect Intel</h1>
              <nav className="hidden md:flex gap-1 text-sm">
                {visibleOutboundNav.map((n) => {
                  const active = pathname === n.href || pathname.startsWith(`${n.href}/`)
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      className={cn(
                        'px-3 py-1.5 rounded-md transition-colors',
                        active
                          ? 'bg-secondary text-secondary-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      {n.label}
                    </Link>
                  )
                })}
                {showUpworkTab && (
                  <>
                    {visibleOutboundNav.length > 0 && (
                      <span className="mx-2 self-center h-5 w-px bg-border" aria-hidden />
                    )}
                    <Link
                      href="/upwork"
                      className={cn(
                        'px-3 py-1.5 rounded-md transition-colors',
                        pathname.startsWith('/upwork')
                          ? 'bg-secondary text-secondary-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      Upwork
                    </Link>
                  </>
                )}
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground hidden sm:inline">{user.email}</span>
              <Button variant="outline" size="sm" onClick={handleLogout}>Logout</Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">{children}</div>
      </div>
    </div>
  )
}
