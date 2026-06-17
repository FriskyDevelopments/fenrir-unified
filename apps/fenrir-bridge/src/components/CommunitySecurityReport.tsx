import React, { useEffect, useState } from "react";
import { communitySecurityService } from "../services/api";
import type { CommunitySecurityReport } from "../services/types";

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
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-32 bg-gray-200 rounded-lg"></div>
          <div className="h-32 bg-gray-200 rounded-lg"></div>
          <div className="h-32 bg-gray-200 rounded-lg"></div>
        </div>
        <div className="h-64 bg-gray-200 rounded-lg mt-6"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 text-red-700 rounded-lg">
        <h3 className="text-lg font-medium mb-2">Error Loading Report</h3>
        <p>{error}</p>
        <p className="mt-4 text-sm opacity-80">Check your connection and ensure you have the correct permissions.</p>
      </div>
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
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6 shadow-sm">
            <div className="text-indigo-600 text-sm font-medium mb-1">Blocked Attempts</div>
            <div className="text-3xl font-bold text-indigo-900">{report.impact.blockedAttempts}</div>
          </div>
          <div className="bg-orange-50 border border-orange-100 rounded-xl p-6 shadow-sm">
            <div className="text-orange-600 text-sm font-medium mb-1">Profile Fixes Needed</div>
            <div className="text-3xl font-bold text-orange-900">{report.impact.usersNeedingProfileFixes}</div>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-6 shadow-sm">
            <div className="text-emerald-600 text-sm font-medium mb-1">Fully Verified Users</div>
            <div className="text-3xl font-bold text-emerald-900">{report.impact.fullyVerifiedUsers}</div>
          </div>
        </div>
      </section>

      {/* Grid for User and Session Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* 2. User Statistics */}
        <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">User Statistics</h3>
          <ul className="space-y-3">
            <li className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Total Users</span>
              <span className="font-semibold">{report.users.total}</span>
            </li>
            <li className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Verified Users</span>
              <span className="font-semibold text-emerald-600">{report.users.verified}</span>
            </li>
            <li className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Blocked Users</span>
              <span className="font-semibold text-red-600">{report.users.blocked}</span>
            </li>
            <li className="flex justify-between items-center py-2">
              <span className="text-gray-600">Pending Users</span>
              <span className="font-semibold text-yellow-600">{report.users.pending}</span>
            </li>
          </ul>
        </section>

        {/* 4. Login Session Statistics */}
        <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Login Sessions</h3>
          <ul className="space-y-3">
            <li className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Total Sessions</span>
              <span className="font-semibold">{report.sessions.total}</span>
            </li>
            <li className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Successful</span>
              <span className="font-semibold text-emerald-600">{report.sessions.successful}</span>
            </li>
            <li className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Failed / Blocked</span>
              <span className="font-semibold text-red-600">{report.sessions.failed} / {report.sessions.blocked}</span>
            </li>
            <li className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Expired</span>
              <span className="font-semibold">{report.sessions.expired}</span>
            </li>
            <li className="flex justify-between items-center py-2">
              <span className="text-gray-600">Pending Review</span>
              <span className="font-semibold text-yellow-600">{report.sessions.pending}</span>
            </li>
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
