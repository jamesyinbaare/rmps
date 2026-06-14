export function buildWorkforceAcceptanceStatement(profile: {
  name: string;
  role_label: string;
  examination_label: string;
}): string {
  return (
    `I, ${profile.name}, confirm my availability to serve as a ${profile.role_label.toLowerCase()} ` +
    `for the ${profile.examination_label} examinations. I will follow all instructions from the exam office.`
  );
}
