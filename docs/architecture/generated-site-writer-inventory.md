# Generated-site writer inventory

This is the source-checkpoint inventory for OBX-029. “Generated-site state” means
the live `site/**` tree, the unserved `candidate/**` transaction, candidate/live
gate and provenance records, and the mutation histories or approved source files
that must roll back with a rejected edit. Research, uploads, evidence drafting,
run-state persistence, and coordination locks are outside this inventory because
they cannot change the generated projection.

The machine-readable block is verified by
`scripts/eval/generated-site-writer-inventory.node.mjs`. That verifier discovers
filesystem mutations independently from the TypeScript AST. Test and fixture files
are recognized structurally by their filename suffix and are the only automatic
`test-only` authority; no production module receives that classification.

An `unclassified-write-around` row is recorded so the inventory stays complete,
but it fails verification and is not an allowed production authority.

```json inventory
{
  "schemaVersion": 1,
  "permittedAuthorities": [
    "candidate-compiler",
    "guarded-mutation",
    "promotion-recovery",
    "test-only"
  ],
  "writers": [
    {
      "id": "element-and-placement-edits",
      "endpoints": [
        "POST /api/edit",
        "POST /api/elements",
        "POST /api/assets/[id] action=place"
      ],
      "modules": [
        "src/app/api/edit/route.ts",
        "src/app/api/elements/route.ts",
        "src/app/api/assets/[id]/route.ts",
        "src/lib/elementEditor.ts",
        "src/lib/imageLibrary.ts#placeLibraryImage",
        "src/lib/siteMutation.ts#runGuardedMutation"
      ],
      "filesWritten": [
        "site/index.html",
        "site/assets/edit-*.jpg",
        "element-history.json",
        "gates.json"
      ],
      "authority": "guarded-mutation",
      "snapshotSet": [
        "site/index.html",
        "site/assets/edit-*.jpg when generated",
        "element-history.json",
        "gates.json"
      ],
      "owningTests": [
        "src/lib/elementEditor.test.ts",
        "src/app/api/edit/route.test.ts",
        "src/app/api/elements/route.test.ts",
        "src/lib/imageLibrary.test.ts#places a completed library image through guarded site mutation"
      ],
      "scannerKeys": [
        "guarded:src/lib/elementEditor.ts#applyElementHtmlEdit",
        "guarded:src/lib/elementEditor.ts#moveElementHistory",
        "live:src/app/api/edit/route.ts#POST"
      ],
      "status": "compliant"
    },
    {
      "id": "token-edits",
      "endpoints": ["POST /api/tokens action=apply|revert"],
      "modules": [
        "src/app/api/tokens/route.ts",
        "src/lib/siteTokens.ts",
        "src/lib/siteMutation.ts#runGuardedMutation"
      ],
      "filesWritten": [
        "site/tokens.css",
        "tokens.json when present",
        "token-history.json",
        "gates.json"
      ],
      "authority": "guarded-mutation",
      "snapshotSet": [
        "site/tokens.css",
        "tokens.json",
        "token-history.json",
        "gates.json"
      ],
      "owningTests": [
        "src/lib/siteTokens.test.ts",
        "src/app/api/tokens/route.test.ts"
      ],
      "scannerKeys": [
        "guarded:src/lib/siteTokens.ts#applyTokenEdit",
        "guarded:src/lib/siteTokens.ts#revertTokenEdit"
      ],
      "status": "compliant"
    },
    {
      "id": "motion-edits",
      "endpoints": ["POST /api/motion action=apply|remove|revert"],
      "modules": [
        "src/app/api/motion/route.ts",
        "src/lib/siteMotion.ts",
        "src/lib/siteMutation.ts#runGuardedMutation"
      ],
      "filesWritten": [
        "site/motion.json",
        "site/motion-manifest.js",
        "motion-history.json",
        "gates.json"
      ],
      "authority": "guarded-mutation",
      "snapshotSet": [
        "site/motion.json",
        "site/motion-manifest.js",
        "motion-history.json",
        "gates.json"
      ],
      "owningTests": [
        "src/lib/siteMotion.test.ts",
        "src/app/api/motion/route.test.ts"
      ],
      "scannerKeys": [
        "guarded:src/lib/siteMotion.ts#mutateSiteMotion",
        "guarded:src/lib/siteMotion.ts#revertSiteMotion"
      ],
      "status": "compliant"
    },
    {
      "id": "image-generation-finalization",
      "endpoints": [
        "POST /api/assets/[id] action=generate|regenerate"
      ],
      "modules": [
        "src/app/api/assets/[id]/route.ts",
        "src/lib/imageLibrary.ts#generateProjectImage",
        "src/lib/imageLibrary.ts#executeClaimedGeneration",
        "src/lib/imageLibrary.ts#recoverClaimedOrphan",
        "src/lib/imageLibrary.ts#finalizeStagedGeneration",
        "src/lib/siteMutation.ts#runGuardedMutation",
        "src/lib/siteMutation.ts#atomicWriteGeneratedSiteFile"
      ],
      "filesWritten": [
        "site/assets/generated/<requestId>.<ext>",
        "image-library.json",
        "gates.json",
        "image-generation-ledger.json",
        "image-staging/**",
        "image-generation-claims/**"
      ],
      "authority": "guarded-mutation",
      "snapshotSet": [
        "site/assets/generated/<requestId>.<ext>",
        "image-library.json",
        "gates.json"
      ],
      "nonRollbackState": [
        "image-generation-ledger.json is the paid-cost journal finalized before publication",
        "image-staging/<requestId>.download is retained until guarded publication commits",
        "image-generation-claims/** is coordination-only and released after the attempt"
      ],
      "owningTests": [
        "src/lib/imageLibrary.test.ts#rolls back rejected publication and retries completed staging without another provider call",
        "src/lib/imageLibrary.test.ts#never promotes valid or partial staging from the image-library read path",
        "src/lib/siteMutation.test.ts#generated-site mutation write authority",
        "src/app/api/assets/[id]/route.test.ts"
      ],
      "scannerKeys": [
        "guarded:src/lib/imageLibrary.ts#finalizeStagedGeneration",
        "live:src/lib/imageLibrary.ts#finalizeStagedGeneration"
      ],
      "status": "compliant"
    },
    {
      "id": "template-candidate-compilation-and-repair",
      "endpoints": ["POST /api/run internal template-v1 build and one repair"],
      "modules": [
        "src/app/api/run/route.ts",
        "src/lib/pipeline.ts",
        "src/lib/builder.ts"
      ],
      "filesWritten": [
        "candidate/site/**",
        "candidate/manifest.json",
        "candidate/provenance.json",
        "candidate/gates.json",
        "candidate.{building,repairing,repair-backup,retired}-*/**"
      ],
      "authority": "candidate-compiler",
      "snapshotSet": [
        "unserved candidate transaction; prior candidate is retired and restored atomically"
      ],
      "owningTests": [
        "src/lib/builder.test.ts",
        "src/lib/builderAuthority.test.ts"
      ],
      "scannerKeys": ["candidate-module:src/lib/builder.ts"],
      "status": "compliant"
    },
    {
      "id": "page-ir-candidate-compilation",
      "endpoints": ["POST /api/run internal page-ir-v1 materialization"],
      "modules": [
        "src/lib/pageIrController.ts",
        "src/lib/pageIrPipeline.ts"
      ],
      "filesWritten": [
        "candidate/site/**",
        "candidate/manifest.json",
        "candidate/provenance.json",
        "candidate.{building,retired}-*/**"
      ],
      "authority": "candidate-compiler",
      "snapshotSet": [
        "unserved candidate transaction; prior replaceable candidate is restored atomically"
      ],
      "owningTests": [
        "src/lib/pageIrPipeline.test.ts#Page IR candidate materialization",
        "src/lib/pageIrController.test.ts"
      ],
      "scannerKeys": ["candidate-module:src/lib/pageIrPipeline.ts"],
      "status": "compliant"
    },
    {
      "id": "candidate-gate-receipts",
      "endpoints": ["POST /api/run internal candidate gate execution"],
      "modules": [
        "src/lib/gates.ts",
        "src/lib/builder.ts#gateBuiltCandidate"
      ],
      "filesWritten": [
        "candidate/gates.json",
        "candidate/provenance.json",
        "gates.json compatibility copy"
      ],
      "authority": "candidate-compiler",
      "snapshotSet": [
        "candidate receipt/provenance prior bytes; candidate site inventory revalidated before commit"
      ],
      "owningTests": [
        "src/lib/gates.candidate.test.ts",
        "src/lib/gates.candidate.integration.test.ts",
        "src/lib/builder.test.ts"
      ],
      "scannerKeys": ["candidate-module:src/lib/gates.ts"],
      "status": "compliant"
    },
    {
      "id": "candidate-promotion-and-recovery",
      "endpoints": [
        "POST /api/run internal promotion",
        "POST /api/run reconnect recovery"
      ],
      "modules": [
        "src/lib/candidate.ts",
        "src/lib/pipeline.ts",
        "src/lib/pageIrController.ts"
      ],
      "filesWritten": [
        "site/**",
        "site/.one-box/{candidate-manifest.json,provenance.json,gates.json,live-receipt.json}",
        "candidate/provenance.json",
        "gates.json compatibility copy",
        ".site-promotion-{stage,retired,demoted}-*/**",
        "candidate.recovery.json"
      ],
      "authority": "promotion-recovery",
      "snapshotSet": [
        "exact promotable candidate manifest/provenance/receipt bytes",
        "prior live site retired directory",
        "prior candidate provenance bytes",
        "prior visual-QA approval state"
      ],
      "owningTests": [
        "src/lib/candidatePromotion.test.ts",
        "src/lib/candidateRecovery.test.ts",
        "src/lib/siteMutation.test.ts#does not interleave promotion and guarded mutation"
      ],
      "scannerKeys": [
        "candidate-module:src/lib/candidate.ts",
        "live:src/lib/candidate.ts#promoteCandidate",
        "live:src/lib/candidate.ts#restorePromotionFootprint"
      ],
      "status": "compliant"
    }
  ]
}
```

## Current disposition

Image generation and orphan recovery stage provider bytes outside the live tree,
then publish them only through `atomicWriteGeneratedSiteFile` inside
`runGuardedMutation`. The verifier treats that primitive as a live writer regardless
of how its path argument is aliased and separately proves that its callsite remains
inside the guarded mutation callback. Moving publication outside that callback makes
the authority test fail even if the same function still calls `runGuardedMutation`.

The edit route supplies its generated-image publication as the transform callback to
`applyElementHtmlEdit`. The verifier derives this higher-order boundary from source:
the wrapper's callback parameter must have value uses, and every use must be a direct
invocation inside `runGuardedMutation`. Moving the route write outside that callback,
or moving any wrapper invocation outside the guard, makes the authority test fail.
