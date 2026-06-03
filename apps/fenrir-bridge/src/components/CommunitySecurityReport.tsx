import { useEffect, useState } from "react";
import { communitySecurityService } from "../services/api";
import type { CommunitySecurityReport } from "../services/types";

type LoadingState = "idle" | "loading" | "success" | "error";

export function CommunitySecurityReport({ communitySlug = "fenrir" }: { communitySlug?: string }) {
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [report, setReport] = useState<CommunitySecurityReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchReport() {
      setLoadingState("loading");
      setError(null);
      try {
        const response = await communitySecurityService.getReport(communitySlug);
        setReport(response.data);
        setLoadingState("success");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load security report");
        setLoadingState("error");
      }
    }

    fetchReport();
  }, [communitySlug]);

  if (loadingState === "loading") {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (loadingState === "error") {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Error Loading Report</h2>
          <p className="text-red-600">{error || "Unable to load security report. Please try again later."}</p>
        </div>
      </div>
    );
  }

  if (loadingState === "idle" || !report) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">No Report Data</h2>
          <p className="text-gray-600">Select a community to view its security report.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Community Security Report</h1>
        <p className="text-gray-600">
          {report.community.name} ({report.community.slug})
        </p>
        <p className="text-sm text-gray-500 mt-1">
          Generated: {new Date(report.generatedAt).toLocaleString()}
        </p>
      </div>

      {/* Fenrir Impact Summary */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Fenrir Impact Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="text-3xl font-bold text-green-600 mb-1">{report.impact.blockedAttempts}</div>
            <div className="text-sm text-gray-600">Risky login attempts blocked</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="text-3xl font-bold text-amber-600 mb-1">{report.impact.usersNeedingProfileFixes}</div>
            <div className="text-sm text-gray-600">Users need profile fixes</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="text-3xl font-bold text-blue-600 mb-1">{report.impact.fullyVerifiedUsers}</div>
            <div className="text-sm text-gray-600">Fully verified users</div>
          </div>
        </div>
      </div>

      {/* User Statistics */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">User Statistics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Users" value={report.users.total} color="gray" />
          <StatCard label="Verified Users" value={report.users.verified} color="green" />
          <StatCard label="Blocked Users" value={report.users.blocked} color="red" />
          <StatCard label="Pending Users" value={report.users.pending} color="amber" />
        </div>
      </div>

      {/* Profile Quality */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Profile Quality</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatCard
            label="Missing Display Name"
            value={report.users.missingDisplayName}
            color="amber"
            subtitle="Users need to add their display name"
          />
        </div>
      </div>

      {/* Login Session Statistics */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Login Session Statistics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Total Sessions" value={report.sessions.total} color="gray" />
          <StatCard label="Successful Logins" value={report.sessions.successful} color="green" />
          <StatCard label="Failed Logins" value={report.sessions.failed} color="red" />
          <StatCard label="Blocked Attempts" value={report.sessions.blocked} color="purple" />
          <StatCard label="Expired Sessions" value={report.sessions.expired} color="gray" />
          <StatCard label="Pending Review" value={report.sessions.pending} color="amber" />
        </div>
      </div>

      {/* Summary Statement */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Security Summary</h2>
        <p className="text-gray-700">
          Fenrir has protected this community by blocking <strong>{report.impact.blockedAttempts}</strong> risky login attempts.
          Currently, <strong>{report.impact.usersNeedingProfileFixes}</strong> users need to update their profile information,
          and <strong>{report.impact.fullyVerifiedUsers}</strong> users are fully verified and active.
        </p>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  subtitle
}: {
  label: string;
  value: number;
  color: "gray" | "green" | "red" | "amber" | "blue" | "purple";
  subtitle?: string;
}) {
  const colorClasses = {
    gray: "text-gray-900",
    green: "text-green-600",
    red: "text-red-600",
    amber: "text-amber-600",
    blue: "text-blue-600",
    purple: "text-purple-600"
  };

  const bgClasses = {
    gray: "bg-gray-50 border-gray-200",
    green: "bg-green-50 border-green-200",
    red: "bg-red-50 border-red-200",
    amber: "bg-amber-50 border-amber-200",
    blue: "bg-blue-50 border-blue-200",
    purple: "bg-purple-50 border-purple-200"
  };

  return (
    <div className={`border rounded-lg p-4 ${bgClasses[color]}`}>
      <div className={`text-3xl font-bold ${colorClasses[color]} mb-1`}>{value}</div>
      <div className="text-sm font-medium text-gray-700">{label}</div>
      {subtitle && <div className="text-xs text-gray-500 mt-1">{subtitle}</div>}
    </div>
  );
}