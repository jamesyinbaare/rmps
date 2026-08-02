"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Button,
  Field,
  FieldLabel,
  FieldError,
  FieldControl,
  Input,
} from "@rfdtech/components/next";
import { getCurrentUser, login } from "@/lib/api";
import { normalizeRole } from "@/lib/role-utils";
import { toast } from "sonner";
import { resetLogoutNotification } from "@/lib/auth-utils";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [generalError, setGeneralError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setEmailError("");
    setPasswordError("");
    setGeneralError("");

    if (!email.trim()) {
      setEmailError("Email is required");
      return;
    }

    if (!password) {
      setPasswordError("Password is required");
      return;
    }

    setLoading(true);

    try {
      await login({ email, password });
      resetLogoutNotification();
      toast.success("Login successful");
      const redirect = searchParams.get("redirect");
      if (redirect) {
        window.location.href = redirect;
        return;
      }
      try {
        const user = await getCurrentUser();
        window.location.href =
          normalizeRole(user.role) === "DATACLERK" ? "/clerk" : "/";
      } catch {
        window.location.href = "/";
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Login failed";
      setGeneralError(errorMessage);
      toast.error(errorMessage);
      console.error("Login error:", error);
      setPassword("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      className={["flex flex-col gap-5", className].filter(Boolean).join(" ")}
      {...props}
      onSubmit={handleSubmit}
    >
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-(--clet-text)">
          Login to your account
        </h1>
        <p className="text-sm text-(--clet-text-muted) text-balance">
          Enter your email below to login to your account
        </p>
      </div>

      {generalError ? (
        <div
          role="alert"
          className="rounded-md border px-3 py-2 text-sm"
          style={{
            borderColor: "var(--clet-error)",
            background: "var(--clet-error-bg)",
            color: "var(--clet-error-text)",
          }}
        >
          {generalError}
        </div>
      ) : null}

      <Field invalid={Boolean(emailError)}>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <FieldControl>
          <Input
            id="email"
            type="email"
            placeholder="m@example.com"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError("");
              if (generalError) setGeneralError("");
            }}
            disabled={loading}
            invalid={Boolean(emailError)}
            autoComplete="email"
            data-form-type="other"
          />
        </FieldControl>
        {emailError ? <FieldError>{emailError}</FieldError> : null}
      </Field>

      <Field invalid={Boolean(passwordError)}>
        <FieldLabel htmlFor="password">Password</FieldLabel>
        <FieldControl>
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (passwordError) setPasswordError("");
              if (generalError) setGeneralError("");
            }}
            disabled={loading}
            invalid={Boolean(passwordError)}
            autoComplete="current-password"
            data-form-type="other"
          />
        </FieldControl>
        {passwordError ? <FieldError>{passwordError}</FieldError> : null}
      </Field>

      <Button type="submit" variant="primary" loading={loading} loadingLabel="Logging in...">
        Login
      </Button>
    </form>
  );
}
