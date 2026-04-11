export type DepotNoticeHeadingParams = {
  year: number;
  examType: string;
  examSeries: string | null;
};

/** Main heading line under the examination title (depot keeper letter style). */
export function depotExaminationAppointmentHeading(params: DepotNoticeHeadingParams): string {
  const series = params.examSeries?.trim();
  const mid = series ? `${series} ` : "";
  return `APPOINTMENT OF DEPOT KEEPERS FOR ${mid}${params.examType.toUpperCase()} ${params.year}`;
}

/** Short orientation before the detailed security checklist and job description. */
export const depotExaminationSummaryHeading = "Summary";

export const depotExaminationSummaryParagraphs: string[] = [
  "As Depot Keeper you are CTVET’s accountable officer at your assigned depot for the examination named above. You safeguard examination materials, keep accurate records of movements and handovers, and work with the institution head, inspectors, supervisors, and invigilators so each sitting runs securely and on time.",
  "What follows is in two parts: first, minimum physical security expectations for examination depots; second, the full job description with numbered duties. Use them together with the timetable and the depot summary on this page when planning your work.",
];

export const depotExaminationSecurityHeading = "SECURITY AT THE EXAMINATIONS DEPOTS";

export const depotExaminationSecurityIntro =
  "As a depot keeper representing CTVET, you should liaise with the Principal of the institution where the depot is located to ensure the following minimum security indicators at CTVET examination depots:";

export const depotExaminationSecurityItems: string[] = [
  "Appropriate location of the depot or container, preferably within the school compound near the Administration Block, Staff Common Room, or the Head and Assistant Heads’ offices.",
  "The main door of the depot must be fortified with strong burglar proofing and security keys.",
  "Engagement of a security officer to guard the depot throughout the examination period.",
  "A strong safe or steel cabinet to keep examination questions.",
  "A good lighting system in and around the depot.",
  "Depots must be properly roofed, without leakage, and with a strong ceiling.",
  "Installation of CCTV is an added advantage.",
];

export const depotExaminationJobDescriptionHeading = "DEPOT KEEPERS JOB DESCRIPTION";

export const depotExaminationJobDescriptionIntro =
  "Depot Keepers are regional or district representatives of the Commission for Technical and Vocational Education and Training (Ministry of Education) and are answerable to the Director General of CTVET. The role requires high integrity, a pleasant disposition, sound moral qualities, and good interpersonal skills. Above all, you should be intelligent, security conscious, and committed to the work.";

export const depotExaminationJobDescriptionItems: string[] = [
  "Be present at the depot, take delivery of all examination materials sent from CTVET, make detailed entries in the appropriate books, and sign. Waybills must be properly checked before acceptance.",
  "Work in close collaboration with the Head of the institution where the depot is located and any other person detailed to assist.",
  "Ensure that keys to the depot are properly kept by you and zealously guarded.",
  "Be present throughout the writing of each examination and assist the inspector and assistant supervisor when necessary.",
  "Release question papers, answer booklets, and related materials on a daily basis to inspectors for dispatch to examination centres, well before commencement (for example before 9:00 a.m. where applicable).",
  "Ensure seals on each envelope are not broken or tampered with. If a bag or envelope is suspected damaged, report promptly to the centre inspector and supervisor, including the CTVET Roving Inspector.",
  "Check and endorse all reports on examination malpractices or impersonation from inspectors, supervisors, and invigilators.",
  "Ensure all scripts are returned to the depot immediately after examinations and that they are properly sealed before packing.",
  "Check thoroughly all documents returned by supervisors, inspectors, and invigilators before taking delivery.",
  "Remind inspectors and invigilators that ICMs must be properly marked (√ for present, A for absent) and signed by invigilators before enclosing them in their respective envelopes.",
  "Complete all documents (report forms, waybills, and so on) centre by centre for forwarding to CTVET.",
  "Ensure all cases of serious examination malpractices are reported to the police.",
  "Investigate and report on complaints lodged against anyone connected with the conduct of the examinations.",
  "Make ready all materials belonging to CTVET for collection to the office in Accra.",
  "Ensure that police officers are sent to the centres under your remit as required.",
];

export const depotExaminationContactsHeading = "ACCEPTANCE OF APPOINTMENT";

export const depotExaminationContactsIntro =
  "Please confirm your acceptance of this appointment on any of the following telephone numbers:";

export const depotExaminationContactLines: string[] = [
  "0540917815 (Eric Asiedu Ansah)",
  "0558124495 (Philip Quarm)"
];

export const depotExaminationClosing =
  "We rely on your trusted cooperation and high sense of vigilance to achieve incident-free and peaceful examinations.";

export const depotExaminationSignOff = "Yours faithfully,";

export const depotExaminationSignatoryLines: string[] = [
  "",
  "ERIC ASIEDU ANSAH",
  "HEAD, ASSESSMENT",
  "FOR: DIRECTOR GENERAL",
];

export const depotExaminationDocumentsChecklist: string[] = [
  "Examination timetable (available in this system for your depot scope)",
  "Undertaking for Examination Materials",
  "Waybills and receipt records for all movements of materials",
  "Reports on irregularities and malpractices (endorsed as required)",
  "Centre-by-centre documentation for return to CTVET",
];
