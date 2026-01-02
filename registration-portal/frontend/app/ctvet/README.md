# CTVET Design System

A modern, professional UI design system inspired by the Ghana flag colors, featuring complete light and dark mode support.

## 🎨 Color Palette

### Primary Colors (Ghana Flag)
- **Ghana Red** (`#CE1126`) - Primary actions, CTAs, urgent notifications
- **Ghana Gold** (`#FCD116`) - Premium features, highlights, achievements
- **Ghana Green** (`#006B3F`) - Success states, positive actions
- **Black Star** (`#000000`) - Navigation, important icons, typography

### Extended Palette
- **Deep Red** (`#A50E1E`) - Hover states for red
- **Rich Gold** (`#E6B80A`) - Active states for gold
- **Forest Green** (`#005530`) - Hover states for green
- **Volta Blue** (`#0047AB`) - Balance, water representation

### Neutrals
- **Charcoal** (`#2C3E50`)
- **Slate Gray** (`#5D6D7E`)
- **Light Gray** (`#ECF0F1`)
- **Off-White** (`#F8F9FA`)
- **White** (`#FFFFFF`)

## 🌓 Theme Support

The design system includes full support for:
- **Light Mode** - Default theme with bright backgrounds
- **Dark Mode** - Dark theme optimized for low-light environments
- **System Theme** - Automatically follows user's system preference

### Theme Switcher
Use the `ThemeSwitcher` component to allow users to switch between themes:

```tsx
import { ThemeSwitcher } from "@/components/ctvet/ThemeSwitcher";

<ThemeSwitcher />
```

## 📦 Components

### Button
Multiple variants and sizes with hover/active states:

```tsx
import { Button } from "@/components/ctvet/Button";

<Button variant="default">Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="success">Success</Button>
<Button variant="destructive">Destructive</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>
```

### Card
Container component for grouping content:

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ctvet/Card";

<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>Content</CardContent>
  <CardFooter>Footer</CardFooter>
</Card>
```

### Input
Form input with focus states:

```tsx
import { Input } from "@/components/ctvet/Input";

<Input type="text" placeholder="Enter text" />
<Input type="email" placeholder="Email" />
<Input type="password" placeholder="Password" />
```

### Alert
Pre-configured alert components:

```tsx
import { AlertSuccess, AlertDestructive, AlertWarning, AlertInfo } from "@/components/ctvet/Alert";

<AlertSuccess title="Success" description="Operation completed" />
<AlertDestructive title="Error" description="Something went wrong" />
<AlertWarning title="Warning" description="Please check this" />
<AlertInfo title="Info" description="New information available" />
```

### Progress
Progress indicator for tasks and goals:

```tsx
import { Progress } from "@/components/ctvet/Progress";

<Progress value={75} max={100} showLabel />
```

## 🎯 Design Principles

### Symbolic Usage
- **Red**: Urgent actions, important notifications, primary CTAs
- **Gold**: Premium features, highlights, achievements, warnings
- **Green**: Success states, positive actions, environmental features
- **Black**: Navigation, important icons, typography

### Accessibility
- ✅ 4.5:1 minimum contrast ratio for text
- ✅ Avoid gold text on white backgrounds
- ✅ Careful use of red-green combinations (color blindness)
- ✅ Focus states for keyboard navigation
- ✅ WCAG 2.1 compliant

### Modern Aesthetics
- Clean, minimal design
- 8px grid system for spacing
- Consistent border-radius (6-8px)
- Subtle shadows for depth
- Smooth transitions and animations

## 📱 Dashboard Components

### DashboardHeader
Header with logo, search, and navigation:

```tsx
import { DashboardHeader } from "@/components/ctvet/DashboardHeader";

<DashboardHeader />
```

### BalanceCard
Display user balance with show/hide functionality:

```tsx
import { BalanceCard } from "@/components/ctvet/BalanceCard";

<BalanceCard />
```

### QuickActions
Grid of quick action buttons:

```tsx
import { QuickActions } from "@/components/ctvet/QuickActions";

<QuickActions />
```

### RecentTransactions
List of recent transactions:

```tsx
import { RecentTransactions } from "@/components/ctvet/RecentTransactions";

<RecentTransactions />
```

### SavingsGoals
Progress tracking for savings goals:

```tsx
import { SavingsGoals } from "@/components/ctvet/SavingsGoals";

<SavingsGoals />
```

## 🚀 Usage

### Setup Theme Provider

Wrap your app with the ThemeProvider:

```tsx
import { ThemeProvider } from "@/components/ctvet/ThemeProvider";

export default function Layout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

### Import Styles

Import the global CSS in your layout:

```tsx
import "./ctvet/globals.css";
```

## 📄 Pages

- `/ctvet` - Main dashboard
- `/ctvet/components` - Component showcase

## 🎨 CSS Variables

All colors are available as CSS variables:

```css
--primary: var(--ghana-red);
--secondary: var(--ghana-gold);
--success: var(--ghana-green);
--accent: var(--ghana-volta-blue);
--background: var(--ghana-off-white);
--foreground: var(--ghana-black);
```

## 🔧 Customization

To customize colors, modify the CSS variables in `app/ctvet/globals.css`:

```css
:root {
  --primary: #CE1126; /* Ghana Red */
  --secondary: #FCD116; /* Ghana Gold */
  --success: #006B3F; /* Ghana Green */
}
```

## 📚 Examples

See the component showcase at `/ctvet/components` for all available components and their usage examples.

## ♿ Accessibility

- All interactive elements have focus states
- Color contrast meets WCAG 2.1 AA standards
- Semantic HTML structure
- ARIA labels where appropriate
- Keyboard navigation support

## 🎯 Best Practices

1. **Use colors symbolically**: Red for urgent, Gold for premium, Green for success
2. **Maintain contrast**: Always ensure text is readable
3. **Test in both themes**: Verify components work in light and dark modes
4. **Follow spacing**: Use the 8px grid system consistently
5. **Accessibility first**: Test with screen readers and keyboard navigation
