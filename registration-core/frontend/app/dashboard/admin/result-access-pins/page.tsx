"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  generateResultAccessPins,
  listResultAccessPins,
  updateResultAccessPin,
} from "@/lib/api";
import type {
  ResultAccessPin,
  ResultAccessPinCreate,
  ResultAccessPinUpdate,
} from "@/types";
import { toast } from "sonner";
import { Plus, RefreshCw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatStrip } from "@/components/dashboard/StatStrip";

export default function ResultAccessPinsPage() {
  const [pins, setPins] = useState<ResultAccessPin[]>([]);
  const [loading, setLoading] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [isActiveFilter, setIsActiveFilter] = useState<boolean | undefined>(undefined);

  // Generate form state
  const [count, setCount] = useState<string>("10");
  const [maxUses, setMaxUses] = useState<string>("5");

  useEffect(() => {
    loadPins();
  }, [isActiveFilter]);

  const loadPins = async () => {
    setLoading(true);
    try {
      const pinList = await listResultAccessPins(isActiveFilter);
      setPins(pinList);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load PIN/Serial combinations");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    const countNum = parseInt(count);
    const maxUsesNum = parseInt(maxUses);

    if (!countNum || countNum < 1 || countNum > 1000) {
      toast.error("Count must be between 1 and 1000");
      return;
    }

    if (maxUsesNum && (maxUsesNum < 1 || maxUsesNum > 1000)) {
      toast.error("Max uses must be between 1 and 1000");
      return;
    }

    try {
      const pinData: ResultAccessPinCreate = {
        count: countNum,
        max_uses: maxUsesNum || undefined,
      };

      const generated = await generateResultAccessPins(pinData);
      toast.success(`Successfully generated ${generated.length} PIN/Serial combinations`);
      setGenerateDialogOpen(false);
      setCount("10");
      setMaxUses("5");
      await loadPins();
    } catch (error: any) {
      toast.error(error?.message || "Failed to generate PIN/Serial combinations");
      console.error(error);
    }
  };

  const handleToggleActive = async (pin: ResultAccessPin) => {
    try {
      const updateData: ResultAccessPinUpdate = {
        is_active: !pin.is_active,
      };

      await updateResultAccessPin(pin.id, updateData);
      toast.success(
        `PIN/Serial combination ${pin.is_active ? "deactivated" : "activated"}`
      );
      await loadPins();
    } catch (error: any) {
      toast.error(error?.message || "Failed to update PIN/Serial combination");
      console.error(error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  // Calculate statistics
  const statistics = {
    total: pins.length,
    active: pins.filter((p) => p.is_active).length,
    inactive: pins.filter((p) => !p.is_active).length,
    used: pins.filter((p) => p.current_uses > 0).length,
    unused: pins.filter((p) => p.current_uses === 0).length,
    maxedOut: pins.filter((p) => p.current_uses >= p.max_uses).length,
    totalUses: pins.reduce((sum, p) => sum + p.current_uses, 0),
    averageUses: pins.length > 0 ? (pins.reduce((sum, p) => sum + p.current_uses, 0) / pins.length).toFixed(2) : "0",
    tiedToCandidate: pins.filter((p) => p.first_used_registration_number !== null).length,
  };

  const usageRate =
    statistics.total > 0
      ? `${((statistics.used / statistics.total) * 100).toFixed(1)}%`
      : "0%";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Result Access PIN/Serial Management"
        subtitle="Generate and manage PIN/Serial combinations for accessing public results"
        actions={
          <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Generate PIN/Serial
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generate PIN/Serial Combinations</DialogTitle>
                <DialogDescription>
                  Generate new PIN/Serial combinations for result access. Each combination
                  can be used a limited number of times.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="count">
                    Number to Generate <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="count"
                    type="number"
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                    min="1"
                    max="1000"
                    placeholder="e.g., 10"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter how many PIN/Serial combinations to generate (1-1000)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxUses">Maximum Uses (Optional)</Label>
                  <Input
                    id="maxUses"
                    type="number"
                    value={maxUses}
                    onChange={(e) => setMaxUses(e.target.value)}
                    min="1"
                    max="1000"
                    placeholder="e.g., 5"
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum number of times each combination can be used (defaults to 5 if
                    not specified)
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setGenerateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleGenerate}>Generate</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <StatStrip
        items={[
          {
            label: "Total PINs",
            value: statistics.total,
            hint: "All generated PIN/Serial combinations",
          },
          {
            label: "Active PINs",
            value: statistics.active,
            hint:
              statistics.inactive > 0 ? `${statistics.inactive} inactive` : "All active",
          },
          {
            label: "Used PINs",
            value: statistics.used,
            hint: statistics.unused > 0 ? `${statistics.unused} unused` : "All used",
          },
          {
            label: "Total Uses",
            value: statistics.totalUses,
            hint: `Avg ${statistics.averageUses} uses per PIN`,
          },
          {
            label: "Tied to Candidates",
            value: statistics.tiedToCandidate,
            hint: "PINs used at least once (locked to candidate)",
          },
          {
            label: "Maxed Out",
            value: statistics.maxedOut,
            hint: "PINs that reached usage limit",
          },
          {
            label: "Usage Rate",
            value: usageRate,
            hint: "Percentage of PINs that have been used",
          },
        ]}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>PIN/Serial Combinations</CardTitle>
              <CardDescription>
                Manage PIN/Serial combinations and view usage statistics
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <Select
                value={isActiveFilter === undefined ? "all" : isActiveFilter ? "active" : "inactive"}
                onValueChange={(value) => {
                  if (value === "all") setIsActiveFilter(undefined);
                  else setIsActiveFilter(value === "active");
                }}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={loadPins}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : pins.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No PIN/Serial combinations found. Generate some to get started.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PIN</TableHead>
                    <TableHead>Serial Number</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Max Uses</TableHead>
                    <TableHead>First Used For</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created By</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead>Expires At</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pins.map((pin) => (
                    <TableRow key={pin.id}>
                      <TableCell className="font-mono">{pin.pin}</TableCell>
                      <TableCell className="font-mono">{pin.serial_number}</TableCell>
                      <TableCell>
                        <span className="font-semibold">{pin.current_uses}</span>
                        {pin.current_uses >= pin.max_uses && (
                          <Badge variant="destructive" className="ml-2">
                            Maxed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{pin.max_uses}</TableCell>
                      <TableCell>
                        {pin.first_used_registration_number ? (
                          <div className="text-sm">
                            <div className="font-mono">{pin.first_used_registration_number}</div>
                            {pin.first_used_at && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {formatDate(pin.first_used_at)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">Not used yet</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={pin.is_active ? "default" : "secondary"}>
                          {pin.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>{pin.created_by_user_name || "System"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(pin.created_at)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {pin.expires_at ? formatDate(pin.expires_at) : "Never"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Switch
                            checked={pin.is_active}
                            onCheckedChange={() => handleToggleActive(pin)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
