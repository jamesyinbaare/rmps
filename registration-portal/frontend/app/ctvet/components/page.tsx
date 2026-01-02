"use client";

import { Button } from "@/components/ctvet/Button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ctvet/Card";
import { Input } from "@/components/ctvet/Input";
import { AlertDestructive, AlertSuccess, AlertWarning, AlertInfo } from "@/components/ctvet/Alert";
import { Progress } from "@/components/ctvet/Progress";
import { ThemeSwitcher } from "@/components/ctvet/ThemeSwitcher";
import { DashboardHeader } from "@/components/ctvet/DashboardHeader";

export default function ComponentsShowcase() {
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="container mx-auto px-4 py-8 space-y-12">
        <div className="space-y-4">
          <h1 className="text-4xl font-bold">CTVET Design System</h1>
          <p className="text-muted-foreground">
            Complete component library using Ghana flag color palette
          </p>
        </div>

        {/* Theme Switcher */}
        <Card>
          <CardHeader>
            <CardTitle>Theme Switcher</CardTitle>
            <CardDescription>
              Switch between light, dark, and system themes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ThemeSwitcher />
          </CardContent>
        </Card>

        {/* Buttons */}
        <Card>
          <CardHeader>
            <CardTitle>Buttons</CardTitle>
            <CardDescription>
              All button variants with hover and active states
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <Button variant="default">Primary (Red)</Button>
              <Button variant="secondary">Secondary (Gold)</Button>
              <Button variant="success">Success (Green)</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
            </div>
            <div className="flex flex-wrap gap-4">
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
              <Button size="icon">🚀</Button>
            </div>
            <div className="flex flex-wrap gap-4">
              <Button disabled>Disabled</Button>
              <Button variant="default" disabled>Disabled Primary</Button>
            </div>
          </CardContent>
        </Card>

        {/* Cards */}
        <Card>
          <CardHeader>
            <CardTitle>Cards</CardTitle>
            <CardDescription>
              Container components for grouping content
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Card Title</CardTitle>
                  <CardDescription>Card description text</CardDescription>
                </CardHeader>
                <CardContent>
                  <p>Card content goes here</p>
                </CardContent>
                <CardFooter>
                  <Button variant="outline">Action</Button>
                </CardFooter>
              </Card>
              <Card className="bg-gradient-to-br from-[var(--primary)] to-[var(--primary)]/80 text-[var(--primary-foreground)]">
                <CardHeader>
                  <CardTitle>Gradient Card</CardTitle>
                  <CardDescription className="opacity-90">
                    Using primary color
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p>Beautiful gradient background</p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        {/* Inputs */}
        <Card>
          <CardHeader>
            <CardTitle>Form Inputs</CardTitle>
            <CardDescription>
              Text inputs with focus states
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Default Input</label>
              <Input placeholder="Enter text here" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Disabled Input</label>
              <Input placeholder="Disabled" disabled />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email Input</label>
              <Input type="email" placeholder="email@example.com" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Password Input</label>
              <Input type="password" placeholder="••••••••" />
            </div>
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader>
            <CardTitle>Alerts & Notifications</CardTitle>
            <CardDescription>
              Different alert types for various messages
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <AlertSuccess
              title="Success!"
              description="Your transaction was completed successfully."
            />
            <AlertDestructive
              title="Error"
              description="Something went wrong. Please try again."
            />
            <AlertWarning
              title="Warning"
              description="Your balance is running low."
            />
            <AlertInfo
              title="Information"
              description="New features are available in your account."
            />
          </CardContent>
        </Card>

        {/* Progress */}
        <Card>
          <CardHeader>
            <CardTitle>Progress Indicators</CardTitle>
            <CardDescription>
              Show progress for tasks and goals
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress 25%</span>
                <span>25%</span>
              </div>
              <Progress value={25} max={100} />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress 50%</span>
                <span>50%</span>
              </div>
              <Progress value={50} max={100} />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress 75%</span>
                <span>75%</span>
              </div>
              <Progress value={75} max={100} showLabel />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress 100%</span>
                <span>100%</span>
              </div>
              <Progress value={100} max={100} />
            </div>
          </CardContent>
        </Card>

        {/* Color Palette */}
        <Card>
          <CardHeader>
            <CardTitle>Color Palette</CardTitle>
            <CardDescription>
              Ghana flag inspired colors
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <div className="h-20 rounded-lg bg-[#CE1126]"></div>
                <p className="text-sm font-medium">Ghana Red</p>
                <p className="text-xs text-muted-foreground">#CE1126</p>
              </div>
              <div className="space-y-2">
                <div className="h-20 rounded-lg bg-[#FCD116]"></div>
                <p className="text-sm font-medium">Ghana Gold</p>
                <p className="text-xs text-muted-foreground">#FCD116</p>
              </div>
              <div className="space-y-2">
                <div className="h-20 rounded-lg bg-[#006B3F]"></div>
                <p className="text-sm font-medium">Ghana Green</p>
                <p className="text-xs text-muted-foreground">#006B3F</p>
              </div>
              <div className="space-y-2">
                <div className="h-20 rounded-lg bg-[#000000]"></div>
                <p className="text-sm font-medium">Black Star</p>
                <p className="text-xs text-muted-foreground">#000000</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
