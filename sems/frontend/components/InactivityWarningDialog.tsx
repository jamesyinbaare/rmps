"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TriangleAlertIcon } from "lucide-react";

interface InactivityWarningDialogProps {
  open: boolean;
  remainingSeconds: number;
  onStayLoggedIn: () => void;
}

export function InactivityWarningDialog({
  open,
  remainingSeconds,
  onStayLoggedIn,
}: InactivityWarningDialogProps) {
  const [displaySeconds, setDisplaySeconds] = useState(remainingSeconds);

  useEffect(() => {
    setDisplaySeconds(remainingSeconds);
  }, [remainingSeconds]);

  // Format seconds as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[300px]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader className="pb-3">
          <div className="flex items-center gap-2">
            <TriangleAlertIcon className="size-5 text-yellow-500" />
            <DialogTitle className="text-base">Session Timeout</DialogTitle>
          </div>
        </DialogHeader>
        <div className="py-2">
          <div className="text-center">
            <div className="text-3xl font-bold text-foreground mb-1">
              {formatTime(displaySeconds)}
            </div>
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button onClick={onStayLoggedIn} size="sm" className="w-full">
            Stay Logged In
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
