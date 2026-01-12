"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Code, Key, Shield } from "lucide-react";

export default function DocsPage() {
  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">API Documentation</h1>
        <p className="text-gray-600 mt-1">Complete guide to using the Verification API</p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="authentication">Authentication</TabsTrigger>
          <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
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
                <p className="text-sm text-gray-600">
                  Each verification request costs 1 credit. Ensure you have sufficient credits before making requests.
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
                <div className="bg-gray-100 p-3 rounded text-sm">
                  <p className="font-mono mb-2">Single Request:</p>
                  <pre className="text-xs overflow-x-auto">
                    <code>{JSON.stringify({
                      registration_number: "REG001",
                      exam_type: "Certificate II Examination",
                      exam_series: "MAY/JUNE",
                      year: 2024
                    }, null, 2)}</code>
                  </pre>
                  <p className="font-mono mt-4 mb-2">Bulk Request:</p>
                  <pre className="text-xs overflow-x-auto">
                    <code>{JSON.stringify({
                      items: [
                        {
                          registration_number: "REG001",
                          exam_type: "Certificate II Examination",
                          exam_series: "MAY/JUNE",
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
    "registration_number": "REG001",
    "exam_type": "Certificate II Examination",
    "exam_series": "MAY/JUNE",
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
