"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { importExamPricing } from "@/lib/api";
import { toast } from "sonner";
import type { RegistrationExam, ImportPricingRequest } from "@/types";
import { Loader2 } from "lucide-react";

interface ImportPricingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examId: number | null;
  exams: RegistrationExam[];
  onSuccess: () => void;
}

export function ImportPricingDialog({
  open,
  onOpenChange,
  examId,
  exams,
  onSuccess,
}: ImportPricingDialogProps) {
  const [sourceExamId, setSourceExamId] = useState<string>("");
  const [importApplicationFee, setImportApplicationFee] = useState(true);
  const [importSubjectPricing, setImportSubjectPricing] = useState(true);
  const [importTieredPricing, setImportTieredPricing] = useState(true);
  const [importProgrammePricing, setImportProgrammePricing] = useState(true);
  const [importPricingModels, setImportPricingModels] = useState(true);
  const [loading, setLoading] = useState(false);

  const availableExams = exams.filter((exam) => exam.id !== examId);

  const handleSubmit = async () => {
    if (!examId) {
      toast.error("Please select a target exam first");
      return;
    }

    if (!sourceExamId) {
      toast.error("Please select a source exam");
      return;
    }

    if (!importApplicationFee && !importSubjectPricing && !importTieredPricing && !importProgrammePricing && !importPricingModels) {
      toast.error("Please select at least one pricing type to import");
      return;
    }

    setLoading(true);
    try {
      const importData: ImportPricingRequest = {
        source_exam_id: parseInt(sourceExamId),
        import_application_fee: importApplicationFee,
        import_subject_pricing: importSubjectPricing,
        import_tiered_pricing: importTieredPricing,
        import_programme_pricing: importProgrammePricing,
        import_pricing_models: importPricingModels,
      };

      const result = await importExamPricing(examId, importData);
      toast.success(`Pricing imported successfully. ${result.items_imported} item(s) imported.`);
      onSuccess();
      onOpenChange(false);
      // Reset form
      setSourceExamId("");
      setImportApplicationFee(true);
      setImportSubjectPricing(true);
      setImportTieredPricing(true);
      setImportProgrammePricing(true);
      setImportPricingModels(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to import pricing");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Pricing from Another Exam</DialogTitle>
          <DialogDescription>
            Copy pricing configuration from another examination to the currently selected exam.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="sourceExam">Source Examination</Label>
            <Select value={sourceExamId} onValueChange={setSourceExamId} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder="Select an examination" />
              </SelectTrigger>
              <SelectContent>
                {availableExams.map((exam) => (
                  <SelectItem key={exam.id} value={exam.id.toString()}>
                    {exam.exam_type} ({exam.exam_series} {exam.year})
                    {exam.description && ` - ${exam.description}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>Import Options</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="importApplicationFee"
                  checked={importApplicationFee}
                  onCheckedChange={(checked) => setImportApplicationFee(checked === true)}
                  disabled={loading}
                />
                <Label htmlFor="importApplicationFee" className="font-normal cursor-pointer">
                  Application Fee
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="importSubjectPricing"
                  checked={importSubjectPricing}
                  onCheckedChange={(checked) => setImportSubjectPricing(checked === true)}
                  disabled={loading}
                />
                <Label htmlFor="importSubjectPricing" className="font-normal cursor-pointer">
                  Per-Subject Pricing
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="importTieredPricing"
                  checked={importTieredPricing}
                  onCheckedChange={(checked) => setImportTieredPricing(checked === true)}
                  disabled={loading}
                />
                <Label htmlFor="importTieredPricing" className="font-normal cursor-pointer">
                  Tiered Pricing
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="importProgrammePricing"
                  checked={importProgrammePricing}
                  onCheckedChange={(checked) => setImportProgrammePricing(checked === true)}
                  disabled={loading}
                />
                <Label htmlFor="importProgrammePricing" className="font-normal cursor-pointer">
                  Per-Programme Pricing
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="importPricingModels"
                  checked={importPricingModels}
                  onCheckedChange={(checked) => setImportPricingModels(checked === true)}
                  disabled={loading}
                />
                <Label htmlFor="importPricingModels" className="font-normal cursor-pointer">
                  Pricing Models
                </Label>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !sourceExamId}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              "Import"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
