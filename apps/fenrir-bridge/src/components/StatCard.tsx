type StatCardProps = {
  label: string;
  value: string | number;
  variant?: "default" | "indigo" | "orange" | "emerald";
  className?: string;
};

const variantStyles: Record<NonNullable<StatCardProps["variant"]>, string> = {
  default: "bg-white border-gray-200",
  indigo: "bg-indigo-50 border-indigo-100",
  orange: "bg-orange-50 border-orange-100",
  emerald: "bg-emerald-50 border-emerald-100"
};

const labelStyles: Record<NonNullable<StatCardProps["variant"]>, string> = {
  default: "text-gray-600",
  indigo: "text-indigo-600",
  orange: "text-orange-600",
  emerald: "text-emerald-600"
};

const valueStyles: Record<NonNullable<StatCardProps["variant"]>, string> = {
  default: "text-gray-900",
  indigo: "text-indigo-900",
  orange: "text-orange-900",
  emerald: "text-emerald-900"
};

export function StatCard({ label, value, variant = "default", className = "" }: StatCardProps) {
  return (
    <div className={`border rounded-xl p-6 shadow-sm ${variantStyles[variant]} ${className}`.trim()}>
      <div className={`text-sm font-medium mb-1 ${labelStyles[variant]}`}>{label}</div>
      <div className={`text-3xl font-bold ${valueStyles[variant]}`}>{value}</div>
    </div>
  );
}
