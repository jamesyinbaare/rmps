"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { login } from "@/lib/api"
import { toast } from "sonner"
import { resetLogoutNotification } from "@/lib/auth-utils"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [emailError, setEmailError] = useState<string>("")
  const [passwordError, setPasswordError] = useState<string>("")
  const [generalError, setGeneralError] = useState<string>("")

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    // Clear previous errors
    setEmailError("")
    setPasswordError("")
    setGeneralError("")

    // Basic validation
    if (!email.trim()) {
      setEmailError("Email is required")
      return
    }

    if (!password) {
      setPasswordError("Password is required")
      return
    }

    setLoading(true)

    try {
      const response = await login({ email, password })
      // Tokens are already stored by the login function
      // Clear any existing refresh tokens (shouldn't be necessary, but good practice)
      // Reset logout notification flag on successful login
      resetLogoutNotification()
      toast.success("Login successful")
      // Redirect to intended destination or home page
      // Use window.location for immediate redirect to avoid stuck state
      const redirect = searchParams.get("redirect")
      window.location.href = redirect || "/"
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Login failed"

      // Display error message
      setGeneralError(errorMessage)
      toast.error(errorMessage)
      console.error("Login error:", error)

      // Clear password on error for security
      setPassword("")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className={cn("flex flex-col gap-6", className)} {...props} onSubmit={handleSubmit}>
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Login to your account</h1>
          <p className="text-muted-foreground text-sm text-balance">
            Enter your email below to login to your account
          </p>
        </div>
        {generalError && (
          <div className="rounded-md bg-destructive/15 border border-destructive/50 p-3 text-sm text-destructive">
            {generalError}
          </div>
        )}
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            placeholder="m@example.com"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (emailError) setEmailError("")
              if (generalError) setGeneralError("")
            }}
            disabled={loading}
            className={emailError ? "border-destructive" : ""}
            autoComplete="email"
            data-form-type="other"
          />
          {emailError && (
            <p className="text-sm text-destructive mt-1">{emailError}</p>
          )}
        </Field>
        <Field>
          <div className="flex items-center">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <a
              href="#"
              className="ml-auto text-sm underline-offset-4 hover:underline"
            >
              Forgot your password?
            </a>
          </div>
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (passwordError) setPasswordError("")
              if (generalError) setGeneralError("")
            }}
            disabled={loading}
            className={passwordError ? "border-destructive" : ""}
            autoComplete="current-password"
            data-form-type="other"
          />
          {passwordError && (
            <p className="text-sm text-destructive mt-1">{passwordError}</p>
          )}
        </Field>
        <Field>
          <Button type="submit" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </Button>
        </Field>
        <FieldSeparator>Or continue with</FieldSeparator>
        <Field>
          <Button
            variant="outline"
            type="button"
            onClick={() => router.push("/")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path
                d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
                fill="currentColor"
              />
            </svg>
            Login with GitHub
          </Button>
          <FieldDescription className="text-center">
            Don&apos;t have an account?{" "}
            <a href="#" className="underline underline-offset-4">
              Sign up
            </a>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  )
}
