"use client";

import { useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/api";
import type { User } from "@/types";
import { UserMenu } from "./UserMenu";

export function TopBar() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .catch(() => {
        // Handle error
      });
  }, []);

  return (
    <div className="flex h-16 items-center justify-between border-b bg-card px-6">
      <div>
        <h1 className="text-xl font-semibold">Staff Dashboard</h1>
      </div>
      <div className="flex items-center gap-4">
        {user && <UserMenu user={user} />}
      </div>
    </div>
  );
}
