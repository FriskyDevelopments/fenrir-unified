# Fenrir Temporal Go / No-Go Workflow

## Purpose

`FenrirGoNoGoWorkflow` is the durable release gate for the Google Cloud Run deploy path.

It turns a proposed Fenrir Bridge release into a concrete launch verdict:

```text
GO    -> promote or leave the new revision live
NO-GO -> hold traffic, roll back if needed, and notify the operator
```

It does not run shell commands inside workflow code. The workflow only decides sequence, timers, retries, cancellation, evidence collection, verdict state, and rollback state. All side effects live in activities.

## Task Queue

```text
fenrir-release-gate
```

## Workflow Shape

```text
FenrirGoNoGoWorkflow
  -> validateDeployRequest
  -> runTypecheck
  -> runBuild
  -> buildCloudRunImage
  -> deployCloudRunRevision
  -> verifyServiceUrl
  -> verifyAuthRouting
  -> evaluateGoNoGo
  -> promoteRevision
```

Failure path:

```text
NO-GO verdict
  -> rollbackTraffic
  -> notifyOperator
  -> keep workflow visible for audit
```

## Activities

| Activity                 | Side effect                                                     | Retry policy                                     |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------------------ |
| `validateDeployRequest`  | Reads repo/env metadata                                         | Short retry                                      |
| `runTypecheck`           | Runs `npm run typecheck`                                        | Retry only for transient machine failure         |
| `runBuild`               | Runs `npm run build`                                            | Retry only for transient machine failure         |
| `buildCloudRunImage`     | Calls Google Cloud Build through `gcloud run deploy --source`   | Retry with backoff                               |
| `deployCloudRunRevision` | Creates the Cloud Run revision                                  | Retry with backoff                               |
| `verifyServiceUrl`       | Probes service root and readiness endpoints                     | Retry with backoff                               |
| `verifyAuthRouting`      | Ensures auth does not resolve to localhost `/auth/v1/authorize` | Retry with backoff                               |
| `evaluateGoNoGo`         | Converts evidence into a GO or NO-GO verdict                    | No retry unless deterministic input is unchanged |
| `promoteRevision`        | Leaves 100 percent traffic on the ready revision                | No retry unless idempotent                       |
| `rollbackTraffic`        | Moves traffic back to the previous known-good revision          | Retry with backoff                               |
| `notifyOperator`         | Sends the deploy result to the operator channel                 | Retry with cap                                   |

## GO Criteria

```text
npm run typecheck passes
npm run build passes
Cloud Build succeeds
Cloud Run revision reaches Ready
service root returns 200
auth does not route to localhost /auth/v1/authorize
configured Supabase auth base is not localhost
required public VITE_* inputs are present
```

If any critical item fails, the verdict is `NO-GO`.

## Signals

```text
cancelDeploy
rollbackNow
approvePromotion
overrideNoGo
```

## Queries

```text
currentStage
latestRevision
serviceUrl
lastVerificationResult
goNoGoVerdict
```

## Determinism Rules

- Workflow code does not call `gcloud`, `fetch`, `Date.now`, filesystem APIs, or shell commands directly.
- Activity results are recorded in Temporal history and replayed.
- Version the workflow before changing step order for in-flight deploys.
- Keep rollback idempotent: applying the same rollback twice must not hurt the service.

## Remotion Diagram

The matching visual composition lives in:

```text
/Users/friskypup/Documents/Playground/frisky-spark-lab/apps/fenrir-cinema
```

Composition ID:

```text
FenrirDeployTemporalFlow
```
