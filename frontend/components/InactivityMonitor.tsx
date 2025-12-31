"use client";

import { useEffect, useState } from "react";
import React from "react";
import { useInactivityMonitor } from "@/hooks/useInactivityMonitor";
import { InactivityWarningDialog } from "@/components/InactivityWarningDialog";
import { onInactivityEvent, handleStayLoggedIn } from "@/lib/inactivity-monitor";

/**
 * Client component wrapper for inactivity monitoring
 * This must be a client component because it uses hooks
 */
export function InactivityMonitor() {
  useInactivityMonitor();
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const isClosingRef = React.useRef(false);

  useEffect(() => {
    const unsubscribe = onInactivityEvent((data) => {
      // Ignore events if we're in the process of closing
      if (isClosingRef.current && data?.remainingSeconds !== undefined) {
        return;
      }

      if (data?.remainingSeconds !== undefined) {
        isClosingRef.current = false;
        setRemainingSeconds(data.remainingSeconds);
        setShowWarning(true);
      } else {
        // Event without data means warning ended
        isClosingRef.current = false;
        setShowWarning(false);
      }
    });

    return unsubscribe;
  }, []);

  const handleStayLoggedInClick = () => {
    isClosingRef.current = true;
    setShowWarning(false);
    handleStayLoggedIn();
  };

  return (
    <>
      <InactivityWarningDialog
        open={showWarning}
        remainingSeconds={remainingSeconds}
        onStayLoggedIn={handleStayLoggedInClick}
      />
    </>
  );
}
