"use client";

import { useState, useEffect, useRef } from "react";
import {
  createBulkPhotoValidationJob,
  getBulkPhotoValidationJobStatus,
  downloadBulkPhotoValidationResults,
  bulkResizePhotos,
  bulkReplaceBackground
} from "@/lib/api";
import type { PhotoValidationJobResponse } from "@/types";
import { toast } from "sonner";
import {
  Upload,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  FileText,
  AlertCircle,
  Image as ImageIcon,
  Maximize2,
  Palette,
  Info,
  Sparkles,
  FileCheck
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

export default function BulkPhotoValidationPage() {
  // Validation state
  const [validationLevel, setValidationLevel] = useState<"basic" | "standard" | "strict">("strict");
  const [files, setFiles] = useState<File[]>([]);
  const [job, setJob] = useState<PhotoValidationJobResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Resizing state
  const [resizeFiles, setResizeFiles] = useState<File[]>([]);
  const [resizing, setResizing] = useState(false);
  const [targetWidth, setTargetWidth] = useState<number>(155);
  const [targetHeight, setTargetHeight] = useState<number>(191);
  const [maintainAspectRatio, setMaintainAspectRatio] = useState<boolean>(true);
  const resizeFileInputRef = useRef<HTMLInputElement>(null);

  // Background replacement state
  const [backgroundFiles, setBackgroundFiles] = useState<File[]>([]);
  const [replacing, setReplacing] = useState(false);
  const [backgroundColorR, setBackgroundColorR] = useState<number>(255);
  const [backgroundColorG, setBackgroundColorG] = useState<number>(255);
  const [backgroundColorB, setBackgroundColorB] = useState<number>(255);
  const backgroundFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Poll for job status if job is pending or processing
    if (job && (job.status === "pending" || job.status === "processing")) {
      if (!pollingIntervalRef.current) {
        startPolling();
      }
    } else {
      stopPolling();
    }

    return () => {
      stopPolling();
    };
  }, [job]);

  const startPolling = () => {
    if (!job) return;

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const updatedJob = await getBulkPhotoValidationJobStatus(job.id);
        setJob(updatedJob);

        if (updatedJob.status === "completed" || updatedJob.status === "failed") {
          stopPolling();
          if (updatedJob.status === "completed") {
            toast.success("Photo validation completed!");
          } else {
            toast.error("Photo validation failed");
          }
        }
      } catch (error) {
        console.error("Failed to poll job status:", error);
        stopPolling();
      }
    }, 2000); // Poll every 2 seconds
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setPolling(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);

    // Filter to only image files
    const imageFiles = selectedFiles.filter(file => {
      const type = file.type.toLowerCase();
      return type.startsWith("image/");
    });

    if (imageFiles.length !== selectedFiles.length) {
      toast.warning("Some non-image files were ignored");
    }

    setFiles(imageFiles);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (files.length === 0) {
      toast.error("Please select at least one photo file");
      return;
    }

    setLoading(true);
    try {
      const newJob = await createBulkPhotoValidationJob(files, validationLevel);
      setJob(newJob);
      setFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      toast.success("Photo validation job started");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start validation job");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!job || !job.result_zip_path) {
      toast.error("No results available to download");
      return;
    }

    try {
      await downloadBulkPhotoValidationResults(job.id);
      toast.success("Results downloaded successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to download results");
      console.error(error);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500">Completed</Badge>;
      case "processing":
        return <Badge className="bg-blue-500">Processing</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500">Pending</Badge>;
      case "failed":
        return <Badge className="bg-red-500">Failed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getProgress = () => {
    if (!job || job.progress_total === 0) return 0;
    return (job.progress_current / job.progress_total) * 100;
  };

  const handleResizeFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);

    // Filter to only image files
    const imageFiles = selectedFiles.filter(file => {
      const type = file.type.toLowerCase();
      return type.startsWith("image/");
    });

    if (imageFiles.length !== selectedFiles.length) {
      toast.warning("Some non-image files were ignored");
    }

    setResizeFiles(imageFiles);
  };

  const handleResizeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (resizeFiles.length === 0) {
      toast.error("Please select at least one photo file");
      return;
    }

    setResizing(true);
    try {
      await bulkResizePhotos(resizeFiles, targetWidth, targetHeight, maintainAspectRatio);
      toast.success("Photos resized successfully! Download starting...");
      setResizeFiles([]);
      if (resizeFileInputRef.current) {
        resizeFileInputRef.current.value = "";
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resize photos");
      console.error(error);
    } finally {
      setResizing(false);
    }
  };

  const handleBackgroundFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);

    // Filter to only image files
    const imageFiles = selectedFiles.filter(file => {
      const type = file.type.toLowerCase();
      return type.startsWith("image/");
    });

    if (imageFiles.length !== selectedFiles.length) {
      toast.warning("Some non-image files were ignored");
    }

    setBackgroundFiles(imageFiles);
  };

  const handleBackgroundReplaceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (backgroundFiles.length === 0) {
      toast.error("Please select at least one photo file");
      return;
    }

    setReplacing(true);
    try {
      await bulkReplaceBackground(backgroundFiles, backgroundColorR, backgroundColorG, backgroundColorB);
      toast.success("Backgrounds replaced successfully! Download starting...");
      setBackgroundFiles([]);
      if (backgroundFileInputRef.current) {
        backgroundFileInputRef.current.value = "";
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to replace backgrounds");
      console.error(error);
    } finally {
      setReplacing(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Utility Tools</h1>
            <p className="text-muted-foreground mt-1">
              Bulk photo processing tools for passport photos - resize, validate, and replace backgrounds
            </p>
          </div>
        </div>
      </div>

      {/* Three Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bulk Photo Resizing Section */}
        <Card className="relative overflow-hidden border-2 hover:border-primary/50 transition-colors flex flex-col">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -z-10" />
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-md bg-blue-100 dark:bg-blue-900/30">
                  <Maximize2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle className="text-lg">Photo Resizing</CardTitle>
              </div>
            </div>
            <CardDescription className="mt-2 text-xs">
              Resize photos to passport dimensions (155×191px) with optional aspect ratio preservation
            </CardDescription>
          </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          <form onSubmit={handleResizeSubmit} className="flex-1 flex flex-col space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label htmlFor="target-width" className="text-sm font-medium">
                  Dimensions
                </label>
                <span title="Standard passport photo size is 155×191 pixels">
                  <Info className="h-4 w-4 text-muted-foreground" />
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="target-width" className="text-xs text-muted-foreground">
                    Width (px)
                  </label>
                  <Input
                    id="target-width"
                    type="number"
                    min="1"
                    value={targetWidth}
                    onChange={(e) => setTargetWidth(parseInt(e.target.value) || 155)}
                    disabled={resizing}
                    required
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="target-height" className="text-xs text-muted-foreground">
                    Height (px)
                  </label>
                  <Input
                    id="target-height"
                    type="number"
                    min="1"
                    value={targetHeight}
                    onChange={(e) => setTargetHeight(parseInt(e.target.value) || 191)}
                    disabled={resizing}
                    required
                    className="h-9"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-border my-4" />

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="maintain-aspect-ratio"
                  checked={maintainAspectRatio}
                  onCheckedChange={(checked) => setMaintainAspectRatio(checked === true)}
                  disabled={resizing}
                />
                <label htmlFor="maintain-aspect-ratio" className="text-sm font-medium cursor-pointer">
                  Maintain aspect ratio
                </label>
              </div>
              <p className="text-xs text-muted-foreground pl-6">
                {maintainAspectRatio
                  ? "Photos will fit within dimensions with white padding if needed"
                  : "Photos will be stretched to exact dimensions (may distort)"}
              </p>
            </div>

            <div className="border-t border-border my-4" />

            <div className="space-y-2">
              <label htmlFor="resize-files" className="text-sm font-medium">
                Select Photos
              </label>
              <div className="relative">
                <input
                  ref={resizeFileInputRef}
                  id="resize-files"
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleResizeFileSelect}
                  disabled={resizing}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
                <div className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer disabled:cursor-not-allowed">
                  {resizeFiles.length > 0 ? (
                    <div className="flex flex-col items-center gap-2">
                      <FileCheck className="h-8 w-8 text-primary" />
                      <div className="text-sm font-medium">
                        {resizeFiles.length} file{resizeFiles.length !== 1 ? "s" : ""} selected
                      </div>
                      <p className="text-xs text-muted-foreground">Click to change files</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <div className="text-sm font-medium">Click to upload</div>
                      <p className="text-xs text-muted-foreground">or drag and drop</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-auto pt-4">
              <Button type="submit" disabled={resizing || resizeFiles.length === 0} className="w-full" size="lg">
                {resizing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Maximize2 className="mr-2 h-4 w-4" />
                    Resize Photos
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Bulk Photo Validation Section */}
      <Card className="relative overflow-hidden border-2 hover:border-primary/50 transition-colors flex flex-col">
        <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-bl-full -z-10" />
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-md bg-green-100 dark:bg-green-900/30">
                <FileCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-lg">Photo Validation</CardTitle>
            </div>
          </div>
          <CardDescription className="mt-2 text-xs">
            Validate passport photos against requirements using AI-powered analysis
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="validation-level" className="text-sm font-medium">
                  Validation Level
                </label>
                <span title="Choose validation strictness: Basic (size only), Standard (+ face detection), or Strict (+ background check)">
                  <Info className="h-4 w-4 text-muted-foreground" />
                </span>
              </div>
              <Select
                value={validationLevel}
                onValueChange={(value) => setValidationLevel(value as "basic" | "standard" | "strict")}
                disabled={loading || !!job}
              >
                <SelectTrigger id="validation-level" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">
                    <div className="flex flex-col">
                      <span>Basic</span>
                      <span className="text-xs text-muted-foreground">Size only</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="standard">
                    <div className="flex flex-col">
                      <span>Standard</span>
                      <span className="text-xs text-muted-foreground">Size + Face Detection</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="strict">
                    <div className="flex flex-col">
                      <span>Strict</span>
                      <span className="text-xs text-muted-foreground">All checks + Background</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {validationLevel === "basic" && "✓ Validates image dimensions (155×191px)"}
                {validationLevel === "standard" && "✓ Dimensions + face detection (frontal, eyes open)"}
                {validationLevel === "strict" && "✓ Dimensions + face detection + background (white/off-white)"}
              </p>
            </div>

            <div className="border-t border-border my-4" />

            <div className="space-y-2">
              <label htmlFor="files" className="text-sm font-medium">
                Select Photos
              </label>
              <div className="relative">
                <input
                  ref={fileInputRef}
                  id="files"
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileSelect}
                  disabled={loading || !!job}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
                <div className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer disabled:cursor-not-allowed">
                  {files.length > 0 ? (
                    <div className="flex flex-col items-center gap-2">
                      <FileCheck className="h-8 w-8 text-primary" />
                      <div className="text-sm font-medium">
                        {files.length} file{files.length !== 1 ? "s" : ""} selected
                      </div>
                      <p className="text-xs text-muted-foreground">Click to change files</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <div className="text-sm font-medium">Click to upload</div>
                      <p className="text-xs text-muted-foreground">or drag and drop</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-auto pt-4">
              <Button type="submit" disabled={loading || !!job || files.length === 0} className="w-full" size="lg">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <FileCheck className="mr-2 h-4 w-4" />
                    Start Validation
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

        {/* Bulk Background Replacement Section */}
        <Card className="relative overflow-hidden border-2 hover:border-primary/50 transition-colors flex flex-col">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-bl-full -z-10" />
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-md bg-purple-100 dark:bg-purple-900/30">
                  <Palette className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <CardTitle className="text-lg">Background Replacement</CardTitle>
              </div>
            </div>
            <CardDescription className="mt-2 text-xs">
              Replace photo backgrounds with any color using AI-powered segmentation
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col">
            <form onSubmit={handleBackgroundReplaceSubmit} className="flex-1 flex flex-col space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">
                    Background Color
                  </label>
                  <span title="Enter RGB values (0-255) for the background color">
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1.5">
                    <label htmlFor="bg-color-r" className="text-xs text-muted-foreground">
                      Red
                    </label>
                    <Input
                      id="bg-color-r"
                      type="number"
                      min="0"
                      max="255"
                      value={backgroundColorR}
                      onChange={(e) => setBackgroundColorR(parseInt(e.target.value) || 255)}
                      disabled={replacing}
                      required
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="bg-color-g" className="text-xs text-muted-foreground">
                      Green
                    </label>
                    <Input
                      id="bg-color-g"
                      type="number"
                      min="0"
                      max="255"
                      value={backgroundColorG}
                      onChange={(e) => setBackgroundColorG(parseInt(e.target.value) || 255)}
                      disabled={replacing}
                      required
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="bg-color-b" className="text-xs text-muted-foreground">
                      Blue
                    </label>
                    <Input
                      id="bg-color-b"
                      type="number"
                      min="0"
                      max="255"
                      value={backgroundColorB}
                      onChange={(e) => setBackgroundColorB(parseInt(e.target.value) || 255)}
                      disabled={replacing}
                      required
                      className="h-9"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div
                    className="w-full h-16 rounded-lg border-2 border-border shadow-sm transition-all"
                    style={{ backgroundColor: `rgb(${backgroundColorR}, ${backgroundColorG}, ${backgroundColorB})` }}
                  />
                  <p className="text-xs text-center text-muted-foreground">
                    Color Preview
                  </p>
                </div>
              </div>

              <div className="border-t border-border my-4" />

              <div className="space-y-2">
                <label htmlFor="background-files" className="text-sm font-medium">
                  Select Photos
                </label>
                <div className="relative">
                  <input
                    ref={backgroundFileInputRef}
                    id="background-files"
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleBackgroundFileSelect}
                    disabled={replacing}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <div className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer disabled:cursor-not-allowed">
                    {backgroundFiles.length > 0 ? (
                      <div className="flex flex-col items-center gap-2">
                        <FileCheck className="h-8 w-8 text-primary" />
                        <div className="text-sm font-medium">
                          {backgroundFiles.length} file{backgroundFiles.length !== 1 ? "s" : ""} selected
                        </div>
                        <p className="text-xs text-muted-foreground">Click to change files</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="h-8 w-8 text-muted-foreground" />
                        <div className="text-sm font-medium">Click to upload</div>
                        <p className="text-xs text-muted-foreground">or drag and drop</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-auto pt-4">
                <Button type="submit" disabled={replacing || backgroundFiles.length === 0} className="w-full" size="lg">
                  {replacing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Palette className="mr-2 h-4 w-4" />
                      Replace Backgrounds
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {job && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Validation Job Status</CardTitle>
                <CardDescription>Job ID: {job.id}</CardDescription>
              </div>
              {getStatusBadge(job.status)}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Progress</span>
                <span>
                  {job.progress_current} / {job.progress_total}
                </span>
              </div>
              <Progress value={getProgress()} />
            </div>

            {job.status === "processing" && (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertDescription>
                  Validating photos in the background. This may take a few minutes...
                </AlertDescription>
              </Alert>
            )}

            {job.status === "completed" && (
              <div className="space-y-4">
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <AlertDescription>
                    Validation completed successfully! You can now download the results.
                  </AlertDescription>
                </Alert>

                <div className="rounded-lg border p-4 space-y-2">
                  <h4 className="font-semibold">Validation Summary</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Total Photos:</span>{" "}
                      <span className="font-medium">{job.progress_total}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Valid:</span>{" "}
                      <span className="font-medium text-green-600">
                        {job.valid_count || 0}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Invalid:</span>{" "}
                      <span className="font-medium text-red-600">
                        {job.invalid_count || 0}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Validation Level:</span>{" "}
                      <span className="font-medium capitalize">{job.validation_level}</span>
                    </div>
                  </div>
                </div>

                <Button onClick={handleDownload} className="w-full">
                  <Download className="mr-2 h-4 w-4" />
                  Download Results (ZIP)
                </Button>
              </div>
            )}

            {job.status === "failed" && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  {job.error_message || "Validation job failed. Please try again."}
                </AlertDescription>
              </Alert>
            )}

            {job.status === "pending" && (
              <Alert>
                <Clock className="h-4 w-4" />
                <AlertDescription>
                  Job is queued and will start processing shortly...
                </AlertDescription>
              </Alert>
            )}

            <div className="text-xs text-muted-foreground">
              Created: {new Date(job.created_at).toLocaleString()}
              {job.completed_at && (
                <> • Completed: {new Date(job.completed_at).toLocaleString()}</>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!job && (
        <Card className="bg-muted/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              <CardTitle>How It Works</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-background">
                <div className="p-2 rounded-md bg-blue-100 dark:bg-blue-900/30">
                  <ImageIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">Upload Photos</p>
                  <p className="text-xs text-muted-foreground mt-1">Select multiple images or a zip archive</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-background">
                <div className="p-2 rounded-md bg-green-100 dark:bg-green-900/30">
                  <Clock className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">AI Processing</p>
                  <p className="text-xs text-muted-foreground mt-1">Photos are analyzed in the background using AI</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-background">
                <div className="p-2 rounded-md bg-purple-100 dark:bg-purple-900/30">
                  <CheckCircle2 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">Organized Results</p>
                  <p className="text-xs text-muted-foreground mt-1">Photos sorted into valid/invalid folders</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-background">
                <div className="p-2 rounded-md bg-orange-100 dark:bg-orange-900/30">
                  <Download className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">Download ZIP</p>
                  <p className="text-xs text-muted-foreground mt-1">Get processed results with detailed report</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
