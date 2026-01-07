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
import {
  submitCertificateRequest,
  initializePayment,
  type CertificateRequestCreate,
} from "@/lib/api";
import { toast } from "sonner";
import { Award, CheckCircle2, AlertCircle, FileText, Mail } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

type RequestType = "confirmation" | "verification";

const STEPS = [
  { number: 1, title: "Request Type", description: "Choose confirmation or verification" },
  { number: 2, title: "Candidate Information", description: "Enter candidate details" },
  { number: 3, title: "Contact Information", description: "Enter your contact details" },
  { number: 4, title: "Review & Submit", description: "Review and submit request" },
];

export default function CertificateConfirmationPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form data
  const [requestType, setRequestType] = useState<RequestType>("confirmation");
  const [candidateName, setCandidateName] = useState("");
  const [candidateIndexNumber, setCandidateIndexNumber] = useState("");
  const [completionYear, setCompletionYear] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [programmeName, setProgrammeName] = useState("");
  const [requestDetails, setRequestDetails] = useState("");
  const [candidatePhotograph, setCandidatePhotograph] = useState<File | null>(null);
  const [certificate, setCertificate] = useState<File | null>(null);
  const [serviceType, setServiceType] = useState<"standard" | "express">("standard");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [requestNumber, setRequestNumber] = useState<string | null>(null);

  // No longer need to load examination centers for confirmation/verification

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        if (!requestType) {
          toast.error("Please select a request type");
          return false;
        }
        return true;
      case 2:
        if (!candidateName.trim()) {
          toast.error("Please enter the candidate's name");
          return false;
        }
        if (!candidateIndexNumber.trim()) {
          toast.error("Please enter the candidate's index number");
          return false;
        }
        if (!completionYear.trim()) {
          toast.error("Please enter the completion year");
          return false;
        }
        const year = parseInt(completionYear);
        if (isNaN(year) || year < 2000 || year > new Date().getFullYear()) {
          toast.error("Please enter a valid completion year");
          return false;
        }
        if (!schoolName.trim()) {
          toast.error("Please enter the school name");
          return false;
        }
        if (!programmeName.trim()) {
          toast.error("Please enter the programme name");
          return false;
        }
        return true;
      case 3:
        if (!contactPhone.trim()) {
          toast.error("Please enter your contact phone number");
          return false;
        }
        if (contactEmail && !contactEmail.includes("@")) {
          toast.error("Please enter a valid email address");
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.length));
    }
  };

  const handlePrevious = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(3)) return;

    setSubmitting(true);
    try {
      const requestData: CertificateRequestCreate = {
        request_type: requestType,
        index_number: candidateIndexNumber.trim(),
        exam_year: parseInt(completionYear),
        service_type: serviceType,
        contact_phone: contactPhone.trim(),
        contact_email: contactEmail.trim() || undefined,
        // Confirmation/Verification specific fields
        candidate_name: candidateName.trim(),
        candidate_index_number: candidateIndexNumber.trim(),
        school_name: schoolName.trim(),
        programme_name: programmeName.trim(),
        completion_year: parseInt(completionYear),
        request_details: requestDetails.trim() || undefined,
      };

      const response = await submitCertificateRequest(
        requestData,
        undefined, // photograph (not used for confirmation/verification)
        undefined, // nationalIdScan (not used for confirmation/verification)
        certificate || undefined,
        candidatePhotograph || undefined
      );
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

  if (requestNumber) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Certificate Confirmation/Verification Request</h1>
          <p className="text-muted-foreground">Request confirmation or verification of your certificate</p>
        </div>
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Request Submitted Successfully!</CardTitle>
            <CardDescription className="mt-2">
              Your {requestType} request has been submitted
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm font-medium text-muted-foreground">Request Number</p>
              <p className="text-lg font-bold">{requestNumber}</p>
            </div>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please save your request number for tracking. You will be redirected to payment shortly.
              </AlertDescription>
            </Alert>
            <Button
              onClick={() => router.push(`/certificate-confirmation/requests?request=${requestNumber}`)}
              className="w-full"
              variant="outline"
            >
              View Request Status
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Certificate Confirmation/Verification Request</h1>
          <p className="text-muted-foreground">
            Request confirmation or verification of your certificate
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push("/certificate-confirmation/bulk")}
        >
          Bulk Request
        </Button>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => (
            <div key={step.number} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                    currentStep >= step.number
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground text-muted-foreground"
                  }`}
                >
                  {currentStep > step.number ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <span>{step.number}</span>
                  )}
                </div>
                <div className="mt-2 text-center">
                  <p
                    className={`text-sm font-medium ${
                      currentStep >= step.number ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {step.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={`h-0.5 flex-1 mx-2 ${
                    currentStep > step.number ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Step {currentStep}: {STEPS[currentStep - 1].title}</CardTitle>
          <CardDescription>{STEPS[currentStep - 1].description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1: Request Type */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div>
                <Label>Request Type</Label>
                <Select value={requestType} onValueChange={(value) => setRequestType(value as RequestType)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select request type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirmation">Confirmation</SelectItem>
                    <SelectItem value="verification">Verification</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-sm text-muted-foreground">
                  {requestType === "confirmation"
                    ? "Request confirmation of your certificate"
                    : "Request verification of your certificate"}
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Candidate Information */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="candidateName">Candidate Name *</Label>
                  <Input
                    id="candidateName"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    placeholder="Enter the candidate's full name"
                  />
                </div>
                <div>
                  <Label htmlFor="candidateIndexNumber">Candidate Index Number *</Label>
                  <Input
                    id="candidateIndexNumber"
                    value={candidateIndexNumber}
                    onChange={(e) => setCandidateIndexNumber(e.target.value)}
                    placeholder="Enter the candidate's index number"
                  />
                </div>
                <div>
                  <Label htmlFor="completionYear">Completion Year *</Label>
                  <Input
                    id="completionYear"
                    type="number"
                    value={completionYear}
                    onChange={(e) => setCompletionYear(e.target.value)}
                    placeholder="e.g., 2023"
                    min="2000"
                    max={new Date().getFullYear()}
                  />
                </div>
                <div>
                  <Label htmlFor="schoolName">School Name *</Label>
                  <Input
                    id="schoolName"
                    value={schoolName}
                    onChange={(e) => setSchoolName(e.target.value)}
                    placeholder="Enter the school name"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="programmeName">Programme of Study *</Label>
                  <Input
                    id="programmeName"
                    value={programmeName}
                    onChange={(e) => setProgrammeName(e.target.value)}
                    placeholder="Enter the programme name"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="requestDetails">Request Details (Optional)</Label>
                  <textarea
                    id="requestDetails"
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={requestDetails}
                    onChange={(e) => setRequestDetails(e.target.value)}
                    placeholder="Provide any additional details about your request"
                  />
                </div>
                <div>
                  <Label htmlFor="candidatePhotograph">Candidate Photograph (Optional)</Label>
                  <Input
                    id="candidatePhotograph"
                    type="file"
                    accept="image/jpeg,image/png,image/jpg"
                    onChange={(e) => setCandidatePhotograph(e.target.files?.[0] || null)}
                  />
                  <p className="mt-1 text-sm text-muted-foreground">JPEG or PNG, max 5MB</p>
                </div>
                <div>
                  <Label htmlFor="certificate">Certificate Scan (Optional)</Label>
                  <Input
                    id="certificate"
                    type="file"
                    accept="image/jpeg,image/png,image/jpg"
                    onChange={(e) => setCertificate(e.target.files?.[0] || null)}
                  />
                  <p className="mt-1 text-sm text-muted-foreground">JPEG or PNG, max 5MB</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Contact Information */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="contactPhone">Contact Phone *</Label>
                <Input
                  id="contactPhone"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="Enter your phone number"
                />
              </div>
              <div>
                <Label htmlFor="contactEmail">Contact Email (Optional)</Label>
                <Input
                  id="contactEmail"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="Enter your email address"
                />
              </div>
              <div>
                <Label>Service Type</Label>
                <Select value={serviceType} onValueChange={(value) => setServiceType(value as "standard" | "express")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="express">Express (50% surcharge)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Request Type:</span>
                  <span className="font-medium capitalize">{requestType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Candidate Name:</span>
                  <span className="font-medium">{candidateName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Candidate Index Number:</span>
                  <span className="font-medium">{candidateIndexNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Completion Year:</span>
                  <span className="font-medium">{completionYear}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">School Name:</span>
                  <span className="font-medium">{schoolName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Programme:</span>
                  <span className="font-medium">{programmeName}</span>
                </div>
                {requestDetails && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Request Details:</span>
                    <span className="font-medium">{requestDetails}</span>
                  </div>
                )}
                {candidatePhotograph && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Candidate Photo:</span>
                    <span className="font-medium">{candidatePhotograph.name}</span>
                  </div>
                )}
                {certificate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Certificate Scan:</span>
                    <span className="font-medium">{certificate.name}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Contact Phone:</span>
                  <span className="font-medium">{contactPhone}</span>
                </div>
                {contactEmail && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Contact Email:</span>
                    <span className="font-medium">{contactEmail}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Service Type:</span>
                  <span className="font-medium capitalize">{serviceType}</span>
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
            {currentStep < STEPS.length ? (
              <Button onClick={handleNext}>Next</Button>
            ) : (
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Submitting..." : "Submit Request"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
