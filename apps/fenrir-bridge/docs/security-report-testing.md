# Community Security Report - Manual Testing Guide

## Overview
This document provides manual testing steps for the Fenrir Community Security Report v1 feature.

## Prerequisites
- Access to a Fenrir community with admin/staff permissions
- Valid authentication session (Firebase or Fenrir community session)
- Community Gate configured with NEON_DATABASE_URL
- Community data in the database (users, sessions, etc.)

## API Endpoint Testing

### Test Security Report API
```bash
# Replace with your actual auth token and community slug
curl -X GET "https://myfenrir.com/api/community-gate/admin/security-report?communitySlug=fenrir" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json"
```

### Expected Response Structure
```json
{
  "ok": true,
  "data": {
    "community": {
      "id": "uuid",
      "slug": "fenrir",
      "name": "Fenrir Protocol"
    },
    "users": {
      "total": 100,
      "verified": 85,
      "blocked": 10,
      "pending": 5,
      "missingDisplayName": 3
    },
    "sessions": {
      "total": 500,
      "successful": 400,
      "failed": 50,
      "blocked": 30,
      "expired": 15,
      "pending": 5
    },
    "impact": {
      "blockedAttempts": 80,
      "usersNeedingProfileFixes": 3,
      "fullyVerifiedUsers": 85
    },
    "generatedAt": "2026-06-02T00:00:00.000Z"
  }
}
```

### Test Cases
1. **Valid Community Slug**
   - Request with valid community slug should return 200 OK
   - Response should contain all expected fields
   - Numbers should be non-negative integers

2. **Invalid Community Slug**
   - Request with non-existent community should return 404
   - Error message should indicate community not found

3. **Missing Authentication**
   - Request without auth token should return 401/403
   - Error message should indicate authentication required

4. **Non-Admin User**
   - Request from non-admin user should return 403
   - Error message should indicate insufficient permissions

## Frontend Component Testing

### Test Component Rendering
1. Navigate to the page where `CommunitySecurityReport` is mounted
2. Verify the component renders without errors
3. Check that all sections are displayed:
   - Community Security Report header
   - Fenrir Impact Summary
   - User Statistics
   - Profile Quality
   - Login Session Statistics
   - Security Summary

### Test Loading State
1. Open browser DevTools Network tab
2. Throttle network speed to "Slow 3G"
3. Refresh the page
4. Verify loading skeleton is displayed
5. Verify data loads after request completes

### Test Error State
1. Block the API endpoint using DevTools
2. Refresh the page
3. Verify error message is displayed
4. Verify error message is user-friendly

### Test Empty State
1. Use a community with no data
2. Verify empty state message is displayed
3. Verify message instructs user to select a community

### Test Responsive Design
1. Test on mobile viewport (375px width)
2. Verify grid layouts collapse to single column
3. Verify text remains readable
4. Test on tablet viewport (768px width)
5. Verify grid layouts adjust appropriately
6. Test on desktop viewport (1024px+ width)
7. Verify full multi-column layout is displayed

### Test Data Accuracy
1. Compare API response numbers with database queries
2. Verify total users match `SELECT COUNT(*) FROM community_memberships WHERE community_id = ?`
3. Verify verified users match those with status='active'
4. Verify session counts match verification_sessions table
5. Verify impact calculations are correct

## Database Verification Queries

```sql
-- Get community ID
SELECT id, name, slug FROM communities WHERE slug = 'fenrir';

-- Verify user counts
SELECT
  COUNT(*) as total_users,
  SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_users,
  SUM(CASE WHEN status = 'denied' THEN 1 ELSE 0 END) as denied_users,
  SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_users
FROM community_memberships
WHERE community_id = 'community-uuid';

-- Verify missing display names
SELECT
  COUNT(*) as total_members,
  SUM(CASE WHEN p.display_name IS NULL OR p.display_name = '' THEN 1 ELSE 0 END) as missing_display_name
FROM community_memberships cm
JOIN profiles p ON p.id = cm.profile_id
WHERE cm.community_id = 'community-uuid' AND cm.status = 'active';

-- Verify session counts
SELECT
  COUNT(*) as total_sessions,
  SUM(CASE WHEN status = 'granted' THEN 1 ELSE 0 END) as granted_sessions,
  SUM(CASE WHEN status = 'denied' THEN 1 ELSE 0 END) as denied_sessions,
  SUM(CASE WHEN status = 'flagged' THEN 1 ELSE 0 END) as flagged_sessions,
  SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired_sessions,
  SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_sessions
FROM verification_sessions
WHERE community_id = 'community-uuid';
```

## Integration Testing Checklist
- [ ] API endpoint returns correct data for valid community
- [ ] API endpoint handles invalid community slug appropriately
- [ ] API endpoint enforces authentication
- [ ] API endpoint enforces admin/staff authorization
- [ ] Frontend component renders without errors
- [ ] Loading state displays correctly
- [ ] Error state displays correctly
- [ ] Empty state displays correctly
- [ ] Responsive design works on mobile, tablet, and desktop
- [ ] Data accuracy verified against database
- [ ] Impact summary calculations are correct
- [ ] All statistics are non-negative
- [ ] Timestamps are correctly formatted

## Performance Testing
- [ ] API response time < 500ms for typical community
- [ ] Frontend renders within 100ms after data load
- [ ] No memory leaks on component unmount
- [ ] Efficient database queries (use EXPLAIN ANALYZE)

## Security Testing
- [ ] SQL injection attempts are blocked
- [ ] Authorization bypass attempts are blocked
- [ ] Community slug parameter is properly sanitized
- [ ] No sensitive data leaked in error messages
- [ ] Rate limiting applies if implemented