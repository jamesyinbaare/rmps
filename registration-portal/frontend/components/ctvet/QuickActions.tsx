"use client";

import { Button } from "./Button";
import { Send, ArrowDownUp, CreditCard, PiggyBank, FileText, Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./Card";

const actions = [
  { icon: Send, label: "Send Money", variant: "default" as const },
  { icon: ArrowDownUp, label: "Transfer", variant: "secondary" as const },
  { icon: CreditCard, label: "Pay Bills", variant: "success" as const },
  { icon: PiggyBank, label: "Save", variant: "outline" as const },
  { icon: FileText, label: "Statements", variant: "outline" as const },
  { icon: Phone, label: "Airtime", variant: "outline" as const },
] as const;

export function QuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.label}
                variant={action.variant}
                className="flex flex-col h-auto py-4 gap-2"
              >
                <Icon className="h-6 w-6" />
                <span className="text-xs font-medium">{action.label}</span>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
