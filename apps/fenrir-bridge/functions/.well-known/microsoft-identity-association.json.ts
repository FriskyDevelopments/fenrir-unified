const microsoftIdentityAssociation = {
  associatedApplications: [
    {
      applicationId: "bd7f4392-853c-4c41-89e7-443691424188"
    }
  ]
};

export function onRequestGet() {
  return Response.json(microsoftIdentityAssociation, {
    headers: {
      "Cache-Control": "public, max-age=300"
    }
  });
}
