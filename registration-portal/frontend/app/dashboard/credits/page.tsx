"use client";

import { useEffect, useState } from "react";
import {
  getCreditBalance,
  getCreditTransactions,
  purchaseCredits,
  type CreditBalance,
  type CreditTransaction,
  type CreditPurchaseRequest,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Coins, Plus, ArrowUpRight, ArrowDownRight, CreditCard } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function CreditsPage() {
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [purchaseAmount, setPurchaseAmount] = useState(10);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    loadData();
  }, [page]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [balanceData, transactionsData] = await Promise.all([
        getCreditBalance(),
        getCreditTransactions(page, 20),
      ]);
      setBalance(balanceData);
      setTransactions(transactionsData.transactions);
      setTotalPages(transactionsData.total_pages);
    } catch (error: any) {
      toast.error(error.message || "Failed to load credit data");
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    try {
      const response = await purchaseCredits({
        amount: purchaseAmount,
        payment_method: "paystack",
      });

      if (response.payment_url) {
        // Redirect to payment page
        window.location.href = response.payment_url;
      } else {
        toast.success(response.message || "Payment initialized");
        setPurchaseDialogOpen(false);
        await loadData();
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to initialize payment");
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-6 py-8">
        <div className="space-y-4">
          <div className="h-8 bg-gray-200 rounded animate-pulse" />
          <div className="h-64 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Credits</h1>
          <p className="text-gray-600 mt-1">Manage your credit balance</p>
        </div>
        <Dialog open={purchaseDialogOpen} onOpenChange={setPurchaseDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Purchase Credits
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Purchase Credits</DialogTitle>
              <DialogDescription>
                Each verification request costs 1 credit. Minimum purchase is 10 credits.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="amount">Number of Credits</Label>
                <Input
                  id="amount"
                  type="number"
                  value={purchaseAmount}
                  onChange={(e) => setPurchaseAmount(Math.max(10, parseInt(e.target.value) || 10))}
                  min={10}
                />
                <p className="text-sm text-gray-600 mt-1">
                  Cost: GHS {(purchaseAmount * 1.0).toFixed(2)} (1.00 per credit)
                </p>
              </div>
              <Button onClick={handlePurchase} className="w-full">
                <CreditCard className="mr-2 h-4 w-4" />
                Proceed to Payment
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {balance && (
        <div className="grid gap-6 md:grid-cols-3 mb-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <Coins className="h-5 w-5" />
                Current Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{balance.balance.toFixed(2)}</div>
              <p className="text-sm text-gray-600 mt-1">credits</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <ArrowUpRight className="h-5 w-5 text-green-500" />
                Total Purchased
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{balance.total_purchased.toFixed(2)}</div>
              <p className="text-sm text-gray-600 mt-1">credits</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <ArrowDownRight className="h-5 w-5 text-red-500" />
                Total Used
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{balance.total_used.toFixed(2)}</div>
              <p className="text-sm text-gray-600 mt-1">credits</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              No transactions yet
            </div>
          ) : (
            <div className="space-y-4">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex justify-between items-center p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {tx.transaction_type === "purchase" || tx.transaction_type === "admin_assignment" ? (
                        <ArrowUpRight className="h-4 w-4 text-green-500" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 text-red-500" />
                      )}
                      <span className="font-medium capitalize">{tx.transaction_type.replace("_", " ")}</span>
                    </div>
                    {tx.description && (
                      <p className="text-sm text-gray-600 mt-1">{tx.description}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(tx.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <div
                      className={`font-bold ${
                        tx.amount > 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {tx.amount > 0 ? "+" : ""}
                      {tx.amount.toFixed(2)}
                    </div>
                    <div className="text-sm text-gray-600">
                      Balance: {tx.balance_after.toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}

              {totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <span className="flex items-center px-4">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-6">
        <Link href="/dashboard/api-keys">
          <Button variant="outline">Manage API Keys</Button>
        </Link>
      </div>
    </div>
  );
}
