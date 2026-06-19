"use client";

import { useCallback, useMemo, useState } from "react";

import { EXAMINER_TYPE_OPTIONS } from "@/components/examiner-invitations/constants";
import type {
  CohortListItem,
  MembershipExaminer,
  MembershipPayload,
  MembershipTab,
  RuleOption,
} from "@/components/cohorts/types";
import {
  computeClaimedRegions,
  computeClaimedRoles,
  selectedMemberCount,
} from "@/components/cohorts/utils";
import { REGION_OPTIONS } from "@/lib/school-enums";

type InitFrom = {
  examiner_ids: string[];
  source_regions: string[];
  source_roles?: string[];
};

export function useCohortMembershipDraft(
  examiners: MembershipExaminer[],
  cohorts: CohortListItem[],
  editingCohortId: string | null,
) {
  const [membersDraft, setMembersDraft] = useState<Record<string, boolean>>({});
  const [regionsDraft, setRegionsDraft] = useState<Record<string, boolean>>({});
  const [rolesDraft, setRolesDraft] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<MembershipTab>("regions");
  const [peopleFilterUnassignedOnly, setPeopleFilterUnassignedOnly] = useState(false);

  const examinersByRegion = useMemo(() => {
    const map = new Map<string, MembershipExaminer[]>();
    for (const ex of examiners) {
      const list = map.get(ex.region) ?? [];
      list.push(ex);
      map.set(ex.region, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  }, [examiners]);

  const examinersByRole = useMemo(() => {
    const map = new Map<string, MembershipExaminer[]>();
    for (const ex of examiners) {
      const list = map.get(ex.examiner_type) ?? [];
      list.push(ex);
      map.set(ex.examiner_type, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  }, [examiners]);

  const regionOptions: RuleOption[] = useMemo(
    () =>
      REGION_OPTIONS.map((r) => ({
        value: r.value,
        label: r.label,
        count: examinersByRegion.get(r.value)?.length ?? 0,
      })),
    [examinersByRegion],
  );

  const roleOptions: RuleOption[] = useMemo(
    () =>
      EXAMINER_TYPE_OPTIONS.map((r) => ({
        value: r.value,
        label: r.label,
        count: examinersByRole.get(r.value)?.length ?? 0,
      })),
    [examinersByRole],
  );

  const claimedRegions = useMemo(
    () => computeClaimedRegions(cohorts, editingCohortId),
    [cohorts, editingCohortId],
  );

  const claimedRoles = useMemo(
    () => computeClaimedRoles(cohorts, editingCohortId),
    [cohorts, editingCohortId],
  );

  const selectedCount = useMemo(() => selectedMemberCount(membersDraft), [membersDraft]);

  const computeRegionsDraft = useCallback(
    (draft: Record<string, boolean>) => {
      const next: Record<string, boolean> = {};
      for (const r of REGION_OPTIONS) {
        const inRegion = examinersByRegion.get(r.value) ?? [];
        next[r.value] = inRegion.length > 0 && inRegion.every((ex) => draft[ex.id]);
      }
      return next;
    },
    [examinersByRegion],
  );

  const computeRolesDraft = useCallback(
    (draft: Record<string, boolean>) => {
      const next: Record<string, boolean> = {};
      for (const r of EXAMINER_TYPE_OPTIONS) {
        const inRole = examinersByRole.get(r.value) ?? [];
        next[r.value] = inRole.length > 0 && inRole.every((ex) => draft[ex.id]);
      }
      return next;
    },
    [examinersByRole],
  );

  const applyMemberSelection = useCallback(
    (next: Record<string, boolean>) => {
      setMembersDraft(next);
      setRegionsDraft(computeRegionsDraft(next));
      setRolesDraft(computeRolesDraft(next));
    },
    [computeRegionsDraft, computeRolesDraft],
  );

  const initFromCohort = useCallback(
    (from: InitFrom) => {
      const memberDraft: Record<string, boolean> = {};
      for (const ex of examiners) {
        memberDraft[ex.id] = from.examiner_ids.includes(ex.id);
      }
      const regionDraft: Record<string, boolean> = {};
      for (const r of REGION_OPTIONS) {
        regionDraft[r.value] = from.source_regions.includes(r.value);
      }
      const roleDraft: Record<string, boolean> = {};
      for (const r of EXAMINER_TYPE_OPTIONS) {
        roleDraft[r.value] = (from.source_roles ?? []).includes(r.value);
      }
      setMembersDraft(memberDraft);
      setRegionsDraft(regionDraft);
      setRolesDraft(roleDraft);
      setPeopleFilterUnassignedOnly(false);
      setActiveTab("regions");
    },
    [examiners],
  );

  const resetEmpty = useCallback(() => {
    const empty: Record<string, boolean> = {};
    for (const ex of examiners) {
      empty[ex.id] = false;
    }
    const regionEmpty: Record<string, boolean> = {};
    for (const r of REGION_OPTIONS) {
      regionEmpty[r.value] = false;
    }
    const roleEmpty: Record<string, boolean> = {};
    for (const r of EXAMINER_TYPE_OPTIONS) {
      roleEmpty[r.value] = false;
    }
    setMembersDraft(empty);
    setRegionsDraft(regionEmpty);
    setRolesDraft(roleEmpty);
    setPeopleFilterUnassignedOnly(false);
    setActiveTab("regions");
  }, [examiners]);

  const toggleRegion = useCallback(
    (region: string, checked: boolean) => {
      if (claimedRegions.has(region) && checked) return;
      const inRegion = examinersByRegion.get(region) ?? [];
      const nextMembers = { ...membersDraft };
      for (const ex of inRegion) {
        nextMembers[ex.id] = checked;
      }
      setMembersDraft(nextMembers);
      setRegionsDraft((prev) => ({ ...prev, [region]: checked }));
      setRolesDraft(computeRolesDraft(nextMembers));
    },
    [claimedRegions, computeRolesDraft, examinersByRegion, membersDraft],
  );

  const toggleRole = useCallback(
    (role: string, checked: boolean) => {
      if (claimedRoles.has(role) && checked) return;
      const inRole = examinersByRole.get(role) ?? [];
      const nextMembers = { ...membersDraft };
      for (const ex of inRole) {
        nextMembers[ex.id] = checked;
      }
      setMembersDraft(nextMembers);
      setRolesDraft((prev) => ({ ...prev, [role]: checked }));
      setRegionsDraft(computeRegionsDraft(nextMembers));
    },
    [claimedRoles, computeRegionsDraft, examinersByRole, membersDraft],
  );

  const toggleExaminer = useCallback(
    (examinerId: string, checked: boolean) => {
      applyMemberSelection({ ...membersDraft, [examinerId]: checked });
    },
    [applyMemberSelection, membersDraft],
  );

  const buildPayload = useCallback((): MembershipPayload => {
    return {
      source_regions: Object.entries(regionsDraft)
        .filter(([, v]) => v)
        .map(([k]) => k),
      source_roles: Object.entries(rolesDraft)
        .filter(([, v]) => v)
        .map(([k]) => k),
      examiner_ids: Object.entries(membersDraft)
        .filter(([, v]) => v)
        .map(([id]) => id),
    };
  }, [membersDraft, regionsDraft, rolesDraft]);

  const initWithExaminerIds = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids);
      const memberDraft: Record<string, boolean> = {};
      for (const ex of examiners) {
        memberDraft[ex.id] = idSet.has(ex.id);
      }
      setMembersDraft(memberDraft);
      setRegionsDraft(computeRegionsDraft(memberDraft));
      setRolesDraft(computeRolesDraft(memberDraft));
      setPeopleFilterUnassignedOnly(false);
      setActiveTab("people");
    },
    [computeRegionsDraft, computeRolesDraft, examiners],
  );

  const showUnassignedInPeople = useCallback(() => {
    setActiveTab("people");
    setPeopleFilterUnassignedOnly(true);
  }, []);

  return {
    membersDraft,
    regionsDraft,
    rolesDraft,
    activeTab,
    setActiveTab,
    peopleFilterUnassignedOnly,
    setPeopleFilterUnassignedOnly,
    regionOptions,
    roleOptions,
    claimedRegions,
    claimedRoles,
    selectedCount,
    examinersByRegion,
    initFromCohort,
    initWithExaminerIds,
    resetEmpty,
    toggleRegion,
    toggleRole,
    toggleExaminer,
    buildPayload,
    showUnassignedInPeople,
  };
}
