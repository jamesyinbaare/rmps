"use client";

import { useState, useEffect } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getApplicationFee,
  createOrUpdateApplicationFee,
  deleteApplicationFee,
  getExam,
  getPricingModels,
  createOrUpdatePricingModel,
  deletePricingModel,
} from "@/lib/api";
import { toast } from "sonner";
import type { RegistrationExam, ExamPricingModelResponse } from "@/types";
import { Save, Edit, Trash2, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PricingTableProps {
  examId: number;
  onUpdate: () => void | Promise<void>;
}

type RegistrationTypeOption = "all" | "free_tvet" | "private" | "referral";

interface PricingRow {
  registrationType: RegistrationTypeOption;
  registrationTypeLabel: string;
  applicationFee: number | null;
  pricingModel: string;
  pricingModelId: number | null;
}

export function PricingTable({ examId, onUpdate }: PricingTableProps) {
  const [exam, setExam] = useState<RegistrationExam | null>(null);
  const [pricingRows, setPricingRows] = useState<PricingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingRow, setEditingRow] = useState<RegistrationTypeOption | null>(null);
  const [editingField, setEditingField] = useState<"fee" | "model" | null>(null);
  const [editFee, setEditFee] = useState<string>("");
  const [editPricingModel, setEditPricingModel] = useState<string>("auto");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingType, setDeletingType] = useState<RegistrationTypeOption | null>(null);

  const registrationTypes: { value: RegistrationTypeOption; label: string }[] = [
    { value: "all", label: "All Types" },
    { value: "free_tvet", label: "Free TVET" },
    { value: "private", label: "Private" },
    { value: "referral", label: "Referral" },
  ];

  const loadData = async () => {
    setLoading(true);
    try {
      // Load exam to get pricing model
      const examData = await getExam(examId);
      setExam(examData);

      // Load application fees and pricing models for each registration type
      const rows: PricingRow[] = [];
      const defaultPricingModel = examData.pricing_model_preference || "auto";

      // Load all pricing models
      let pricingModels: ExamPricingModelResponse[] = [];
      try {
        pricingModels = await getPricingModels(examId);
      } catch (error: any) {
        // Table might not exist yet - this is OK, we'll use default pricing model
        if (error?.message?.includes("503") || error?.message?.includes("does not exist")) {
          console.warn("Pricing models table does not exist yet. Using default pricing model.");
        } else {
          console.error("Error loading pricing models:", error);
        }
      }

      for (const regType of registrationTypes) {
        // Get application fee
        let applicationFee: number | null = null;
        try {
          const feeData = await getApplicationFee(
            examId,
            regType.value === "all" ? null : regType.value
          );
          applicationFee = typeof feeData.fee === 'number' ? feeData.fee : Number(feeData.fee);
        } catch (error: any) {
          // Fee not found for this type (404 is expected)
          if (!error?.message?.includes("404") && !error?.message?.includes("not found")) {
            console.error(`Error loading fee for ${regType.value}:`, error);
          }
        }

        // Get pricing model for this registration type
        const pricingModelData = pricingModels.find(
          (pm) => pm.registration_type === (regType.value === "all" ? null : regType.value)
        );
        const pricingModel = pricingModelData?.pricing_model_preference || defaultPricingModel;
        const pricingModelId = pricingModelData?.id || null;

        rows.push({
          registrationType: regType.value,
          registrationTypeLabel: regType.label,
          applicationFee: applicationFee,
          pricingModel: pricingModel,
          pricingModelId: pricingModelId,
        });
      }
      setPricingRows(rows);
    } catch (error) {
      toast.error("Failed to load pricing data");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (examId) {
      loadData();
    }
  }, [examId]);

  const handleEditFee = (row: PricingRow) => {
    setEditingRow(row.registrationType);
    setEditingField("fee");
    setEditFee(row.applicationFee?.toString() || "");
  };

  const handleEditModel = (row: PricingRow) => {
    setEditingRow(row.registrationType);
    setEditingField("model");
    setEditPricingModel(row.pricingModel);
  };

  const handleSaveFee = async (registrationType: RegistrationTypeOption) => {
    const feeValue = parseFloat(editFee);
    if (isNaN(feeValue) || feeValue <= 0) {
      toast.error("Please enter a valid fee amount greater than 0");
      return;
    }

    setLoading(true);
    try {
      await createOrUpdateApplicationFee(examId, {
        fee: feeValue,
        currency: "GHS",
        is_active: true,
        registration_type: registrationType === "all" ? null : registrationType,
      });
      toast.success("Application fee saved successfully");
      setEditingRow(null);
      setEditingField(null);
      await loadData();
      await onUpdate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save application fee");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveModel = async (registrationType: RegistrationTypeOption) => {
    setLoading(true);
    try {
      await createOrUpdatePricingModel(examId, {
        registration_type: registrationType === "all" ? null : registrationType,
        pricing_model_preference: editPricingModel,
      });
      toast.success("Pricing model saved successfully");
      setEditingRow(null);
      setEditingField(null);
      await loadData();
      await onUpdate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save pricing model");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingType) return;

    setLoading(true);
    try {
      await deleteApplicationFee(examId, deletingType === "all" ? null : deletingType);
      toast.success("Application fee deleted successfully");
      setDeleteDialogOpen(false);
      setDeletingType(null);
      await loadData();
      await onUpdate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete application fee");
    } finally {
      setLoading(false);
    }
  };

  const getPricingModelLabel = (model: string) => {
    const labels: Record<string, string> = {
      auto: "Auto",
      per_subject: "Per-Subject",
      tiered: "Tiered",
      per_programme: "Per-Programme",
    };
    return labels[model] || model;
  };

  if (loading && pricingRows.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Loading pricing data...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Examination Pricing</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Registration Type</TableHead>
                  <TableHead>Application Fee (GHS)</TableHead>
                  <TableHead>Pricing Model</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pricingRows.map((row) => (
                  <TableRow key={row.registrationType}>
                    <TableCell className="font-medium">
                      {row.registrationTypeLabel}
                    </TableCell>
                    <TableCell>
                      {editingRow === row.registrationType && editingField === "fee" ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={editFee}
                            onChange={(e) => setEditFee(e.target.value)}
                            disabled={loading}
                            className="w-32"
                          />
                          <Button
                            size="sm"
                            onClick={() => handleSaveFee(row.registrationType)}
                            disabled={loading}
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingRow(null);
                              setEditingField(null);
                            }}
                            disabled={loading}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span>
                            {row.applicationFee !== null
                              ? `GHS ${Number(row.applicationFee).toFixed(2)}`
                              : "Not set"}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditFee(row)}
                            disabled={loading || editingRow !== null}
                            className="h-6 w-6 p-0"
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingRow === row.registrationType && editingField === "model" ? (
                        <div className="flex items-center gap-2">
                          <Select
                            value={editPricingModel}
                            onValueChange={setEditPricingModel}
                            disabled={loading}
                          >
                            <SelectTrigger className="w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">Auto</SelectItem>
                              <SelectItem value="per_subject">Per-Subject</SelectItem>
                              <SelectItem value="tiered">Tiered</SelectItem>
                              <SelectItem value="per_programme">Per-Programme</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            onClick={() => handleSaveModel(row.registrationType)}
                            disabled={loading}
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingRow(null);
                              setEditingField(null);
                            }}
                            disabled={loading}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            {getPricingModelLabel(row.pricingModel)}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditModel(row)}
                            disabled={loading || editingRow !== null}
                            className="h-6 w-6 p-0"
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.applicationFee !== null && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setDeletingType(row.registrationType);
                            setDeleteDialogOpen(true);
                          }}
                          disabled={loading || editingRow !== null}
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
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Application Fee</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the application fee for{" "}
              {deletingType
                ? registrationTypes.find((t) => t.value === deletingType)?.label
                : ""}
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={loading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
