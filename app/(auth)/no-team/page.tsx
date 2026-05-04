'use client'

import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Landing for an authenticated user with no team membership. Shown when
 * `requireTeamAccess` throws ForbiddenError or when an orphaned account
 * lands on a dashboard route.
 *
 * The only way OUT of this state is for the team owner / a manager to
 * send an invite to this user's email. Once they redeem the invite the
 * orphaned-account state goes away.
 */
export default function NoTeamPage() {
  const router = useRouter()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>You're not on a team yet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Prospect Intel is invite-only. Ask your team owner or a manager to send
            you an invite to the email address you signed up with — once you redeem
            the invite link, you'll be added to their team and can sign in.
          </p>
          <p className="text-sm text-muted-foreground">
            If you think you've already been invited, double-check the email
            address in your invite matches the one you signed in with.
          </p>
          <Button onClick={signOut} variant="outline" className="w-full">
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
