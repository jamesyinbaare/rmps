"use client";

import { Card, CardContent, CardHeader, CardTitle } from "./Card";
import { ArrowDown, ArrowUp, MoreVertical } from "lucide-react";
import { Button } from "./Button";

const transactions = [
  {
    id: 1,
    type: "sent",
    name: "Kwame Mensah",
    amount: 250.00,
    date: "Today, 2:30 PM",
    status: "completed",
  },
  {
    id: 2,
    type: "received",
    name: "Ama Asante",
    amount: 500.00,
    date: "Yesterday, 4:15 PM",
    status: "completed",
  },
  {
    id: 3,
    type: "bill",
    name: "ECG Bill Payment",
    amount: 120.50,
    date: "2 days ago",
    status: "completed",
  },
  {
    id: 4,
    type: "sent",
    name: "Kofi Boateng",
    amount: 75.00,
    date: "3 days ago",
    status: "pending",
  },
];

export function RecentTransactions() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Recent Transactions</CardTitle>
        <Button variant="ghost" size="sm">
          View All
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {transactions.map((transaction) => (
            <div
              key={transaction.id}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${
                    transaction.type === "sent"
                      ? "bg-[var(--destructive)]/10 text-[var(--destructive)]"
                      : transaction.type === "received"
                      ? "bg-[var(--success)]/10 text-[var(--success)]"
                      : "bg-[var(--accent)]/10 text-[var(--accent)]"
                  }`}
                >
                  {transaction.type === "sent" ? (
                    <ArrowUp className="h-5 w-5" />
                  ) : transaction.type === "received" ? (
                    <ArrowDown className="h-5 w-5" />
                  ) : (
                    <ArrowDown className="h-5 w-5" />
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="font-medium text-sm">{transaction.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {transaction.date}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p
                    className={`font-semibold ${
                      transaction.type === "sent"
                        ? "text-[var(--destructive)]"
                        : "text-[var(--success)]"
                    }`}
                  >
                    {transaction.type === "sent" ? "-" : "+"}₵{" "}
                    {transaction.amount.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {transaction.status}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
