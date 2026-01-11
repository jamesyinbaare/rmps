"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  createOrUpdateApplicationFee,
  deleteApplicationFee,
} from "@/lib/api";
import { toast } from "sonner";
import type { ApplicationFeeResponse } from "@/types";
import { Save, Trash2, Loader2 } from "lucide-react";
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

interface ApplicationFeeSectionProps {
  examId: number;
  applicationFee: ApplicationFeeResponse | null;
  onUpdate: () => void | Promise<void>;
}

export function ApplicationFeeSection({
  examId,
  applicationFee,
  onUpdate,
}: ApplicationFeeSectionProps) {
  const [fee, setFee] = useState<string>("");
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    if (applicationFee) {
      setFee(applicationFee.fee.toString());
      setIsActive(applicationFee.is_active);
    } else {
      setFee("");
      setIsActive(true);
    }
  }, [applicationFee]);

  const handleSave = async () => {
    const feeValue = parseFloat(fee);
    if (isNaN(feeValue) || feeValue <= 0) {
      toast.error("Please enter a valid fee amount greater than 0");
      return;
    }

    setLoading(true);
    try {
      const updatedFee = await createOrUpdateApplicationFee(examId, {
        fee: feeValue,
        currency: "GHS",
        is_active: isActive,
      });
      toast.success("Application fee saved successfully");
      // Update local state immediately with the response
      setFee(updatedFee.fee.toString());
      setIsActive(updatedFee.is_active);
      // Also trigger parent update to refresh all pricing data
      await onUpdate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save application fee");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await deleteApplicationFee(examId);
      toast.success("Application fee deleted successfully");
      setDeleteDialogOpen(false);
      onUpdate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete application fee");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Application Fee</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fee">Fee Amount (GHS)</Label>
            <Input
              id="fee"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="isActive"
              checked={isActive}
              onCheckedChange={(checked) => setIsActive(checked === true)}
              disabled={loading}
            />
            <Label htmlFor="isActive" className="font-normal cursor-pointer">
              Active
            </Label>
          </div>

          <div className="flex items-center gap-2 pt-4">
            <Button onClick={handleSave} disabled={loading || !fee}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save
                </>
              )}
            </Button>
            {applicationFee && (
              <Button
                variant="destructive"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={loading}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Application Fee</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the application fee? This action cannot be undone.
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
