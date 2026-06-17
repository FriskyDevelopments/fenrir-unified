type StatListItemProps = {
  label: string;
  value: string | number;
  valueColor?: "default" | "emerald" | "red" | "yellow" | "orange";
  isLast?: boolean;
};

const valueColorStyles: Record<NonNullable<StatListItemProps["valueColor"]>, string> = {
  default: "",
  emerald: "text-emerald-600",
  red: "text-red-600",
  yellow: "text-yellow-600",
  orange: "text-orange-600"
};

export function StatListItem({ label, value, valueColor = "default", isLast = false }: StatListItemProps) {
  return (
    <li className={`flex justify-between items-center py-2 ${isLast ? "" : "border-b border-gray-100"}`}>
      <span className="text-gray-600">{label}</span>
      <span className={`font-semibold ${valueColorStyles[valueColor]}`.trim()}>{value}</span>
    </li>
  );
}
