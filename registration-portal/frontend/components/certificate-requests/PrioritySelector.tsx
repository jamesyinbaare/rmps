"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { AlertCircle, ArrowUp, ArrowDown, Minus } from "lucide-react";

type Priority = "low" | "medium" | "high" | "urgent";

interface PrioritySelectorProps {
  value: Priority;
  onValueChange: (value: Priority) => void;
  label?: string;
  className?: string;
}

export function PrioritySelector({
  value,
  onValueChange,
  label = "Priority",
  className,
}: PrioritySelectorProps) {
  const getPriorityIcon = (priority: Priority) => {
    switch (priority) {
      case "urgent":
        return <AlertCircle className="h-4 w-4" />;
      case "high":
        return <ArrowUp className="h-4 w-4" />;
      case "low":
        return <ArrowDown className="h-4 w-4" />;
      default:
        return <Minus className="h-4 w-4" />;
    }
  };

  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case "urgent":
        return "bg-red-500 text-white";
      case "high":
        return "bg-orange-500 text-white";
      case "medium":
        return "bg-yellow-500 text-white";
      case "low":
        return "bg-blue-500 text-white";
      default:
        return "bg-gray-500 text-white";
    }
  };

  return (
    <div className={className}>
      <Label htmlFor="priority">{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id="priority" className="w-full">
          <SelectValue placeholder="Select priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="low">Low</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="high">High</SelectItem>
          <SelectItem value="urgent">Urgent</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case "urgent":
        return "bg-red-500 hover:bg-red-600 text-white";
      case "high":
        return "bg-orange-500 hover:bg-orange-600 text-white";
      case "medium":
        return "bg-yellow-500 hover:bg-yellow-600 text-white";
      case "low":
        return "bg-blue-500 hover:bg-blue-600 text-white";
      default:
        return "bg-gray-500 hover:bg-gray-600 text-white";
    }
  };

  const getPriorityIcon = (priority: Priority) => {
    switch (priority) {
      case "urgent":
        return <AlertCircle className="h-3 w-3" />;
      case "high":
        return <ArrowUp className="h-3 w-3" />;
      case "low":
        return <ArrowDown className="h-3 w-3" />;
      default:
        return <Minus className="h-3 w-3" />;
    }
  };

  return (
    <Badge className={getPriorityColor(priority)}>
      <div className="flex items-center gap-1">
        {getPriorityIcon(priority)}
        <span className="capitalize text-xs">{priority}</span>
      </div>
    </Badge>
  );
}
