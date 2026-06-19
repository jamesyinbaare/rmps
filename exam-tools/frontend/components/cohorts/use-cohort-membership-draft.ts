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
  deriveManualMembersDraft,
  mergeRuleAndManualMembers,
  selectedMemberCount,
} from "@/components/cohorts/utils";
import { REGION_OPTIONS } from "@/lib/school-enums";

type InitFrom = {
  examiner_ids: string[];
  source_regions: string[];
  source_roles?: string[];
};

type Options = {
  exclusiveRules?: boolean;
};

function emptyRuleDraft<T extends { value: string }>(options: T[]): Record<string, boolean> {
  const draft: Record<string, boolean> = {};
  for (const option of options) {
    draft[option.value] = false;
  }
  return draft;
}

export function useCohortMembershipDraft(
  examiners: MembershipExaminer[],
  cohorts: CohortListItem[],
  editingCohortId: string | null,
  options: Options = {},
) {
  const exclusiveRules = options.exclusiveRules ?? false;

  const [membersDraft, setMembersDraft] = useState<Record<string, boolean>>({});
  const [regionsDraft, setRegionsDraft] = useState<Record<string, boolean>>({});
  const [rolesDraft, setRolesDraft] = useState<Record<string, boolean>>({});
  const [manualMembersDraft, setManualMembersDraft] = useState<Record<string, boolean>>({});
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
    () => (exclusiveRules ? computeClaimedRegions(cohorts, editingCohortId) : new Map()),
    [cohorts, editingCohortId, exclusiveRules],
  );

  const claimedRoles = useMemo(
    () => (exclusiveRules ? computeClaimedRoles(cohorts, editingCohortId) : new Map()),
    [cohorts, editingCohortId, exclusiveRules],
  );

  const selectedCount = useMemo(() => selectedMemberCount(membersDraft), [membersDraft]);

  const applyRuleDrafts = useCallback(
    (
      nextRegions: Record<string, boolean>,
      nextRoles: Record<string, boolean>,
      manual: Record<string, boolean>,
    ) => {
      setRegionsDraft(nextRegions);
      setRolesDraft(nextRoles);
      setManualMembersDraft(manual);
      setMembersDraft(mergeRuleAndManualMembers(nextRegions, nextRoles, manual, examiners));
    },
    [examiners],
  );

  const initFromCohort = useCallback(
    (from: InitFrom) => {
      const regionDraft: Record<string, boolean> = {};
      for (const r of REGION_OPTIONS) {
        regionDraft[r.value] = from.source_regions.includes(r.value);
      }
      const roleDraft: Record<string, boolean> = {};
      for (const r of EXAMINER_TYPE_OPTIONS) {
        roleDraft[r.value] = (from.source_roles ?? []).includes(r.value);
      }
      const manual = deriveManualMembersDraft(
        from.examiner_ids,
        regionDraft,
        roleDraft,
        examiners,
      );
      applyRuleDrafts(regionDraft, roleDraft, manual);
      setPeopleFilterUnassignedOnly(false);
      setActiveTab("regions");
    },
    [applyRuleDrafts, examiners],
  );

  const resetEmpty = useCallback(() => {
    const emptyMembers: Record<string, boolean> = {};
    for (const ex of examiners) {
      emptyMembers[ex.id] = false;
    }
    setMembersDraft(emptyMembers);
    setRegionsDraft(emptyRuleDraft(REGION_OPTIONS));
    setRolesDraft(emptyRuleDraft(EXAMINER_TYPE_OPTIONS));
    setManualMembersDraft({});
    setPeopleFilterUnassignedOnly(false);
    setActiveTab("regions");
  }, [examiners]);

  const toggleRegion = useCallback(
    (region: string, checked: boolean) => {
      if (exclusiveRules && claimedRegions.has(region) && checked) return;
      const nextRegions = { ...regionsDraft, [region]: checked };
      applyRuleDrafts(nextRegions, rolesDraft, manualMembersDraft);
    },
    [
      applyRuleDrafts,
      claimedRegions,
      exclusiveRules,
      manualMembersDraft,
      regionsDraft,
      rolesDraft,
    ],
  );

  const toggleRole = useCallback(
    (role: string, checked: boolean) => {
      if (exclusiveRules && claimedRoles.has(role) && checked) return;
      const nextRoles = { ...rolesDraft, [role]: checked };
      applyRuleDrafts(regionsDraft, nextRoles, manualMembersDraft);
    },
    [
      applyRuleDrafts,
      claimedRoles,
      exclusiveRules,
      manualMembersDraft,
      regionsDraft,
      rolesDraft,
    ],
  );

  const toggleExaminer = useCallback(
    (examinerId: string, checked: boolean) => {
      const nextManual = { ...manualMembersDraft };
      if (checked) {
        nextManual[examinerId] = true;
      } else {
        delete nextManual[examinerId];
      }
      applyRuleDrafts(regionsDraft, rolesDraft, nextManual);
    },
    [applyRuleDrafts, manualMembersDraft, regionsDraft, rolesDraft],
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
      const manual: Record<string, boolean> = {};
      for (const id of ids) {
        manual[id] = true;
      }
      const emptyRegions = emptyRuleDraft(REGION_OPTIONS);
      const emptyRoles = emptyRuleDraft(EXAMINER_TYPE_OPTIONS);
      const memberDraft: Record<string, boolean> = {};
      for (const ex of examiners) {
        memberDraft[ex.id] = idSet.has(ex.id);
      }
      setRegionsDraft(emptyRegions);
      setRolesDraft(emptyRoles);
      setManualMembersDraft(manual);
      setMembersDraft(memberDraft);
      setPeopleFilterUnassignedOnly(false);
      setActiveTab("people");
    },
    [examiners],
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
