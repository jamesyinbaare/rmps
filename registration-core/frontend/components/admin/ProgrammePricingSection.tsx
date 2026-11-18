"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  createOrUpdateProgrammePricing,
  listAllProgrammes,
  downloadProgrammePricingTemplate,
  uploadProgrammePricing,
} from "@/lib/api";
import { toast } from "sonner";
import type { ProgrammePricingResponse, Programme, ProgrammePricingCreate } from "@/types";
import { Save, Loader2, Download, Upload } from "lucide-react";

interface ProgrammePricingSectionProps {
  examId: number;
  programmePricing: ProgrammePricingResponse[];
  onUpdate: () => void;
}

export function ProgrammePricingSection({
  examId,
  programmePricing,
  onUpdate,
}: ProgrammePricingSectionProps) {
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [pricingMap, setPricingMap] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [loadingProgrammes, setLoadingProgrammes] = useState(true);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoadingProgrammes(true);
      try {
        const allProgrammes = await listAllProgrammes();
        setProgrammes(allProgrammes);

        // Initialize pricing map from existing pricing
        const initialPricing = new Map<number, string>();
        programmePricing.forEach((pp) => {
          initialPricing.set(pp.programme_id, pp.price.toString());
        });
        setPricingMap(initialPricing);
      } catch (error) {
        toast.error("Failed to load programmes");
        console.error(error);
      } finally {
        setLoadingProgrammes(false);
      }
    };

    loadData();
  }, [programmePricing]);

  const handlePriceChange = (programmeId: number, price: string) => {
    const newPricingMap = new Map(pricingMap);
    newPricingMap.set(programmeId, price);
    setPricingMap(newPricingMap);
  };

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const blob = await downloadProgrammePricingTemplate(examId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `programme_pricing_template_${examId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Template downloaded successfully");
    } catch (error) {
      toast.error("Failed to download template");
      console.error(error);
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validExtensions = [".xlsx", ".xls", ".csv"];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf("."));
    if (!validExtensions.includes(fileExtension)) {
      toast.error("Invalid file type. Please upload an Excel (.xlsx, .xls) or CSV file.");
      return;
    }

    setUploading(true);
    try {
      const result = await uploadProgrammePricing(examId, file);
      toast.success(`Successfully uploaded pricing for ${result.length} programme(s)`);
      onUpdate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload programme pricing");
      console.error(error);
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSave = async () => {
    const pricingToSave: ProgrammePricingCreate[] = [];

    pricingMap.forEach((price, programmeId) => {
      const priceValue = parseFloat(price);
      if (!isNaN(priceValue) && priceValue > 0) {
        pricingToSave.push({
          programme_id: programmeId,
          price: priceValue,
          currency: "GHS",
          is_active: true,
        });
      }
    });

    if (pricingToSave.length === 0) {
      toast.error("Please enter at least one valid price");
      return;
    }

    setLoading(true);
    try {
      await createOrUpdateProgrammePricing(examId, { pricing: pricingToSave });
      toast.success("Programme pricing saved successfully");
      onUpdate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save programme pricing");
    } finally {
      setLoading(false);
    }
  };

  if (loadingProgrammes) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Loading programmes...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Per-Programme Pricing</CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || downloadingTemplate}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload File
                </>
              )}
            </Button>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={handleDownloadTemplate}
              disabled={downloadingTemplate || uploading}
            >
              {downloadingTemplate ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Downloading...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Download Template
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Programme Code</TableHead>
                <TableHead>Programme Name</TableHead>
                <TableHead>Price (GHS)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {programmes.map((programme) => (
                <TableRow key={programme.id}>
                  <TableCell className="font-medium font-mono">{programme.code}</TableCell>
                  <TableCell>{programme.name}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={pricingMap.get(programme.id) || ""}
                      onChange={(e) => handlePriceChange(programme.id, e.target.value)}
                      disabled={loading}
                      className="w-32"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save All Pricing
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
