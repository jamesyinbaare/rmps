import type { StaffNavLinkItem, StaffNavSectionConfig } from "@/components/staff-sidebar-nav";

export type StaffRole = "supervisor" | "inspector" | "depot-keeper";

type BuildStaffNavParams = {
  staffRole: StaffRole;
  pathname: string;
  staffBase: string;
  changeCentreNavItem: StaffNavLinkItem | null;
};

function link(href: string, label: string, pathname: string, exact = false): StaffNavLinkItem {
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return { href, label, active };
}

export function buildStaffSidebarNav({
  staffRole,
  pathname,
  staffBase,
  changeCentreNavItem,
}: BuildStaffNavParams): {
  prependItems: StaffNavLinkItem[];
  sections: StaffNavSectionConfig[];
} {
  const timetableHref = `${staffBase}/timetable`;
  const documentsHref = `${staffBase}/documents`;
  const scriptsHref = `${staffBase}/scripts-control`;
  const irregularScriptsHref = `${staffBase}/irregular-scripts-control`;
  const questionPaperHref = `${staffBase}/question-paper-control`;
  const examinationNoticeHref = `${staffBase}/examination-notice`;

  const examOperations: StaffNavSectionConfig = {
    title: "Exam operations",
    items: [
      link(staffBase, "Overview", pathname, true),
      link(timetableHref, "Examination timetable", pathname),
      link(examinationNoticeHref, "Examination notice", pathname),
      link(documentsHref, "Documents", pathname),
    ],
  };

  const scriptControl: StaffNavSectionConfig = {
    title: staffRole === "depot-keeper" ? "Script verification" : "Script control",
    items: [
      link(scriptsHref, "Worked Scripts Control", pathname),
      link(irregularScriptsHref, "Irregular Scripts Control", pathname),
      link(questionPaperHref, "Question paper control", pathname),
    ],
  };

  const sections: StaffNavSectionConfig[] = [examOperations];

  if (staffRole === "inspector" || staffRole === "depot-keeper") {
    sections.push(scriptControl);
  }

  return {
    prependItems: changeCentreNavItem ? [changeCentreNavItem] : [],
    sections,
  };
}
