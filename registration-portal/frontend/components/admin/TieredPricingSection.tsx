"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createOrUpdateTieredPricing,
} from "@/lib/api";
import { toast } from "sonner";
import type { TieredPricingResponse, TieredPricingCreate } from "@/types";
import { Save, Plus, Trash2, Loader2 } from "lucide-react";

interface TieredPricingSectionProps {
  examId: number;
  tieredPricing: TieredPricingResponse[];
  onUpdate: () => void;
}

interface TieredPricingRow {
  min_subjects: number;
  max_subjects: number | null;
  price: number;
}

export function TieredPricingSection({
  examId,
  tieredPricing,
  onUpdate,
}: TieredPricingSectionProps) {
  const [rows, setRows] = useState<TieredPricingRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tieredPricing.length > 0) {
      setRows(
        tieredPricing.map((tp) => ({
          min_subjects: tp.min_subjects,
          max_subjects: tp.max_subjects,
          price: tp.price,
        }))
      );
    } else {
      setRows([{ min_subjects: 1, max_subjects: null, price: 0 }]);
    }
  }, [tieredPricing]);

  const handleAddRow = () => {
    const maxMin = rows.length > 0 ? Math.max(...rows.map((r) => r.min_subjects)) : 0;
    setRows([...rows, { min_subjects: maxMin + 1, max_subjects: null, price: 0 }]);
  };

  const handleRemoveRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleRowChange = (index: number, field: keyof TieredPricingRow, value: string | number | null) => {
    const newRows = [...rows];
    if (field === "max_subjects" && value === "") {
      newRows[index][field] = null;
    } else if (field === "max_subjects") {
      newRows[index][field] = value === null ? null : (typeof value === "number" ? value : parseInt(value));
    } else {
      const numValue = typeof value === "number" ? value : (value === null ? 0 : parseFloat(value));
      newRows[index][field] = numValue;
    }
    setRows(newRows);
  };

  const handleSave = async () => {
    // Validate rows
    for (const row of rows) {
      if (row.min_subjects < 1) {
        toast.error("Minimum subjects must be at least 1");
        return;
      }
      if (row.max_subjects !== null && row.max_subjects < row.min_subjects) {
        toast.error("Maximum subjects must be greater than or equal to minimum subjects");
        return;
      }
      if (row.price <= 0) {
        toast.error("Price must be greater than 0");
        return;
      }
    }

    // Check for overlapping ranges
    const sortedRows = [...rows].sort((a, b) => a.min_subjects - b.min_subjects);
    for (let i = 0; i < sortedRows.length - 1; i++) {
      const current = sortedRows[i];
      const next = sortedRows[i + 1];
      const currentMax = current.max_subjects ?? Infinity;
      const nextMax = next.max_subjects ?? Infinity;

      if (currentMax >= next.min_subjects) {
        toast.error(`Tiered pricing ranges overlap: ${current.min_subjects}-${current.max_subjects ?? "∞"} and ${next.min_subjects}-${next.max_subjects ?? "∞"}`);
        return;
      }
    }

    const pricingToSave: TieredPricingCreate[] = rows.map((row) => ({
      min_subjects: row.min_subjects,
      max_subjects: row.max_subjects,
      price: row.price,
      currency: "GHS",
      is_active: true,
    }));

    setLoading(true);
    try {
      await createOrUpdateTieredPricing(examId, { pricing: pricingToSave });
      toast.success("Tiered pricing saved successfully");
      onUpdate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save tiered pricing");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tiered Pricing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Min Subjects</TableHead>
                <TableHead>Max Subjects</TableHead>
                <TableHead>Price (GHS)</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <Input
                      type="number"
                      min="1"
                      value={row.min_subjects}
                      onChange={(e) =>
                        handleRowChange(index, "min_subjects", parseInt(e.target.value) || 0)
                      }
                      disabled={loading}
                      className="w-24"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={row.min_subjects}
                      placeholder="∞"
                      value={row.max_subjects === null ? "" : row.max_subjects}
                      onChange={(e) =>
                        handleRowChange(
                          index,
                          "max_subjects",
                          e.target.value === "" ? null : parseInt(e.target.value) || null
                        )
                      }
                      disabled={loading}
                      className="w-24"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.price}
                      onChange={(e) =>
                        handleRowChange(index, "price", parseFloat(e.target.value) || 0)
                      }
                      disabled={loading}
                      className="w-32"
                    />
                  </TableCell>
                  <TableCell>
                    {rows.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveRow(index)}
                        disabled={loading}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={handleAddRow} disabled={loading}>
            <Plus className="mr-2 h-4 w-4" />
            Add Tier
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Pricing
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
