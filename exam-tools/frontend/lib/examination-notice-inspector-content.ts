export type InspectorNoticeHeadingParams = {
  year: number;
  examType: string;
  examSeries: string | null;
};

export function inspectorExaminationAppointmentHeading(params: InspectorNoticeHeadingParams): string {
  const series = params.examSeries?.trim();
  const mid = series ? `${series} ` : "";
  return `CTVET INSPECTOR APPOINTMENT — ${mid}${params.examType.toUpperCase()} ${params.year}`;
}

export const inspectorExaminationSummaryHeading = "Summary";

export const inspectorExaminationSummaryParagraphs: string[] = [
  "As Centre Inspector you are CTVET’s representative at the assigned examination centre. You ensure rules are followed, materials move securely between the depot and the halls, and daily inspection and reporting requirements are met.",
  "Below are scheduling and contact reminders, then the full job description with numbered duties. Use them together with the timetable and centre summary on this page.",
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function ordinalDay(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/** e.g. "30th June 2025" from ISO date YYYY-MM-DD */
export function formatOrdinalLongDate(isoDate: string): string {
  const [yStr, mStr, dStr] = isoDate.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!y || !m || !d || m < 1 || m > 12) return isoDate;
  return `${ordinalDay(d)} ${MONTHS[m - 1]} ${y}`;
}

/** Sentence for notification item 1 (examination period). */
export function inspectorExaminationWindowSentence(
  examinationWindowStart: string | null,
  examinationWindowEnd: string | null,
): string {
  if (!examinationWindowStart || !examinationWindowEnd) {
    return "Use the examination timetable in this system for the confirmed examination dates at your centre.";
  }
  if (examinationWindowStart === examinationWindowEnd) {
    return `This examination is scheduled to take place on ${formatOrdinalLongDate(examinationWindowStart)}.`;
  }
  return `This examination is scheduled to take place from ${formatOrdinalLongDate(
    examinationWindowStart,
  )} to ${formatOrdinalLongDate(examinationWindowEnd)}.`;
}

export function inspectorAppointmentIntro(params: {
  year: number;
  examType: string;
  examSeries: string | null;
  centreName: string;
  centreCode: string;
  region: string;
}): string {
  const series = params.examSeries?.trim();
  const seriesBit = series ? `${series} ` : "";
  return `For the ${params.year} ${seriesBit}${params.examType}, this portal shows you as a Centre Inspector for the Commission for Technical and Vocational Education and Training (CTVET). Your assigned examination centre is ${params.centreName} (Centre No ${params.centreCode}), ${params.region} Region.`;
}

export const inspectorPleaseNoteLead =
  "The points below are the same expectations CTVET sets for inspectors in the field; use them alongside the timetable and tools in this system.";

export function inspectorNumberedNotifications(windowSentence: string): string[] {
  return [
    windowSentence,
    "Meet the Supervisor (Head of School) at least one (1) hour before the start of examinations. Bring or show a printout of this page if your centre asks for it.",
    "Your job description, the Examination Notes to Supervisors and Invigilators, Rules and Regulations for dealing with Cases of Irregularities, Daily Inspection’s Report Forms, and the examination timetable are available in this system for reference and action.",
    "Arrange with the Head of your establishment to be released for the assignment.",
    "Sign the document headed “Letter of Undertaking” with the Supervisor present before examination materials are handed over to you, following CTVET’s handover process (including any Roving Inspector instructions).",
    "In the case of any enquiry or challenge, please call 0558124495 / 0540917815 or send an email to aac@ctvet.gov.gh or eric.asieduansah@ctvet.gov.gh.",
  ];
}

export const inspectorExaminationClosing =
  "We rely on your trusted cooperation and high sense of vigilance in achieving incident-free and peaceful examinations.";

export const inspectorExaminationSignOff = "Yours faithfully,";

export const inspectorExaminationSignatoryLines: string[] = [
  "",
  "ERIC ASIEDU ANSAH",
  "DEPUTY DIRECTOR",
  "FOR: DIRECTOR GENERAL",
];

export const inspectorJobDescriptionHeading = "JOB DESCRIPTION FOR THE CENTRE INSPECTOR";

export const inspectorJobDescriptionIntro =
  "The duties below apply throughout the period of the examinations at your assigned centre.";

export const inspectorJobDescriptionItems: string[] = [
  "As a Centre Inspector, you are the sole representative of CTVET as an examination body on the field. We therefore expect you to conduct yourself appropriately to ensure that the examinations proceed smoothly in an environment of fairness, devoid of malpractices.",
  "You shall work closely with the Supervisor (i.e. Head / Assistant of the Centre or Institution) and ensure that all examination rules are strictly adhered to.",
  "You shall be at the Centre throughout the period of the examinations. On no occasion shall you leave the centre or examination hall when the examination is in progress.",
  "Parcels containing question papers would be made available at designated depots. On each parcel, there is an indication of the date on which it is to be opened. On no account shall a parcel containing questions be opened prior to the date of the examinations.",
  "You shall inspect each parcel for each day to ensure that the parcel has not been tampered with, before the start of the exams.",
  "Work in close collaboration with other assigned officers (invigilators and depot keepers) at the assigned centre.",
  "Pick questions and other examination materials on each examination day from the depot or depot keeper and transport them to the examination halls very early before the commencement of the exams at 9:00 a.m.",
  "Before receiving the parcels containing the questions for the day from the depot keeper, inspectors shall ensure that the seals to each envelope containing the questions are not broken or tampered with. In case of suspicion of any damage to any bag or any envelope, quickly report to the CTVET Roving Inspector and the Supervisor of the school.",
  "Remind supervisors and invigilators that Invigilation Certificate / Mark sheets (ICMs) shall be properly checked (√) for present and noted (A) as absent, and signed by invigilators before enclosing them in their respective envelopes.",
  "Ensure that police officer(s) is/are recruited to the centre under your jurisdiction.",
  "Ensure that all cases of serious examination malpractices are reported to the police.",
  "After the examinations, you shall ensure that all candidates have returned all answer booklet(s) supplied to them, whether used or unused, together with any other attachments. This includes the scannable sheets for responding to the multiple-choice question papers. Any work, once taken out of the examination room by a candidate, shall not be accepted.",
  "Investigate and report all complaints that may be lodged against anyone connected with the conduct of the examinations.",
  "Present a report on the conduct of the examination to the Assessment and Certification Department, CTVET.",
  "Parceling of worked scripts shall be completed immediately after the examination and the signature of the Inspector shall be endorsed on the cello tapes on the envelopes or parcels and handed over to the depot keeper for safekeeping.",
  "For institutions with a large number of candidates, at most 50 answer booklets shall be packed into each script envelope. The corresponding pages of ICM, bearing the names of those candidates whose scripts are contained in the envelope, shall also be put inside the same envelope before sealing.",
  "The sealing of the envelope shall be done at the mouth of the envelopes and the scripts left loosely in the script bag envelope. Under no circumstance shall cellotape be used to tightly bind the envelope containing worked scripts, such that removing and putting back the same worked scripts becomes difficult. Inspectors whose packing reaches the CTVET office without adhering to the specified or approved packaging format would be black-listed and barred from taking part in all CTVET examinations.",
  "Worked scannable sheets are to be kept between pairs of strawboards and each pair should be kept in provided envelopes. For higher numbers of scannables, two or more envelopes should be used and their corresponding ICM put into the envelopes containing the scannable sheets. Not more than 200 scannable sheets shall be within a pair of strawboards.",
  "After each examination, the opened envelopes which contained the examination question papers and any surplus examination papers and materials shall be packed appropriately in locked sacks and handed over to the depot keeper.",
  "All daily reports should be submitted to the Assessment and Certification Department, CTVET, just after the last examination (the conduct of the last paper) or sent to aac@ctvet.gov.gh. The report could be given to the CTVET Inspector for onward submission to the Commission.",
];
