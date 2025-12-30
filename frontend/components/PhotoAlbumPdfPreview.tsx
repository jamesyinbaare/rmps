"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Printer, X } from "lucide-react";
import { generatePhotoAlbumPdf } from "@/lib/api";

interface PhotoAlbumPdfPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examId: number;
  schoolId: number;
  programmeId?: number;
  examName?: string;
  schoolName?: string;
  programmeName?: string;
  candidateCount?: number;
  searchQuery?: string;
}

export function PhotoAlbumPdfPreview({
  open,
  onOpenChange,
  examId,
  schoolId,
  programmeId,
  examName,
  schoolName,
  programmeName,
  candidateCount,
  searchQuery,
}: PhotoAlbumPdfPreviewProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && examId && schoolId) {
      loadPdf();
    } else {
      // Clean up URL when dialog closes
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
        setPdfUrl(null);
      }
    }

    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [open, examId, schoolId, programmeId]);

  const loadPdf = async () => {
    setLoading(true);
    setError(null);
    try {
      const blob = await generatePhotoAlbumPdf(examId, schoolId, programmeId, true, searchQuery);
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate PDF");
      console.error("PDF generation error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (pdfUrl) {
      const link = document.createElement("a");
      link.href = pdfUrl;
      const filename = `photo_album_${schoolId}_${examId}${programmeId ? `_${programmeId}` : ""}.pdf`;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handlePrint = () => {
    if (pdfUrl) {
      const printWindow = window.open(pdfUrl, "_blank");
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Photo Album PDF Preview</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4">
          {/* Summary Info */}
          <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
            <div className="font-semibold">Album Information:</div>
            {examName && <div><strong>Exam:</strong> {examName}</div>}
            {schoolName && <div><strong>School:</strong> {schoolName}</div>}
            {programmeName && <div><strong>Programme:</strong> {programmeName}</div>}
            {candidateCount !== undefined && <div><strong>Total Candidates:</strong> {candidateCount}</div>}
          </div>

          {/* PDF Preview */}
          {loading && (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              <span className="ml-3 text-gray-600">Generating PDF preview...</span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
              <div className="font-semibold mb-1">Error generating PDF</div>
              <div className="text-sm">{error}</div>
            </div>
          )}

          {pdfUrl && !loading && (
            <div className="border rounded-lg overflow-hidden">
              <iframe
                src={pdfUrl}
                className="w-full h-[600px] border-0"
                title="PDF Preview"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          {pdfUrl && (
            <>
              <Button variant="outline" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
              <Button onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
