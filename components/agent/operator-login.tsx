"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { operatorLogin, type LoginState } from "@/app/agent/actions"

export function OperatorLogin({ configured }: { configured: boolean }) {
  const [state, formAction, pending] = useActionState<LoginState | null, FormData>(operatorLogin, null)

  return (
    <section className="mt-8 rounded-lg border border-border bg-card p-6">
      <h2 className="font-serif text-xl font-medium text-card-foreground">Operator sign-in</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        This dashboard controls an agent that writes to your repository. Enter the operator secret to manage it.
      </p>

      {!configured ? (
        <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          No operator secret is configured. Set <code className="font-mono">OPERATOR_SECRET</code> (or{" "}
          <code className="font-mono">CRON_SECRET</code>) in Project Settings to enable access.
        </p>
      ) : (
        <form action={formAction} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="secret" className="text-xs uppercase tracking-wider text-muted-foreground">
              Operator secret
            </Label>
            <Input id="secret" name="secret" type="password" autoComplete="current-password" disabled={pending} />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Verifying…" : "Sign in"}
          </Button>
        </form>
      )}

      {state && !state.ok ? <p className="mt-4 text-sm text-destructive">{state.message}</p> : null}
    </section>
  )
}
