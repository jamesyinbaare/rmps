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
  createOrUpdateSubjectPricing,
  listAllSubjects,
} from "@/lib/api";
import { toast } from "sonner";
import type { SubjectPricingResponse, Subject, SubjectPricingCreate } from "@/types";
import { Save, Loader2 } from "lucide-react";

interface SubjectPricingSectionProps {
  examId: number;
  subjectPricing: SubjectPricingResponse[];
  onUpdate: () => void;
}

export function SubjectPricingSection({
  examId,
  subjectPricing,
  onUpdate,
}: SubjectPricingSectionProps) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [pricingMap, setPricingMap] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoadingSubjects(true);
      try {
        const allSubjects = await listAllSubjects();
        setSubjects(allSubjects);

        // Initialize pricing map from existing pricing
        const initialPricing = new Map<number, string>();
        subjectPricing.forEach((sp) => {
          initialPricing.set(sp.subject_id, sp.price.toString());
        });
        setPricingMap(initialPricing);
      } catch (error) {
        toast.error("Failed to load subjects");
        console.error(error);
      } finally {
        setLoadingSubjects(false);
      }
    };

    loadData();
  }, [subjectPricing]);

  const handlePriceChange = (subjectId: number, price: string) => {
    const newPricingMap = new Map(pricingMap);
    newPricingMap.set(subjectId, price);
    setPricingMap(newPricingMap);
  };

  const handleSave = async () => {
    const pricingToSave: SubjectPricingCreate[] = [];

    pricingMap.forEach((price, subjectId) => {
      const priceValue = parseFloat(price);
      if (!isNaN(priceValue) && priceValue > 0) {
        pricingToSave.push({
          subject_id: subjectId,
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
      await createOrUpdateSubjectPricing(examId, { pricing: pricingToSave });
      toast.success("Subject pricing saved successfully");
      onUpdate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save subject pricing");
    } finally {
      setLoading(false);
    }
  };

  if (loadingSubjects) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Loading subjects...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Per-Subject Pricing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject Code</TableHead>
                <TableHead>Subject Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Price (GHS)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subjects.map((subject) => (
                <TableRow key={subject.id}>
                  <TableCell className="font-medium font-mono">{subject.code}</TableCell>
                  <TableCell>{subject.name}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                        subject.subject_type === "CORE"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                          : "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                      }`}
                    >
                      {subject.subject_type}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={pricingMap.get(subject.id) || ""}
                      onChange={(e) => handlePriceChange(subject.id, e.target.value)}
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
