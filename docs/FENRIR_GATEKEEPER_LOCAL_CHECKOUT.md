# Fenrir Gatekeeper local checkout

The Gatekeeper Worker is maintained in a separate Git repository. Do not commit
an absolute symlink to it from this monorepo.

For local development, clone the worker repository wherever appropriate and, if
you want the convenience path used by this workspace, create an untracked local
link at `apps/fenrir-gatekeeper-worker`. For example, from the monorepo root:

```sh
ln -s ../../fenrir-gatekeeper/worker apps/fenrir-gatekeeper-worker
```

The relative target assumes the two repositories are sibling checkouts. The path
is ignored by this repository, so each developer can choose a different layout.
Deployment and route configuration remain owned by the Gatekeeper repository.
