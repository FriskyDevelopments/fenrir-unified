# Security Report Testing Guide

This document provides a comprehensive guide for manually testing the Fenrir Community Security Report feature, since no automated test framework is currently configured for this project.

## 1. API Endpoint Testing

### 1.1 Local Setup

1. Start the local development server:
   ```bash
   npm run mcp:beta:dev
   ```
2. Ensure you have a valid local session (e.g., mock auth or authenticated via WorkOS).

### 1.2 Endpoint Verification

Make a `GET` request to `/api/community-gate/admin/security-report?communitySlug=fenrir`.

**Expected Success Response:**

```json
{
  "ok": true,
  "data": {
    "community": { ... },
    "users": { ... },
    "sessions": { ... },
    "impact": { ... },
    "generatedAt": "..."
  }
}
```

**Expected Error Responses:**

- `401 Unauthorized`: When no session cookie is present.
- `400 Bad Request`: When `communitySlug` parameter is missing.

## 2. Frontend Component Testing

### 2.1 State Management

Render `<CommunitySecurityReport />` with different props to verify state changes:

1. **Empty State**:
   - Render without `communitySlug`.
   - Verify that the "No Community Selected" message appears.
2. **Loading State**:
   - Verify the skeleton loader displays while the API request is in flight.
3. **Error State**:
   - Disconnect your internet or force the API to return an error.
   - Verify the error message component displays correctly with troubleshooting steps.
4. **Success State**:
   - Verify all 5 sections display with the correct color coding and layout.

### 2.2 Responsive Layout Verification

Test the component on various viewport sizes:

- **Mobile (320px - 640px)**: Ensure grids stack into a single column.
- **Tablet (641px - 1024px)**: Ensure 2-column or wrapping grids look natural.
- **Desktop (1025px+)**: Ensure full grid layouts display properly (e.g., 3 columns for impact stats).

## 3. Database Verification

If you are connecting to a live or staging Neon database, run the following queries manually in your SQL client to verify the report metrics match the raw data:

### Total Users

```sql
SELECT COUNT(*) FROM users WHERE community_id = 'your-community-id';
```

### Session Stats

```sql
SELECT status, COUNT(*)
FROM user_sessions
WHERE community_id = 'your-community-id'
GROUP BY status;
```

### Profile Issues

```sql
SELECT COUNT(*)
FROM user_profiles
WHERE community_id = 'your-community-id'
AND (display_name IS NULL OR display_name = '');
```

_Note: If the `NEON_DATABASE_URL` is missing locally, the API will return a mocked response for safe UI testing. Check your console logs for the fallback warning._
