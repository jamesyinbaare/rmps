"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Navbar } from "@/components/layout/Navbar";
import {
  submitCertificateRequest,
  listExaminationCentersPublic,
  initializePayment,
  type CertificateRequestCreate,
  type ExaminationCenter,
} from "@/lib/api";
import { toast } from "sonner";
import { Award, CheckCircle2, AlertCircle, FileText, Mail, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { validatePassportPhoto, validateIdScan } from "@/lib/photo-validation";

type RequestType = "certificate" | "attestation";
type DeliveryMethod = "pickup" | "courier";

const STEPS = [
  { number: 1, title: "Request Type", description: "Choose certificate or attestation" },
  { number: 2, title: "Examination Details", description: "Enter your exam information" },
  { number: 3, title: "Identification", description: "Upload your documents" },
  { number: 4, title: "Delivery", description: "Choose delivery method" },
  { number: 5, title: "Review & Submit", description: "Review and submit request" },
];

export default function CertificateRequestPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [examinationCenters, setExaminationCenters] = useState<ExaminationCenter[]>([]);
  const [loadingCenters, setLoadingCenters] = useState(false);

  // Form data
  const [requestType, setRequestType] = useState<RequestType>("certificate");
  const [indexNumber, setIndexNumber] = useState("");
  const [examYear, setExamYear] = useState("");
  const [examinationSeries, setExaminationSeries] = useState<"MAY/JUNE" | "NOV/DEC">("NOV/DEC");
  const [examinationCenterId, setExaminationCenterId] = useState("");
  const [nationalIdNumber, setNationalIdNumber] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("pickup");
  const [serviceType, setServiceType] = useState<"standard" | "express">("standard");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [courierAddressLine1, setCourierAddressLine1] = useState("");
  const [courierAddressLine2, setCourierAddressLine2] = useState("");
  const [courierCity, setCourierCity] = useState("");
  const [courierRegion, setCourierRegion] = useState("");
  const [courierPostalCode, setCourierPostalCode] = useState("");
  const [photographFile, setPhotographFile] = useState<File | null>(null);
  const [photographPreview, setPhotographPreview] = useState<string | null>(null);
  const [photographErrors, setPhotographErrors] = useState<string[]>([]);
  const [photographValidating, setPhotographValidating] = useState(false);
  const [photographDimensions, setPhotographDimensions] = useState<{ width: number; height: number } | null>(null);
  const [photographInputKey, setPhotographInputKey] = useState(0);
  const [idScanFile, setIdScanFile] = useState<File | null>(null);
  const [idScanPreview, setIdScanPreview] = useState<string | null>(null);
  const [idScanErrors, setIdScanErrors] = useState<string[]>([]);
  const [idScanValidating, setIdScanValidating] = useState(false);
  const [idScanDimensions, setIdScanDimensions] = useState<{ width: number; height: number } | null>(null);
  const [idScanInputKey, setIdScanInputKey] = useState(0);
  const [requestNumber, setRequestNumber] = useState<string | null>(null);

  // Load examination centers (all schools, regardless of active status)
  useEffect(() => {
    const loadCenters = async () => {
      setLoadingCenters(true);
      try {
        const centers = await listExaminationCentersPublic();
        setExaminationCenters(centers);
      } catch (error) {
        console.error("Failed to load examination centers:", error);
        setExaminationCenters([]);
      } finally {
        setLoadingCenters(false);
      }
    };

    loadCenters();
  }, []);

  // Reset examination series to NOV/DEC when request type changes to certificate
  useEffect(() => {
    if (requestType === "certificate") {
      setExaminationSeries("NOV/DEC");
    }
  }, [requestType]);

  // Generate current year and past years for exam year select
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 30 }, (_, i) => currentYear - i);

  const handlePhotographChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setPhotographFile(null);
      setPhotographPreview(null);
      setPhotographErrors([]);
      setPhotographDimensions(null);
      return;
    }

    setPhotographValidating(true);
    setPhotographErrors([]);

    try {
      const validation = await validatePassportPhoto(file);

      if (validation.isValid) {
        setPhotographFile(file);
        setPhotographErrors([]);
        setPhotographDimensions(validation.dimensions || null);
        const reader = new FileReader();
        reader.onloadend = () => {
          setPhotographPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setPhotographFile(null);
        setPhotographPreview(null);
        setPhotographErrors(validation.errors);
        setPhotographDimensions(null);
        setPhotographInputKey((prev) => prev + 1); // Reset file input
        validation.errors.forEach((error) => toast.error(error));
      }
    } catch (error) {
      setPhotographFile(null);
      setPhotographPreview(null);
      const errorMsg = error instanceof Error ? error.message : "Failed to validate photograph";
      setPhotographErrors([errorMsg]);
      setPhotographInputKey((prev) => prev + 1); // Reset file input
      toast.error(errorMsg);
    } finally {
      setPhotographValidating(false);
    }
  };

  const handleIdScanChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setIdScanFile(null);
      setIdScanPreview(null);
      setIdScanErrors([]);
      setIdScanDimensions(null);
      return;
    }

    setIdScanValidating(true);
    setIdScanErrors([]);

    try {
      const validation = await validateIdScan(file);

      if (validation.isValid) {
        setIdScanFile(file);
        setIdScanErrors([]);
        setIdScanDimensions(validation.dimensions || null);
        const reader = new FileReader();
        reader.onloadend = () => {
          setIdScanPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setIdScanFile(null);
        setIdScanPreview(null);
        setIdScanErrors(validation.errors);
        setIdScanDimensions(null);
        setIdScanInputKey((prev) => prev + 1); // Reset file input
        validation.errors.forEach((error) => toast.error(error));
      }
    } catch (error) {
      setIdScanFile(null);
      setIdScanPreview(null);
      const errorMsg = error instanceof Error ? error.message : "Failed to validate ID scan";
      setIdScanErrors([errorMsg]);
      setIdScanInputKey((prev) => prev + 1); // Reset file input
      toast.error(errorMsg);
    } finally {
      setIdScanValidating(false);
    }
  };

  const validateStep = (step: number): boolean => {
    if (step === 1) {
      return true; // Request type always valid
    }
    if (step === 2) {
      if (!indexNumber.trim() || !examYear || !examinationCenterId) {
        toast.error("Please fill in all examination details");
        return false;
      }
      return true;
    }
    if (step === 3) {
      if (!nationalIdNumber.trim()) {
        toast.error("Please provide National ID number");
        return false;
      }
      if (!photographFile || photographErrors.length > 0) {
        toast.error("Please upload a valid passport photograph that meets all requirements");
        return false;
      }
      if (!idScanFile || idScanErrors.length > 0) {
        toast.error("Please upload a valid National ID scan that meets all requirements");
        return false;
      }
      return true;
    }
    if (step === 4) {
      if (!contactPhone.trim()) {
        toast.error("Please provide contact phone number");
        return false;
      }
      if (deliveryMethod === "courier" && !courierAddressLine1.trim()) {
        toast.error("Please provide courier address");
        return false;
      }
      return true;
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, 5));
    }
  };

  const handlePrevious = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(4)) return;

    // Additional validation: ensure files are not being validated
    if (photographValidating || idScanValidating) {
      toast.error("Please wait for file validation to complete");
      return;
    }

    // Ensure files exist and have no errors
    if (!photographFile || photographErrors.length > 0) {
      toast.error("Please upload a valid passport photograph");
      return;
    }

    if (!idScanFile || idScanErrors.length > 0) {
      toast.error("Please upload a valid National ID scan");
      return;
    }

    setSubmitting(true);
    try {
      const requestData: CertificateRequestCreate = {
        request_type: requestType,
        index_number: indexNumber.trim(),
        exam_year: parseInt(examYear),
        examination_series: examinationSeries,
        examination_center_id: parseInt(examinationCenterId),
        national_id_number: nationalIdNumber.trim(),
        delivery_method: deliveryMethod,
        service_type: serviceType,
        contact_phone: contactPhone.trim(),
        contact_email: contactEmail.trim() || undefined,
        courier_address_line1: deliveryMethod === "courier" ? courierAddressLine1.trim() : undefined,
        courier_address_line2: deliveryMethod === "courier" ? courierAddressLine2.trim() : undefined,
        courier_city: deliveryMethod === "courier" ? courierCity.trim() : undefined,
        courier_region: deliveryMethod === "courier" ? courierRegion.trim() : undefined,
        courier_postal_code: deliveryMethod === "courier" ? courierPostalCode.trim() : undefined,
      };

      // Double-check files are valid before sending
      if (!(photographFile instanceof File)) {
        toast.error("Photograph file is invalid. Please re-upload it.");
        return;
      }

      if (!(idScanFile instanceof File)) {
        toast.error("ID scan file is invalid. Please re-upload it.");
        return;
      }

      // Verify files have content
      if (photographFile.size === 0) {
        toast.error("Photograph file is empty. Please re-upload it.");
        return;
      }

      if (idScanFile.size === 0) {
        toast.error("ID scan file is empty. Please re-upload it.");
        return;
      }

      const response = await submitCertificateRequest(requestData, photographFile, idScanFile);
      setRequestNumber(response.request_number);
      toast.success("Request submitted successfully! Redirecting to payment...");

      // Initialize payment
      try {
        const paymentResponse = await initializePayment(response.request_number);
        // Redirect to Paystack payment page
        window.location.href = paymentResponse.authorization_url;
      } catch (error) {
        toast.error("Failed to initialize payment. Please try again.");
        console.error("Payment initialization error:", error);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit request");
      console.error("Submit error:", error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-background via-background to-primary/5">
      <Navbar />

      <main className="flex-1">
        <div className="container mx-auto px-4 py-12">
          <div className="flex justify-center max-w-7xl mx-auto">
            <Card className="w-full shadow-lg">
              <div className="grid lg:grid-cols-[1fr_auto_1fr] divide-y lg:divide-y-0 lg:divide-x lg:divide-border">
                {/* Left Side - Guide and Information */}
                <div className="p-6 lg:p-8 flex flex-col">
                  <div className="mb-6">
                    <h2 className="text-2xl font-semibold mb-2">How to Request</h2>
                    <p className="text-sm text-muted-foreground">
                      Follow these simple steps to request your certificate or attestation
                    </p>
                  </div>
                  <div className="space-y-6">
                  <div className="space-y-4">
                    {STEPS.map((step, idx) => (
                      <div key={step.number} className="flex gap-4">
                        <div className="flex-shrink-0">
                          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
                            {step.number}
                          </div>
                        </div>
                        <div className="flex-1 space-y-1">
                          <h4 className="font-semibold">{step.title}</h4>
                          <p className="text-sm text-muted-foreground">{step.description}</p>
                          {step.number === 1 && (
                            <div className="text-sm text-muted-foreground mt-2">
                              <p>• Certificates: Available for NOV/DEC examinations</p>
                              <p>• Attestations: Available for all examination types</p>
                            </div>
                          )}
                          {step.number === 2 && (
                            <div className="text-sm text-muted-foreground mt-2">
                              <p>• Provide your examination index number</p>
                              <p>• Select the year you took the examination</p>
                              <p>• Choose your examination center</p>
                            </div>
                          )}
                          {step.number === 3 && (
                            <div className="text-sm text-muted-foreground mt-2">
                              <p>• Enter your National ID number</p>
                              <p>• Upload passport photo (200-600px, max 2MB, JPEG/PNG)</p>
                              <p>• Upload National ID scan (any size, max 5MB, JPEG/PNG)</p>
                            </div>
                          )}
                          {step.number === 4 && (
                            <div className="text-sm text-muted-foreground mt-2">
                              <p>• Choose pickup or courier delivery</p>
                              <p>• Provide contact information</p>
                              <p>• If courier, provide delivery address</p>
                            </div>
                          )}
                          {step.number === 5 && (
                            <div className="text-sm text-muted-foreground mt-2">
                              <p>• Review all information</p>
                              <p>• Submit your request</p>
                              <p>• Complete payment via Paystack</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t">
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-primary" />
                      Important Information
                    </h4>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        <span>An invoice will be generated after submission</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        <span>Payment is required before processing begins</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        <span>You can track your request status using your request number</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        <span>Processing typically takes 5-10 business days</span>
                      </li>
                    </ul>
                  </div>

                  <div className="pt-4 border-t">
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Mail className="h-4 w-4 text-primary" />
                      Need Help?
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      If you have any questions or need assistance, please contact our support team.
                    </p>
                  </div>
                  </div>
                </div>

                {/* Vertical Divider - Hidden on mobile, visible on desktop */}
                <div className="hidden lg:block w-px bg-border self-stretch"></div>

                {/* Right Side - Request Form */}
                <div className="p-6 lg:p-8 flex flex-col">
                  <div className="mb-6 space-y-1">
                    <div className="flex items-center gap-2">
                      <Award className="h-6 w-6 text-primary" />
                      <h2 className="text-2xl font-semibold">Certificate Request</h2>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Request your certificate or attestation online
                    </p>
                  </div>
                  <div className="space-y-6">
                  {/* Step Indicator */}
                  <div className="flex items-center justify-between mb-6">
                    {STEPS.map((step, idx) => (
                      <div key={step.number} className="flex items-center flex-1">
                        <div className="flex flex-col items-center flex-1">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                              step.number === currentStep
                                ? "bg-primary text-primary-foreground"
                                : step.number < currentStep
                                ? "bg-primary/20 text-primary"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {step.number < currentStep ? <CheckCircle2 className="h-5 w-5" /> : step.number}
                          </div>
                          <p className="text-xs mt-1 text-center hidden sm:block">{step.title}</p>
                        </div>
                        {idx < STEPS.length - 1 && (
                          <div
                            className={`h-0.5 flex-1 mx-1 ${
                              step.number < currentStep ? "bg-primary" : "bg-muted"
                            }`}
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Step 1: Request Type */}
                  {currentStep === 1 && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="requestType">Request Type *</Label>
                        <Select
                          value={requestType}
                          onValueChange={(value) => setRequestType(value as RequestType)}
                        >
                          <SelectTrigger id="requestType">
                            <SelectValue placeholder="Select request type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="certificate">Certificate (NOV/DEC only)</SelectItem>
                            <SelectItem value="attestation">Attestation (All candidates)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          {requestType === "certificate"
                            ? "Certificates are available for NOV/DEC examinations only."
                            : "Attestations are available for all examination types."}
                        </AlertDescription>
                      </Alert>
                      {/* Reset examination series when request type changes */}
                      {requestType === "certificate" && examinationSeries !== "NOV/DEC" && (
                        <div className="text-xs text-muted-foreground">
                          Examination series will be set to NOV/DEC for certificate requests.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step 2: Examination Details */}
                  {currentStep === 2 && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="indexNumber">Index Number *</Label>
                        <Input
                          id="indexNumber"
                          value={indexNumber}
                          onChange={(e) => setIndexNumber(e.target.value)}
                          placeholder="Enter your examination index number"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="examYear">Examination Year *</Label>
                        <Select value={examYear} onValueChange={setExamYear}>
                          <SelectTrigger id="examYear">
                            <SelectValue placeholder="Select year" />
                          </SelectTrigger>
                          <SelectContent>
                            {years.map((year) => (
                              <SelectItem key={year} value={year.toString()}>
                                {year}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="examinationSeries">Examination Series *</Label>
                        <Select
                          value={examinationSeries}
                          onValueChange={(value) => setExaminationSeries(value as "MAY/JUNE" | "NOV/DEC")}
                          disabled={requestType === "certificate"}
                        >
                          <SelectTrigger id="examinationSeries">
                            <SelectValue placeholder="Select examination series" />
                          </SelectTrigger>
                          <SelectContent>
                            {requestType === "certificate" ? (
                              <SelectItem value="NOV/DEC">NOV/DEC</SelectItem>
                            ) : (
                              <>
                                <SelectItem value="MAY/JUNE">MAY/JUNE</SelectItem>
                                <SelectItem value="NOV/DEC">NOV/DEC</SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                        {requestType === "certificate" && (
                          <p className="text-xs text-muted-foreground">
                            Certificates are only available for NOV/DEC examinations.
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="examinationCenter">Examination Center *</Label>
                        <SearchableSelect
                          options={examinationCenters.map((center) => ({
                            value: center.id.toString(),
                            label: `${center.name} (${center.code})${center.is_active === false ? " [Inactive]" : ""}`,
                          }))}
                          value={examinationCenterId || undefined}
                          onValueChange={(value) => setExaminationCenterId(value || "")}
                          placeholder="Search and select examination center"
                          searchPlaceholder="Search by name or code..."
                          emptyMessage={loadingCenters ? "Loading..." : "No examination centers found"}
                          disabled={loadingCenters}
                          className="w-full"
                        />
                        <p className="text-xs text-muted-foreground">
                          Type to search. All schools are shown, including inactive ones.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Identification */}
                  {currentStep === 3 && (
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <Label htmlFor="nationalIdNumber">National ID Number *</Label>
                        <Input
                          id="nationalIdNumber"
                          value={nationalIdNumber}
                          onChange={(e) => setNationalIdNumber(e.target.value)}
                          placeholder="Enter your National ID number"
                        />
                      </div>

                      {/* Passport Photograph */}
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label htmlFor="photograph">Passport Photograph *</Label>
                          <div className="flex items-start gap-4">
                            <div className="flex-1 space-y-2">
                              <Input
                                key={photographInputKey}
                                id="photograph"
                                type="file"
                                accept="image/jpeg,image/jpg,image/png"
                                onChange={handlePhotographChange}
                                disabled={photographValidating}
                                className={photographErrors.length > 0 ? "border-destructive" : ""}
                              />
                              {photographValidating && (
                                <p className="text-xs text-muted-foreground">Validating image...</p>
                              )}
                              {photographPreview && photographErrors.length === 0 && (
                                <div className="flex items-center gap-2 text-xs text-green-600">
                                  <CheckCircle2 className="h-4 w-4" />
                                  <span>Photo validated successfully</span>
                                  {photographDimensions && (
                                    <span className="text-muted-foreground">
                                      ({photographDimensions.width}x{photographDimensions.height}px)
                                    </span>
                                  )}
                                </div>
                              )}
                              {photographErrors.length > 0 && (
                                <div className="space-y-1">
                                  {photographErrors.map((error, idx) => (
                                    <div key={idx} className="flex items-start gap-2 text-xs text-destructive">
                                      <X className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                      <span>{error}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            {photographPreview && (
                              <div className="relative">
                                <img
                                  src={photographPreview}
                                  alt="Photograph preview"
                                  className="w-24 h-24 object-cover rounded border-2 border-primary"
                                />
                                {photographErrors.length === 0 && (
                                  <div className="absolute -top-2 -right-2 bg-green-500 rounded-full p-1">
                                    <CheckCircle2 className="h-4 w-4 text-white" />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription className="text-xs">
                            <strong>Requirements:</strong>
                            <ul className="list-disc list-inside mt-1 space-y-0.5">
                              <li>Dimensions: 200x200px to 600x600px</li>
                              <li>File size: Maximum 2MB</li>
                              <li>Format: JPEG or PNG only</li>
                              <li>Must be a clear, recent passport-style photograph</li>
                            </ul>
                          </AlertDescription>
                        </Alert>
                      </div>

                      {/* National ID Scan */}
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label htmlFor="idScan">National ID Scan *</Label>
                          <div className="flex items-start gap-4">
                            <div className="flex-1 space-y-2">
                              <Input
                                key={idScanInputKey}
                                id="idScan"
                                type="file"
                                accept="image/jpeg,image/jpg,image/png"
                                onChange={handleIdScanChange}
                                disabled={idScanValidating}
                                className={idScanErrors.length > 0 ? "border-destructive" : ""}
                              />
                              {idScanValidating && (
                                <p className="text-xs text-muted-foreground">Validating image...</p>
                              )}
                              {idScanPreview && idScanErrors.length === 0 && (
                                <div className="flex items-center gap-2 text-xs text-green-600">
                                  <CheckCircle2 className="h-4 w-4" />
                                  <span>ID scan validated successfully</span>
                                  {idScanDimensions && (
                                    <span className="text-muted-foreground">
                                      ({idScanDimensions.width}x{idScanDimensions.height}px)
                                    </span>
                                  )}
                                </div>
                              )}
                              {idScanErrors.length > 0 && (
                                <div className="space-y-1">
                                  {idScanErrors.map((error, idx) => (
                                    <div key={idx} className="flex items-start gap-2 text-xs text-destructive">
                                      <X className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                      <span>{error}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            {idScanPreview && (
                              <div className="relative">
                                <img
                                  src={idScanPreview}
                                  alt="ID scan preview"
                                  className="w-24 h-24 object-cover rounded border-2 border-primary"
                                />
                                {idScanErrors.length === 0 && (
                                  <div className="absolute -top-2 -right-2 bg-green-500 rounded-full p-1">
                                    <CheckCircle2 className="h-4 w-4 text-white" />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription className="text-xs">
                            <strong>Requirements:</strong>
                            <ul className="list-disc list-inside mt-1 space-y-0.5">
                              <li>File size: Maximum 5MB</li>
                              <li>Format: JPEG or PNG only</li>
                              <li>Any dimensions accepted</li>
                              <li>Must be a clear, readable scan of your National ID</li>
                            </ul>
                          </AlertDescription>
                        </Alert>
                      </div>
                    </div>
                  )}

                  {/* Step 4: Delivery */}
                  {currentStep === 4 && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="serviceType">Service Type *</Label>
                        <Select
                          value={serviceType}
                          onValueChange={(value) => setServiceType(value as "standard" | "express")}
                        >
                          <SelectTrigger id="serviceType">
                            <SelectValue placeholder="Select service type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="standard">Standard (5-10 business days)</SelectItem>
                            <SelectItem value="express">Express (2-3 business days) - 50% surcharge</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Express service provides faster processing for urgent requests
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="deliveryMethod">Delivery Method *</Label>
                        <Select
                          value={deliveryMethod}
                          onValueChange={(value) => setDeliveryMethod(value as DeliveryMethod)}
                        >
                          <SelectTrigger id="deliveryMethod">
                            <SelectValue placeholder="Select delivery method" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pickup">Pickup</SelectItem>
                            <SelectItem value="courier">Courier Service (+GHS 50)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {/* Pricing Breakdown */}
                      <div className="p-4 border rounded-lg bg-muted/50 space-y-2">
                        <h4 className="font-semibold text-sm">Pricing Breakdown</h4>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              {requestType === "certificate" ? "Certificate" : "Attestation"} (Base)
                            </span>
                            <span className="font-medium">
                              GHS {requestType === "certificate" ? "100" : "80"}
                            </span>
                          </div>
                          {serviceType === "express" && (
                            <div className="flex justify-between text-primary">
                              <span>Express Service Surcharge (50%)</span>
                              <span className="font-medium">
                                +GHS {requestType === "certificate" ? "50" : "40"}
                              </span>
                            </div>
                          )}
                          {deliveryMethod === "courier" && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Courier Fee</span>
                              <span className="font-medium">+GHS 50</span>
                            </div>
                          )}
                          <div className="pt-2 border-t flex justify-between font-semibold">
                            <span>Total Amount</span>
                            <span className="text-primary">
                              GHS {(() => {
                                let base = requestType === "certificate" ? 100 : 80;
                                if (serviceType === "express") {
                                  base = base * 1.5;
                                }
                                if (deliveryMethod === "courier") {
                                  base += 50;
                                }
                                return base.toFixed(0);
                              })()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contactPhone">Contact Phone *</Label>
                        <Input
                          id="contactPhone"
                          value={contactPhone}
                          onChange={(e) => setContactPhone(e.target.value)}
                          placeholder="Enter your phone number"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contactEmail">Contact Email (Optional)</Label>
                        <Input
                          id="contactEmail"
                          type="email"
                          value={contactEmail}
                          onChange={(e) => setContactEmail(e.target.value)}
                          placeholder="Enter your email address"
                        />
                      </div>
                      {deliveryMethod === "courier" && (
                        <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                          <h4 className="font-semibold">Courier Address</h4>
                          <div className="space-y-2">
                            <Label htmlFor="addressLine1">Address Line 1 *</Label>
                            <Input
                              id="addressLine1"
                              value={courierAddressLine1}
                              onChange={(e) => setCourierAddressLine1(e.target.value)}
                              placeholder="Street address"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="addressLine2">Address Line 2</Label>
                            <Input
                              id="addressLine2"
                              value={courierAddressLine2}
                              onChange={(e) => setCourierAddressLine2(e.target.value)}
                              placeholder="Apartment, suite, etc."
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="city">City</Label>
                              <Input
                                id="city"
                                value={courierCity}
                                onChange={(e) => setCourierCity(e.target.value)}
                                placeholder="City"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="region">Region</Label>
                              <Input
                                id="region"
                                value={courierRegion}
                                onChange={(e) => setCourierRegion(e.target.value)}
                                placeholder="Region"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="postalCode">Postal Code</Label>
                            <Input
                              id="postalCode"
                              value={courierPostalCode}
                              onChange={(e) => setCourierPostalCode(e.target.value)}
                              placeholder="Postal code"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step 5: Review */}
                  {currentStep === 5 && (
                    <div className="space-y-4">
                      <Alert>
                        <FileText className="h-4 w-4" />
                        <AlertDescription>
                          Please review your information carefully before submitting. An invoice will be generated for payment.
                        </AlertDescription>
                      </Alert>
                      <div className="space-y-3 p-4 border rounded-lg">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Request Type</p>
                            <p className="font-semibold capitalize">{requestType}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Index Number</p>
                            <p className="font-semibold">{indexNumber}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Examination Year</p>
                            <p className="font-semibold">{examYear}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Service Type</p>
                            <p className="font-semibold capitalize">{serviceType}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Delivery Method</p>
                            <p className="font-semibold capitalize">{deliveryMethod}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Total Amount</p>
                            <p className="font-semibold text-primary">
                              GHS {(() => {
                                let base = requestType === "certificate" ? 100 : 80;
                                if (serviceType === "express") {
                                  base = base * 1.5;
                                }
                                if (deliveryMethod === "courier") {
                                  base += 50;
                                }
                                return base.toFixed(0);
                              })()}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Contact Phone</p>
                            <p className="font-semibold">{contactPhone}</p>
                          </div>
                          {contactEmail && (
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Contact Email</p>
                              <p className="font-semibold">{contactEmail}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Navigation Buttons */}
                  <div className="flex justify-between pt-4">
                    <Button
                      variant="outline"
                      onClick={handlePrevious}
                      disabled={currentStep === 1}
                    >
                      Previous
                    </Button>
                    {currentStep < 5 ? (
                      <Button onClick={handleNext}>
                        Next
                      </Button>
                    ) : (
                      <Button onClick={handleSubmit} disabled={submitting}>
                        {submitting ? "Submitting..." : "Submit Request"}
                      </Button>
                    )}
                  </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
