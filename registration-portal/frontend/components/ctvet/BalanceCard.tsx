"use client";

import { Card, CardContent, CardHeader } from "./Card";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button } from "./Button";

export function BalanceCard() {
  const [showBalance, setShowBalance] = useState(true);

  return (
    <Card className="bg-gradient-to-br from-[var(--primary)] via-[var(--primary)]/90 to-[var(--primary)]/80 text-[var(--primary-foreground)] border-0 shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex flex-col">
          <p className="text-sm font-medium opacity-90">Total Balance</p>
          <div className="flex items-center gap-2 mt-2">
            <h2 className="text-4xl font-bold">
              {showBalance ? "₵ 12,450.00" : "₵ •••••"}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-[var(--primary-foreground)] hover:bg-[var(--primary-foreground)]/20"
              onClick={() => setShowBalance(!showBalance)}
            >
              {showBalance ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between text-sm">
          <div>
            <p className="opacity-80">Available</p>
            <p className="text-lg font-semibold">
              {showBalance ? "₵ 12,450.00" : "₵ •••••"}
            </p>
          </div>
          <div className="text-right">
            <p className="opacity-80">Savings</p>
            <p className="text-lg font-semibold">
              {showBalance ? "₵ 3,200.00" : "₵ •••••"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
