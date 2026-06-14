export default function AdminExaminersLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="flex flex-col">{children}</div>;
}
