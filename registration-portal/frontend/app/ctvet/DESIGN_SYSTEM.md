# CTVET Design System - Complete Documentation

## 🎨 Overview

CTVET is a modern UI design system inspired by the Ghana flag colors. It features a complete component library with full light and dark mode support, following WCAG 2.1 accessibility standards.

## 📁 File Structure

```
registration-portal/frontend/
├── app/
│   └── ctvet/
│       ├── globals.css              # Color palette & theme variables
│       ├── layout.tsx               # Theme provider setup
│       ├── page.tsx                 # Main dashboard
│       ├── components/
│       │   └── page.tsx             # Component showcase
│       ├── README.md                # Usage documentation
│       └── DESIGN_SYSTEM.md         # This file
│
└── components/
    └── ctvet/
        ├── index.ts                 # Component exports
        ├── ThemeProvider.tsx        # Theme context provider
        ├── ThemeSwitcher.tsx        # Theme toggle component
        ├── Button.tsx               # Button component
        ├── Card.tsx                 # Card components
        ├── Input.tsx                # Input component
        ├── Alert.tsx                # Alert components
        ├── Progress.tsx             # Progress indicator
        ├── DashboardHeader.tsx      # Dashboard header
        ├── BalanceCard.tsx          # Balance display card
        ├── QuickActions.tsx         # Quick action buttons
        ├── RecentTransactions.tsx   # Transaction list
        └── SavingsGoals.tsx         # Savings goals tracker
```

## 🎨 Color System

### Primary Colors (Ghana Flag)

| Color | Hex | Usage | CSS Variable |
|-------|-----|-------|--------------|
| Ghana Red | `#CE1126` | Primary CTAs, urgent actions | `--primary` |
| Ghana Gold | `#FCD116` | Premium features, highlights | `--secondary` |
| Ghana Green | `#006B3F` | Success states, positive actions | `--success` |
| Black Star | `#000000` | Typography, navigation | `--foreground` |

### Extended Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Deep Red | `#A50E1E` | Hover states for red |
| Rich Gold | `#E6B80A` | Active states for gold |
| Forest Green | `#005530` | Hover states for green |
| Volta Blue | `#0047AB` | Balance, water representation |

### Neutrals

| Color | Hex | Usage |
|-------|-----|-------|
| Charcoal | `#2C3E50` | Dark mode backgrounds |
| Slate Gray | `#5D6D7E` | Borders, muted text |
| Light Gray | `#ECF0F1` | Light backgrounds |
| Off-White | `#F8F9FA` | Main background |
| White | `#FFFFFF` | Card backgrounds |

## 🌓 Theme System

### Light Mode
- Background: Off-White (`#F8F9FA`)
- Cards: White (`#FFFFFF`)
- Text: Black (`#000000`)
- Primary: Ghana Red (`#CE1126`)
- Secondary: Ghana Gold (`#FCD116`)
- Success: Ghana Green (`#006B3F`)

### Dark Mode
- Background: Dark Blue-Gray (`#0F1419`)
- Cards: Darker Blue-Gray (`#1A1F2E`)
- Text: Off-White (`#F8F9FA`)
- Primary: Lighter Red (`#E63946`)
- Secondary: Ghana Gold (`#FCD116`)
- Success: Bright Green (`#2ECC71`)

## 📦 Components

### Core Components

#### Button
- **Variants**: default, secondary, success, destructive, outline, ghost, link
- **Sizes**: sm, default, lg, icon
- **States**: default, hover, active, disabled, focus

#### Card
- **Sub-components**: CardHeader, CardTitle, CardDescription, CardContent, CardFooter
- **Usage**: Container for grouping related content

#### Input
- **Types**: text, email, password, number, etc.
- **States**: default, focus, disabled
- **Features**: Placeholder support, focus ring

#### Alert
- **Variants**: default, destructive, success, warning, info
- **Pre-configured**: AlertSuccess, AlertDestructive, AlertWarning, AlertInfo
- **Features**: Dismissible, icons, titles

#### Progress
- **Props**: value, max, showLabel
- **Usage**: Show progress for tasks, goals, uploads

### Dashboard Components

#### DashboardHeader
- Logo and branding
- Search bar
- Theme switcher
- Notifications
- User menu

#### BalanceCard
- Total balance display
- Available vs Savings
- Show/hide balance toggle
- Gradient background

#### QuickActions
- Grid of 6 action buttons
- Send Money, Transfer, Pay Bills, Save, Statements, Airtime
- Responsive grid layout

#### RecentTransactions
- List of recent transactions
- Transaction types: sent, received, bill
- Status indicators
- Amount display with color coding

#### SavingsGoals
- Multiple savings goals
- Progress tracking
- Target amounts
- Deadlines

## 🎯 Design Principles

### 1. Symbolic Color Usage
- **Red**: Urgent actions, important notifications, primary CTAs
- **Gold**: Premium features, highlights, achievements, warnings
- **Green**: Success states, positive actions, environmental features
- **Black**: Navigation, important icons, typography

### 2. Accessibility First
- ✅ 4.5:1 minimum contrast ratio for text
- ✅ Avoid gold text on white backgrounds
- ✅ Careful use of red-green combinations (color blindness)
- ✅ Focus states for keyboard navigation
- ✅ WCAG 2.1 AA compliant

### 3. Modern Aesthetics
- Clean, minimal design
- 8px grid system for spacing
- Consistent border-radius (6-8px)
- Subtle shadows for depth
- Smooth transitions (300ms)

## 🚀 Usage Examples

### Basic Setup

```tsx
// app/ctvet/layout.tsx
import { ThemeProvider } from "@/components/ctvet/ThemeProvider";
import "./globals.css";

export default function Layout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

### Using Components

```tsx
import { Button } from "@/components/ctvet/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ctvet/Card";
import { ThemeSwitcher } from "@/components/ctvet/ThemeSwitcher";

export default function MyPage() {
  return (
    <div>
      <ThemeSwitcher />
      <Card>
        <CardHeader>
          <CardTitle>My Card</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="default">Click Me</Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

## 📱 Responsive Design

- **Mobile**: Single column layout, stacked components
- **Tablet**: 2-column grid for cards
- **Desktop**: 3-column grid, full navigation

## ♿ Accessibility Features

1. **Keyboard Navigation**
   - All interactive elements are keyboard accessible
   - Focus indicators visible
   - Tab order logical

2. **Screen Readers**
   - Semantic HTML
   - ARIA labels where needed
   - Proper heading hierarchy

3. **Color Contrast**
   - All text meets WCAG 2.1 AA standards
   - High contrast mode support
   - Color-blind friendly

4. **Focus Management**
   - Visible focus rings
   - Focus trap in modals
   - Skip links for navigation

## 🎨 Customization

### Changing Colors

Edit `app/ctvet/globals.css`:

```css
:root {
  --primary: #CE1126; /* Change primary color */
  --secondary: #FCD116; /* Change secondary color */
  --success: #006B3F; /* Change success color */
}
```

### Adding New Components

1. Create component in `components/ctvet/`
2. Use CSS variables for colors
3. Export from `components/ctvet/index.ts`
4. Document in README.md

## 📊 Component States

### Button States
- **Default**: Base styling
- **Hover**: Opacity 90% or color change
- **Active**: Scale 0.98
- **Focus**: Ring with offset
- **Disabled**: Opacity 50%, no pointer events

### Input States
- **Default**: Border, background
- **Focus**: Ring, border color change
- **Disabled**: Opacity 50%, no interaction
- **Error**: Red border (future enhancement)

### Card States
- **Default**: White background, border
- **Hover**: Subtle shadow increase (future enhancement)
- **Dark Mode**: Dark background, light text

## 🔧 Technical Details

### CSS Variables
All colors are defined as CSS variables for easy theming:
- Light mode: `:root`
- Dark mode: `.dark`

### Tailwind Integration
- Uses Tailwind CSS 4
- CSS variables mapped to Tailwind colors
- Custom theme configuration

### Theme Provider
- Uses `next-themes` for theme management
- Supports system preference detection
- Persists theme choice in localStorage

## 📚 Resources

- [Component Showcase](/ctvet/components) - See all components
- [Main Dashboard](/ctvet) - Full dashboard example
- [README.md](./README.md) - Quick start guide

## 🎯 Best Practices

1. **Always use CSS variables** for colors
2. **Test in both themes** before deploying
3. **Maintain contrast ratios** for accessibility
4. **Use semantic HTML** for better SEO and a11y
5. **Follow the 8px grid** for spacing
6. **Use appropriate variants** (e.g., success for positive actions)

## 🐛 Troubleshooting

### Colors not showing correctly
- Check CSS variables are defined in `globals.css`
- Verify theme provider is wrapping the app
- Check browser DevTools for CSS variable values

### Theme not switching
- Ensure `ThemeProvider` is in layout
- Check `suppressHydrationWarning` on `<html>`
- Verify `next-themes` is installed

### Components not styled
- Import `globals.css` in layout
- Check component imports are correct
- Verify Tailwind is configured properly

## 📝 Changelog

### v1.0.0 (Initial Release)
- Complete color palette from Ghana flag
- Light and dark mode support
- All core components
- Dashboard layout
- Theme switcher
- Full accessibility support
