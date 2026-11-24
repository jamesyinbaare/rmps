/**
 * Role-aware API access for the shared CandidateDetailModal.
 * Keeps school and admin portals on one UI while routing to the right endpoints.
 */

import type {
  Programme,
  RegistrationCandidate,
  RegistrationCandidateCreate,
  RegistrationCandidatePhoto,
  Role,
} from "@/types";
import {
  deleteAdminCandidatePhoto,
  deleteCandidatePhoto,
  getAdminCandidatePhoto,
  getAdminPhotoFile,
  getCandidatePhoto,
  getPhotoFile,
  getSchoolProgrammes,
  listSchoolProgrammes,
  updateAdminCandidate,
  updateCandidate,
  uploadAdminCandidatePhoto,
  uploadCandidatePhoto,
} from "@/lib/api";

const PLATFORM_ADMIN_ROLES: Role[] = [
  "SystemAdmin",
  "Director",
  "DeputyDirector",
  "PrincipalManager",
  "SeniorManager",
  "Manager",
  "Staff",
];

export function isPlatformAdmin(role: Role | string | null | undefined): boolean {
  if (!role) return false;
  return PLATFORM_ADMIN_ROLES.includes(role as Role);
}

export async function fetchCandidatePhoto(
  candidateId: number,
  isAdmin: boolean
): Promise<RegistrationCandidatePhoto | null> {
  return isAdmin
    ? getAdminCandidatePhoto(candidateId)
    : getCandidatePhoto(candidateId);
}

export async function fetchCandidatePhotoFile(
  candidateId: number,
  isAdmin: boolean
): Promise<string | null> {
  return isAdmin ? getAdminPhotoFile(candidateId) : getPhotoFile(candidateId);
}

export async function updateCandidateDetail(
  candidateId: number,
  candidateData: Partial<RegistrationCandidateCreate>,
  isAdmin: boolean
): Promise<RegistrationCandidate> {
  return isAdmin
    ? updateAdminCandidate(candidateId, candidateData)
    : updateCandidate(candidateId, candidateData);
}

export async function uploadCandidateDetailPhoto(
  candidateId: number,
  file: File,
  isAdmin: boolean,
  replaceBackground: boolean = false
): Promise<RegistrationCandidatePhoto> {
  return isAdmin
    ? uploadAdminCandidatePhoto(candidateId, file, replaceBackground)
    : uploadCandidatePhoto(candidateId, file, replaceBackground);
}

export async function deleteCandidateDetailPhoto(
  candidateId: number,
  isAdmin: boolean
): Promise<void> {
  return isAdmin
    ? deleteAdminCandidatePhoto(candidateId)
    : deleteCandidatePhoto(candidateId);
}

export async function listProgrammesForCandidateEdit(options: {
  examId?: number | null;
  schoolId?: number | null;
  isAdmin: boolean;
}): Promise<Programme[]> {
  const { examId, schoolId, isAdmin } = options;
  if (isAdmin) {
    if (!schoolId) return [];
    return getSchoolProgrammes(schoolId);
  }
  return listSchoolProgrammes(examId ?? undefined);
}
