"use client";

import { DashboardHeader } from "@/components/ctvet/DashboardHeader";
import { BalanceCard } from "@/components/ctvet/BalanceCard";
import { QuickActions } from "@/components/ctvet/QuickActions";
import { RecentTransactions } from "@/components/ctvet/RecentTransactions";
import { SavingsGoals } from "@/components/ctvet/SavingsGoals";
import { AlertSuccess } from "@/components/ctvet/Alert";

export default function CTVETDashboard() {
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="container mx-auto px-4 py-8">
        {/* Welcome Alert */}
        <div className="mb-6">
          <AlertSuccess
            description="Welcome back! Your account is secure and up to date."
            onClose={() => {}}
          />
        </div>

        {/* Balance Card */}
        <div className="mb-8">
          <BalanceCard />
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <QuickActions />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Transactions */}
          <div>
            <RecentTransactions />
          </div>

          {/* Savings Goals */}
          <div>
            <SavingsGoals />
          </div>
        </div>

        {/* Additional Info Section */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-lg border border-border bg-card">
            <h3 className="font-semibold mb-2">Total Transfers</h3>
            <p className="text-2xl font-bold text-[var(--primary)]">₵ 45,230.00</p>
            <p className="text-sm text-muted-foreground mt-1">This month</p>
          </div>
          <div className="p-6 rounded-lg border border-border bg-card">
            <h3 className="font-semibold mb-2">Bills Paid</h3>
            <p className="text-2xl font-bold text-[var(--success)]">12</p>
            <p className="text-sm text-muted-foreground mt-1">This month</p>
          </div>
          <div className="p-6 rounded-lg border border-border bg-card">
            <h3 className="font-semibold mb-2">Savings Rate</h3>
            <p className="text-2xl font-bold text-[var(--secondary)]">25.7%</p>
            <p className="text-sm text-muted-foreground mt-1">Of income</p>
          </div>
        </div>
      </main>
    </div>
  );
}
