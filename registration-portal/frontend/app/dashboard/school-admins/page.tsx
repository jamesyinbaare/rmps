"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CreateCoordinatorDialog } from "@/components/admin/CreateCoordinatorDialog";
import { CoordinatorTable } from "@/components/admin/CoordinatorTable";
import { listCoordinators, getCurrentUser } from "@/lib/api";
import { toast } from "sonner";
import type { User } from "@/types";
import { Plus } from "lucide-react";

export default function CoordinatorsPage() {
  const router = useRouter();
  const [admins, setAdmins] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const user = await getCurrentUser();
        // Only SystemAdmin and other admin roles can access this page
        // SchoolAdmin and User should be redirected
        if (user.role === "SchoolAdmin" || user.role === "SchoolStaff" || user.role === "PublicUser") {
          toast.error("Access denied. This page is only available to system administrators.");
          router.push("/dashboard/my-school");
          return;
        }
        setCheckingAccess(false);
        loadAdmins();
      } catch (error) {
        toast.error("Failed to verify access");
        router.push("/dashboard");
      }
    };

    checkAccess();
  }, [router]);

  const loadAdmins = async () => {
    setLoading(true);
    try {
      const data = await listCoordinators();
      setAdmins(data);
    } catch (error) {
      toast.error("Failed to load coordinators");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (checkingAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">Checking access...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Coordinators</h1>
          <p className="text-muted-foreground">Manage coordinator accounts</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Coordinator
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8">Loading...</div>
      ) : (
        <CoordinatorTable admins={admins} />
      )}

      <CreateCoordinatorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={loadAdmins}
      />
    </div>
  );
}
