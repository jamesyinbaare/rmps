"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Code, Key, Shield, Info } from "lucide-react";
import Link from "next/link";

export default function DocsPage() {
  const searchParams = useSearchParams();
  const [defaultTab, setDefaultTab] = useState("overview");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && ["overview", "authentication", "endpoints", "codes", "examples"].includes(tab)) {
      setDefaultTab(tab);
    }
  }, [searchParams]);

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">API Documentation</h1>
        <p className="text-gray-600 mt-1">Complete guide to using the Verification API</p>
      </div>

      <Tabs value={defaultTab} onValueChange={setDefaultTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="authentication">Authentication</TabsTrigger>
          <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
          <TabsTrigger value="codes">Codes Reference</TabsTrigger>
          <TabsTrigger value="examples">Code Examples</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                API Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Base URL</h3>
                <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                  {process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001"}/api/v1
                </code>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Authentication</h3>
                <p className="text-sm text-gray-600">
                  All API requests require authentication using an API key. Include your API key in the request header.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Rate Limiting</h3>
                <p className="text-sm text-gray-600">
                  API requests are rate-limited per API key. Default rate limit is 60 requests per minute, but can be customized.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Billing</h3>
                <p className="text-sm text-gray-600 mb-2">
                  Each verification request costs 1 credit. Ensure you have sufficient credits before making requests.
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Note:</strong> Only successful verifications (status 200) are billed. Failed requests (404, 403, etc.) are tracked but not charged.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Simple Codes</h3>
                <p className="text-sm text-gray-600 mb-2">
                  Use simple codes instead of full names for easier integration:
                </p>
                <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                  <li><code className="bg-gray-100 px-1 rounded">exam_type: "cert2"</code> instead of <code className="bg-gray-100 px-1 rounded">"Certificate II Examinations"</code></li>
                  <li><code className="bg-gray-100 px-1 rounded">exam_series: "mj"</code> instead of <code className="bg-gray-100 px-1 rounded">"MAY/JUNE"</code></li>
                </ul>
                <p className="text-sm text-gray-600 mt-2">
                  See the <strong>Codes Reference</strong> tab for complete list of supported codes.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="authentication">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Authentication
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">API Key Header</h3>
                <p className="text-sm text-gray-600 mb-2">Include your API key in the request header:</p>
                <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">
                  <code>{`X-API-Key: ctvet_your_api_key_here`}</code>
                </pre>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Bearer Token (Alternative)</h3>
                <p className="text-sm text-gray-600 mb-2">You can also use Bearer token format:</p>
                <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">
                  <code>{`Authorization: Bearer ctvet_your_api_key_here`}</code>
                </pre>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Security</h3>
                <p className="text-sm text-gray-600">
                  Keep your API keys secure. Never share them publicly or commit them to version control.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="endpoints">
          <Card>
            <CardHeader>
              <CardTitle>API Endpoints</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-semibold mb-2">Verify Candidate Results</h3>
                <p className="text-sm text-gray-600 mb-2">POST /api/v1/verify</p>
                <p className="text-sm text-gray-600 mb-2">
                  Verify candidate examination results. Supports both single and bulk requests.
                </p>

                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 mb-3">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                    <p className="text-sm text-blue-800">
                      You can use simple codes (e.g., <code className="bg-blue-100 px-1 rounded">"cert2"</code>, <code className="bg-blue-100 px-1 rounded">"mj"</code>) or full names (e.g., <code className="bg-blue-100 px-1 rounded">"Certificate II Examinations"</code>, <code className="bg-blue-100 px-1 rounded">"MAY/JUNE"</code>). See the Codes Reference tab for all supported codes.
                    </p>
                  </div>
                </div>

                <div className="bg-gray-100 p-3 rounded text-sm">
                  <p className="font-mono mb-2">Single Request (using codes):</p>
                  <pre className="text-xs overflow-x-auto">
                    <code>{JSON.stringify({
                      index_number: "12345",
                      exam_type: "cert2",
                      exam_series: "mj",
                      year: 2024
                    }, null, 2)}</code>
                  </pre>
                  <p className="font-mono mt-4 mb-2">Bulk Request (using codes):</p>
                  <pre className="text-xs overflow-x-auto">
                    <code>{JSON.stringify({
                      items: [
                        {
                          index_number: "12345",
                          exam_type: "cert2",
                          exam_series: "mj",
                          year: 2024
                        },
                        {
                          index_number: "67890",
                          exam_type: "advance",
                          exam_series: "",
                          year: 2024
                        }
                      ]
                    }, null, 2)}</code>
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="codes">
          <Card>
            <CardHeader>
              <CardTitle>Exam Type and Series Codes</CardTitle>
              <CardDescription>
                Use simple codes instead of full names for easier integration. All codes are case-insensitive.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-semibold mb-3">Exam Type Codes</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-100 border-b">
                        <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Code/Alias</th>
                        <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Full Name</th>
                        <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Examples</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-gray-300 px-3 py-2 font-mono bg-white"><code>cert2</code>, <code>cert_ii</code>, <code>1</code></td>
                        <td className="border border-gray-300 px-3 py-2 bg-white">Certificate II Examinations</td>
                        <td className="border border-gray-300 px-3 py-2 bg-white text-xs text-gray-600">cert2, cert_ii, 1</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-300 px-3 py-2 font-mono bg-white"><code>advance</code>, <code>2</code></td>
                        <td className="border border-gray-300 px-3 py-2 bg-white">Advance</td>
                        <td className="border border-gray-300 px-3 py-2 bg-white text-xs text-gray-600">advance, 2</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-300 px-3 py-2 font-mono bg-white"><code>tech1</code>, <code>tech_i</code>, <code>3</code></td>
                        <td className="border border-gray-300 px-3 py-2 bg-white">Technician Part I</td>
                        <td className="border border-gray-300 px-3 py-2 bg-white text-xs text-gray-600">tech1, tech_i, 3</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-300 px-3 py-2 font-mono bg-white"><code>tech2</code>, <code>tech_ii</code>, <code>4</code></td>
                        <td className="border border-gray-300 px-3 py-2 bg-white">Technician Part II</td>
                        <td className="border border-gray-300 px-3 py-2 bg-white text-xs text-gray-600">tech2, tech_ii, 4</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-300 px-3 py-2 font-mono bg-white"><code>tech3</code>, <code>tech_iii</code>, <code>5</code></td>
                        <td className="border border-gray-300 px-3 py-2 bg-white">Technician Part III</td>
                        <td className="border border-gray-300 px-3 py-2 bg-white text-xs text-gray-600">tech3, tech_iii, 5</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-300 px-3 py-2 font-mono bg-white"><code>diploma</code>, <code>6</code></td>
                        <td className="border border-gray-300 px-3 py-2 bg-white">Diploma</td>
                        <td className="border border-gray-300 px-3 py-2 bg-white text-xs text-gray-600">diploma, 6</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  <strong>Note:</strong> Full names are also supported for backward compatibility (e.g., "Certificate II Examinations", "Advance").
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-3">Exam Series Codes</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-100 border-b">
                        <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Code/Alias</th>
                        <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Full Name</th>
                        <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Examples</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-gray-300 px-3 py-2 font-mono bg-white"><code>may_june</code>, <code>mj</code>, <code>1</code></td>
                        <td className="border border-gray-300 px-3 py-2 bg-white">MAY/JUNE</td>
                        <td className="border border-gray-300 px-3 py-2 bg-white text-xs text-gray-600">may_june, mj, may-june, 1</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-300 px-3 py-2 font-mono bg-white"><code>nov_dec</code>, <code>nd</code>, <code>2</code></td>
                        <td className="border border-gray-300 px-3 py-2 bg-white">NOV/DEC</td>
                        <td className="border border-gray-300 px-3 py-2 bg-white text-xs text-gray-600">nov_dec, nd, nov-dec, 2</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  <strong>Note:</strong> Exam series is only required for Certificate II Examinations. For other exam types, use empty string or omit the field.
                </p>
              </div>

              <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                <div className="flex items-start gap-2">
                  <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                  <div className="space-y-2">
                    <h4 className="font-semibold text-blue-900">Usage Tips</h4>
                    <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                      <li>All codes are case-insensitive (e.g., <code className="bg-blue-100 px-1 rounded">"CERT2"</code> and <code className="bg-blue-100 px-1 rounded">"cert2"</code> are the same)</li>
                      <li>You can use underscores or hyphens interchangeably (e.g., <code className="bg-blue-100 px-1 rounded">"may_june"</code> or <code className="bg-blue-100 px-1 rounded">"may-june"</code>)</li>
                      <li>Full names remain supported for backward compatibility</li>
                      <li>Numeric codes (1, 2, 3...) are the shortest option for compact requests</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="examples">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                Code Examples
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-semibold mb-2">Python</h3>
                <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">
                  <code>{`import requests

url = "https://api.example.com/api/v1/verify"
headers = {
    "X-API-Key": "ctvet_your_api_key_here",
    "Content-Type": "application/json"
}
data = {
    "registration_number": "REG001",
    "exam_type": "Certificate II Examination",
    "exam_series": "MAY/JUNE",
    "year": 2024
}

response = requests.post(url, json=data, headers=headers)
print(response.json())`}</code>
                </pre>
              </div>
              <div>
                <h3 className="font-semibold mb-2">JavaScript (fetch)</h3>
                <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">
                  <code>{`const response = await fetch('https://api.example.com/api/v1/verify', {
  method: 'POST',
  headers: {
    'X-API-Key': 'ctvet_your_api_key_here',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    registration_number: 'REG001',
    exam_type: 'Certificate II Examination',
    exam_series: 'MAY/JUNE',
    year: 2024
  })
});

const data = await response.json();
console.log(data);`}</code>
                </pre>
              </div>
              <div>
                <h3 className="font-semibold mb-2">cURL</h3>
                <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">
                  <code>{`curl -X POST https://api.example.com/api/v1/verify \\
  -H "X-API-Key: ctvet_your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "index_number": "12345",
    "exam_type": "cert2",
    "exam_series": "mj",
    "year": 2024
  }'`}</code>
                </pre>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
