import { useEffect, useState } from "react";
import { communitySecurityService } from "../services/api";
import type { CommunitySecurityReport } from "../services/types";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { ErrorMessage } from "./ErrorMessage";
import { StatCard } from "./StatCard";
import { StatListItem } from "./StatListItem";

export function CommunitySecurityReport({ communitySlug }: { communitySlug?: string }) {
  const [report, setReport] = useState<CommunitySecurityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!communitySlug) {
      setReport(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    communitySecurityService
      .getReport(communitySlug)
      .then((res) => {
        if (isMounted) {
          if (res.ok) {
            setReport(res.data);
          } else {
            setError("Failed to fetch security report. Please try again.");
          }
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || "An unexpected error occurred.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [communitySlug]);

  if (!communitySlug) {
    return (
      <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
        <h3 className="text-lg font-medium mb-2">No Community Selected</h3>
        <p>Please select a community to view its security report.</p>
      </div>
    );
  }

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <ErrorMessage
        title="Error Loading Report"
        message={error}
        details="Check your connection and ensure you have the correct permissions."
      />
    );
  }

  if (!report) {
    return null;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Security Report</h2>
          <p className="text-gray-500">Overview for {report.community.name} ({report.community.slug})</p>
        </div>
        <div className="text-sm text-gray-400">
          Generated at: {new Date(report.generatedAt).toLocaleString()}
        </div>
      </div>

      {/* 1. Fenrir Impact Summary */}
      <section>
        <h3 className="text-xl font-semibold mb-4 text-gray-800">Fenrir Impact Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard label="Blocked Attempts" value={report.impact.blockedAttempts} variant="indigo" />
          <StatCard label="Profile Fixes Needed" value={report.impact.usersNeedingProfileFixes} variant="orange" />
          <StatCard label="Fully Verified Users" value={report.impact.fullyVerifiedUsers} variant="emerald" />
        </div>
      </section>

      {/* Grid for User and Session Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* 2. User Statistics */}
        <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">User Statistics</h3>
          <ul className="space-y-3">
            <StatListItem label="Total Users" value={report.users.total} />
            <StatListItem label="Verified Users" value={report.users.verified} valueColor="emerald" />
            <StatListItem label="Blocked Users" value={report.users.blocked} valueColor="red" />
            <StatListItem label="Pending Users" value={report.users.pending} valueColor="yellow" isLast />
          </ul>
        </section>

        {/* 4. Login Session Statistics */}
        <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Login Sessions</h3>
          <ul className="space-y-3">
            <StatListItem label="Total Sessions" value={report.sessions.total} />
            <StatListItem label="Successful" value={report.sessions.successful} valueColor="emerald" />
            <StatListItem label="Failed / Blocked" value={`${report.sessions.failed} / ${report.sessions.blocked}`} valueColor="red" />
            <StatListItem label="Expired" value={report.sessions.expired} />
            <StatListItem label="Pending Review" value={report.sessions.pending} valueColor="yellow" isLast />
          </ul>
        </section>
      </div>

      {/* 3. Profile Quality */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">Profile Quality</h3>
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Users missing display names</span>
          <span className="font-semibold text-orange-600">{report.users.missingDisplayName}</span>
        </div>
        {report.users.missingDisplayName > 0 && (
          <p className="mt-3 text-sm text-gray-500">
            Consider prompting these users to update their profile to improve community engagement.
          </p>
        )}
      </section>

      {/* 5. Security Summary */}
      <section className="bg-blue-50 border border-blue-100 rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-3 text-blue-900">Security Narrative</h3>
        <p className="text-blue-800 leading-relaxed">
          Fenrir is actively protecting {report.community.name}. Out of {report.sessions.total} total recorded login attempts, {report.impact.blockedAttempts} risky or unauthorized attempts were successfully blocked. Currently, {report.impact.fullyVerifiedUsers} members are fully verified, ensuring a safe and trusted community environment.
        </p>
      </section>
    </div>
  );
}
