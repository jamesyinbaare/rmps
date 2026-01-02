"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { CreateCoordinatorDialog } from "@/components/admin/CreateCoordinatorDialog";
import { CoordinatorTable } from "@/components/admin/CoordinatorTable";
import { listCoordinators } from "@/lib/api";
import { toast } from "sonner";
import type { User } from "@/types";
import { Plus } from "lucide-react";

export default function CoordinatorsPage() {
  const [admins, setAdmins] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

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

  useEffect(() => {
    loadAdmins();
  }, []);

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
