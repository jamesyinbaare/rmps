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

  const getDashboardTitle = () => {
    if (!user) return "Dashboard";
    switch (user.user_type) {
      case "PRIVATE_USER":
        return "CTVET Private Candidate Examination Portal";
      case "SCHOOL_ADMIN":
      case "SCHOOL_USER":
        return "School Dashboard";
      case "SYSTEM_ADMIN":
        return "Admin Dashboard";
      default:
        return "Staff Dashboard";
    }
  };

  return (
    <div className="flex h-16 items-center justify-between border-b bg-card px-6">
      <div>
        <h1 className="text-xl font-semibold">{getDashboardTitle()}</h1>
      </div>
      <div className="flex items-center gap-4">
        {user && <UserMenu user={user} />}
      </div>
    </div>
  );
}
