import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from "lucide-react";

const alertVariants = cva(
  "relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground border-border",
        destructive:
          "border-[var(--destructive)]/50 text-[var(--destructive)] bg-[var(--destructive)]/10 [&>svg]:text-[var(--destructive)]",
        success:
          "border-[var(--success)]/50 text-[var(--success-foreground)] bg-[var(--success)]/10 [&>svg]:text-[var(--success)]",
        warning:
          "border-[var(--warning)]/50 text-[var(--warning-foreground)] bg-[var(--warning)]/10 [&>svg]:text-[var(--warning)]",
        info: "border-[var(--accent)]/50 text-[var(--accent-foreground)] bg-[var(--accent)]/10 [&>svg]:text-[var(--accent)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

// Pre-configured alert components
const AlertDestructive = ({ title, description, onClose }: {
  title?: string;
  description: string;
  onClose?: () => void;
}) => (
  <Alert variant="destructive">
    <AlertCircle className="h-4 w-4" />
    {onClose && (
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    )}
    {title && <AlertTitle>{title}</AlertTitle>}
    <AlertDescription>{description}</AlertDescription>
  </Alert>
);

const AlertSuccess = ({ title, description, onClose }: {
  title?: string;
  description: string;
  onClose?: () => void;
}) => (
  <Alert variant="success">
    <CheckCircle className="h-4 w-4" />
    {onClose && (
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    )}
    {title && <AlertTitle>{title}</AlertTitle>}
    <AlertDescription>{description}</AlertDescription>
  </Alert>
);

const AlertWarning = ({ title, description, onClose }: {
  title?: string;
  description: string;
  onClose?: () => void;
}) => (
  <Alert variant="warning">
    <AlertTriangle className="h-4 w-4" />
    {onClose && (
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    )}
    {title && <AlertTitle>{title}</AlertTitle>}
    <AlertDescription>{description}</AlertDescription>
  </Alert>
);

const AlertInfo = ({ title, description, onClose }: {
  title?: string;
  description: string;
  onClose?: () => void;
}) => (
  <Alert variant="info">
    <Info className="h-4 w-4" />
    {onClose && (
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    )}
    {title && <AlertTitle>{title}</AlertTitle>}
    <AlertDescription>{description}</AlertDescription>
  </Alert>
);

export {
  Alert,
  AlertTitle,
  AlertDescription,
  AlertDestructive,
  AlertSuccess,
  AlertWarning,
  AlertInfo,
};
