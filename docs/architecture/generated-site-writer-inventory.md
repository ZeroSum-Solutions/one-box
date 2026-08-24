# Generated-site writer inventory

This is the source-checkpoint inventory for OBX-029. “Generated-site state” means
the live `site/**` tree, the unserved `candidate/**` transaction, candidate/live
gate and provenance records, and the mutation histories or approved source files
that must roll back with a rejected edit. Research, uploads, evidence drafting,
run-state persistence, and coordination locks are outside this inventory because
they cannot change the generated projection.

The machine-readable block is verified by
`scripts/eval/generated-site-writer-inventory.node.mjs`. That verifier discovers
filesystem mutations independently from the TypeScript AST. Every scanner key names
one operation endpoint, enclosing function, target class, and same-kind occurrence;
rename source removal and destination creation are inventoried separately. Importing a
candidate helper no longer grants authority to the rest of its module. The verifier
resolves local path aliases, imported sink aliases, file-handle writes, helper-mediated
writes, and higher-order guarded callbacks. Test and fixture files are recognized
structurally by their filename suffix and are the only automatic `test-only` authority;
no production module receives that classification. Guarded classification additionally
requires the target path to be associated with the guard's run/root binding. Helper
calls propagate their concrete target expression through parameterized callsites;
being called only under some authority callback is not sufficient. Root families must
match exactly or use a normalized descendant boundary; overlapping identifier text is
not authority. `atomicWriteGeneratedSiteFile` additionally requires its run argument to
match the enclosing authority. Its target must also resolve through every visible
assignment and parameterized callsite to a validated image producer whose implementation
derives `finalPath` from that same run root. Module, function, and identifier names never
grant path authority by themselves. Canonical root/path helpers must resolve to their
exact, unshadowed imports at the use site; local root helpers must match the complete
safe path-construction shape. Every later `path.join`/`path.resolve` argument must be a
static safe relative value or trace to a bounded producer; an unknown dynamic segment
fails closed. Dynamic conditionals preserve every branch, explicit parent traversal is
rejected, and visible direct or object-API mutation of a `finalPath` carrier fails
closed. A later spread, computed property, or duplicate property that could replace a
traced carrier property also invalidates its provenance. Authority options use the
same last-write rule: a later spread, computed property, or duplicate `runId` or
`runRoot` invalidates the binding. An explicit `withSiteAuthorityLock` options object
whose `runRoot` is replaceable cannot fall back to canonical-run authority, including
through the default gate-runner call flow. Each
discovered operation resolves to one artifact declared as rollback, intentional
non-rollback, or atomic transaction state.

An `unclassified-write-around` row is recorded so the inventory stays complete,
but it fails verification and is not an allowed production authority.

```json inventory
{
  "schemaVersion": 2,
  "permittedAuthorities": [
    "candidate-compiler",
    "guarded-mutation",
    "page-ir-edit-transaction",
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
        "element-history.json",
        "gates.json"
      ],
      "authority": "guarded-mutation",
      "snapshotSet": [
        "site/index.html",
        "element-history.json",
        "gates.json"
      ],
      "rollbackArtifacts": ["site/index.html", "element-history.json", "gates.json"],
      "nonRollbackArtifacts": [],
      "transactionArtifacts": [],
      "owningTests": [
        "src/lib/elementEditor.test.ts",
        "src/app/api/edit/route.test.ts",
        "src/app/api/elements/route.test.ts",
        "src/lib/imageLibrary.test.ts#places a completed library image through guarded site mutation"
      ],
      "scannerKeys": [
        "write:src/lib/elementEditor.ts#applyElementHtmlEdit:atomicWrite:live:1",
        "write:src/lib/elementEditor.ts#applyElementHtmlEdit:atomicWrite:live:2",
        "write:src/lib/elementEditor.ts#moveElementHistory:atomicWrite:live:1",
        "write:src/lib/elementEditor.ts#moveElementHistory:atomicWrite:live:2"
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
      "rollbackArtifacts": ["site/tokens.css", "tokens.json", "token-history.json", "gates.json"],
      "nonRollbackArtifacts": [],
      "transactionArtifacts": [],
      "owningTests": [
        "src/lib/siteTokens.test.ts",
        "src/app/api/tokens/route.test.ts"
      ],
      "scannerKeys": [
        "write:src/lib/siteTokens.ts#applyTokenEdit:atomicWrite:live:1",
        "write:src/lib/siteTokens.ts#applyTokenEdit:updateSourceTokens:live:1",
        "write:src/lib/siteTokens.ts#applyTokenEdit:atomicWrite:live:2",
        "write:src/lib/siteTokens.ts#revertTokenEdit:atomicWrite:live:1",
        "write:src/lib/siteTokens.ts#revertTokenEdit:updateSourceTokens:live:1",
        "write:src/lib/siteTokens.ts#revertTokenEdit:atomicWrite:live:2"
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
      "rollbackArtifacts": ["site/motion.json", "site/motion-manifest.js", "motion-history.json", "gates.json"],
      "nonRollbackArtifacts": [],
      "transactionArtifacts": [],
      "owningTests": [
        "src/lib/siteMotion.test.ts",
        "src/app/api/motion/route.test.ts"
      ],
      "scannerKeys": [
        "write:src/lib/siteMotion.ts#mutateSiteMotion:atomicWrite:live:1",
        "write:src/lib/siteMotion.ts#mutateSiteMotion:atomicWrite:live:2",
        "write:src/lib/siteMotion.ts#mutateSiteMotion:atomicWrite:live:3",
        "write:src/lib/siteMotion.ts#revertSiteMotion:atomicWrite:live:1",
        "write:src/lib/siteMotion.ts#revertSiteMotion:atomicWrite:live:2",
        "write:src/lib/siteMotion.ts#revertSiteMotion:atomicWrite:live:3"
      ],
      "status": "compliant"
    },
    {
      "id": "inline-image-edits",
      "endpoints": ["POST /api/edit with image generation or replay"],
      "modules": [
        "src/app/api/edit/route.ts",
        "src/lib/elementEditor.ts#applyElementHtmlEdit",
        "src/lib/imageGenerationBudget.ts",
        "src/lib/siteMutation.ts#runGuardedMutation",
        "src/lib/siteMutation.ts#atomicWriteGeneratedSiteFile"
      ],
      "filesWritten": [
        "site/assets/generated/<requestId>.<ext>",
        "site/index.html",
        "element-history.json",
        "gates.json",
        "image-generation-ledger.json",
        "image-staging/<requestId>.download"
      ],
      "authority": "guarded-mutation",
      "snapshotSet": [
        "site/assets/generated/<requestId>.<ext> when generated",
        "site/index.html",
        "element-history.json",
        "gates.json"
      ],
      "nonRollbackState": [
        "image-generation-ledger.json is the paid-cost and idempotency journal updated under site authority",
        "image-staging/<requestId>.download is provider staging outside the live site and is removed after commit or terminal failure"
      ],
      "rollbackArtifacts": ["site/assets/generated/**", "site/index.html", "element-history.json", "gates.json"],
      "nonRollbackArtifacts": ["image-generation-ledger.json", "image-staging/**"],
      "transactionArtifacts": [],
      "owningTests": [
        "src/app/api/edit/route.image.integration.test.ts",
        "src/app/api/edit/route.test.ts",
        "src/lib/siteMutation.test.ts#generated-site mutation write authority"
      ],
      "scannerKeys": [
        "write:src/app/api/edit/route.ts#POST:reserveImageGeneration:live:1",
        "write:src/app/api/edit/route.ts#POST:finishInlineImageGeneration:live:1",
        "write:src/app/api/edit/route.ts#POST:finishInlineImageGeneration:live:2",
        "write:src/app/api/edit/route.ts#POST:finishImageGeneration:live:1",
        "write:src/app/api/edit/route.ts#POST:finishImageGeneration:live:2",
        "write:src/app/api/edit/route.ts#POST:atomicWriteGeneratedSiteFile:live:1"
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
        "src/lib/imageGenerationBudget.ts",
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
      "rollbackArtifacts": ["site/assets/generated/**", "image-library.json", "gates.json"],
      "nonRollbackArtifacts": ["image-generation-ledger.json", "image-staging/**", "image-generation-claims/**"],
      "transactionArtifacts": [],
      "owningTests": [
        "src/lib/imageLibrary.test.ts#rolls back rejected publication and retries completed staging without another provider call",
        "src/lib/imageLibrary.test.ts#never promotes valid or partial staging from the image-library read path",
        "src/lib/siteMutation.test.ts#generated-site mutation write authority",
        "src/app/api/assets/[id]/route.test.ts"
      ],
      "scannerKeys": [
        "write:src/lib/imageLibrary.ts#finishPaidGeneration:finishImageGeneration:live:1",
        "write:src/lib/imageLibrary.ts#finalizeStagedGeneration:atomicWriteGeneratedSiteFile:live:1",
        "write:src/lib/imageLibrary.ts#finalizeStagedGeneration:writeCatalog:live:1",
        "write:src/lib/imageLibrary.ts#recoverClaimedOrphan:writeCatalog:live:1",
        "write:src/lib/imageLibrary.ts#recoverClaimedOrphan:finishImageGeneration:live:1",
        "write:src/lib/imageLibrary.ts#executeClaimedGeneration:reserveImageGeneration:live:1",
        "write:src/lib/imageLibrary.ts#executeClaimedGeneration:writeCatalog:live:1",
        "write:src/lib/imageLibrary.ts#failGeneration:writeCatalog:live:1",
        "write:src/lib/imageLibrary.ts#failGeneration:finishImageGeneration:live:1"
      ],
      "status": "compliant"
    },
    {
      "id": "image-library-reconciliation",
      "endpoints": [
        "GET /api/assets/[id] via listProjectImages",
        "POST /api/assets/[id] preflight via listProjectImages",
        "POST /api/edit reference-image preflight via listProjectImages"
      ],
      "modules": [
        "src/lib/imageLibrary.ts#listProjectImages",
        "src/lib/imageLibrary.ts#synchronizeUnlocked",
        "src/lib/imageGenerationBudget.ts#finishImageGeneration",
        "src/lib/runstate.ts#invalidateApprovedVisualQaUnderSiteAuthority"
      ],
      "filesWritten": [
        "image-library.json",
        "image-generation-ledger.json",
        "approved visual-QA state when a recovered generated image lacks invalidation provenance"
      ],
      "authority": "guarded-mutation",
      "snapshotSet": [
        "none: reconciliation is an idempotent site-authority repair transaction, not a rejectable editor mutation"
      ],
      "nonRollbackState": [
        "image-library.json is rewritten to the reconciled catalog under site authority",
        "image-generation-ledger.json terminalizes stale or recovered paid requests under the same authority",
        "visual-QA approval invalidation is monotonic and is not rolled back"
      ],
      "rollbackArtifacts": [],
      "nonRollbackArtifacts": ["image-library.json", "image-generation-ledger.json", "approved visual-QA state"],
      "transactionArtifacts": [],
      "owningTests": [
        "src/lib/imageLibrary.test.ts#never promotes valid or partial staging from the image-library read path",
        "src/lib/imageLibrary.test.ts"
      ],
      "scannerKeys": [
        "write:src/lib/imageLibrary.ts#synchronizeUnlocked:finishImageGeneration:live:1",
        "write:src/lib/imageLibrary.ts#synchronizeUnlocked:finishImageGeneration:live:2",
        "write:src/lib/imageLibrary.ts#synchronizeUnlocked:finishImageGeneration:live:3",
        "write:src/lib/imageLibrary.ts#synchronizeUnlocked:finishImageGeneration:live:4",
        "write:src/lib/imageLibrary.ts#synchronizeUnlocked:writeCatalog:live:1"
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
      "rollbackArtifacts": [],
      "nonRollbackArtifacts": [],
      "transactionArtifacts": ["candidate/**"],
      "owningTests": [
        "src/lib/builder.test.ts",
        "src/lib/builderAuthority.test.ts"
      ],
      "scannerKeys": [
        "write:src/lib/builder.ts#buildSiteUnderAuthority:rm:candidate:1",
        "write:src/lib/builder.ts#buildSiteUnderAuthority:compileSiteToDirectory:candidate:1",
        "write:src/lib/builder.ts#buildSiteUnderAuthority:writeFile:candidate:1",
        "write:src/lib/builder.ts#buildSiteUnderAuthority:writeFile:candidate:2",
        "write:src/lib/builder.ts#buildSiteUnderAuthority:replaceDirectory:candidate:1",
        "write:src/lib/builder.ts#buildSiteUnderAuthority:rm:candidate:2",
        "write:src/lib/builder.ts#commitCandidateRepairUnderAuthority:rm:candidate:1",
        "write:src/lib/builder.ts#commitCandidateRepairUnderAuthority:stageCandidateRepairBundle:candidate:1",
        "write:src/lib/builder.ts#commitCandidateRepairUnderAuthority:commitCandidateRepairBundle:candidate:1",
        "write:src/lib/builder.ts#commitCandidateRepairUnderAuthority:rm:candidate:2",
        "write:src/lib/builder.ts#commitCandidateRepairUnderAuthority:rm:candidate:3"
      ],
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
      "rollbackArtifacts": [],
      "nonRollbackArtifacts": [],
      "transactionArtifacts": ["candidate/**"],
      "owningTests": [
        "src/lib/pageIrPipeline.test.ts#Page IR candidate materialization",
        "src/lib/pageIrController.test.ts"
      ],
      "scannerKeys": [
        "write:src/lib/pageIrPipeline.ts#materializePageIrCandidateUnderSiteAuthority:mkdir:candidate:1",
        "write:src/lib/pageIrPipeline.ts#materializePageIrCandidateUnderSiteAuthority:mkdir:candidate:2",
        "write:src/lib/pageIrPipeline.ts#materializePageIrCandidateUnderSiteAuthority:writeExclusive:candidate:1",
        "write:src/lib/pageIrPipeline.ts#materializePageIrCandidateUnderSiteAuthority:writeExclusive:candidate:2",
        "write:src/lib/pageIrPipeline.ts#materializePageIrCandidateUnderSiteAuthority:writeExclusive:candidate:3",
        "write:src/lib/pageIrPipeline.ts#materializePageIrCandidateUnderSiteAuthority:rm:candidate:1"
      ],
      "status": "compliant"
    },
    {
      "id": "page-ir-edit-transactions",
      "endpoints": ["POST /api/elements action=apply|undo|redo for page-ir-v1"],
      "modules": [
        "src/lib/pageIrMutation.ts",
        "src/lib/pageIrPipeline.ts",
        "src/lib/candidate.ts"
      ],
      "filesWritten": [
        "page-ir.json",
        "page-ir-edit-history.json",
        "uploads/page-ir-edit-assets/** when validated fallback recovery is required",
        "candidate/**",
        "candidate.retired-*/**",
        "site/** and gates.json through promotion-recovery authority"
      ],
      "authority": "page-ir-edit-transaction",
      "snapshotSet": [
        "persisted Page IR and edit-history exact bytes",
        "validated fallback asset prior bytes and directory presence",
        "prior canonical candidate exact directory",
        "canonical promoted live bundle and gate receipt"
      ],
      "rollbackArtifacts": [
        "page-ir.json",
        "page-ir-edit-history.json",
        "uploads/page-ir-edit-assets/**"
      ],
      "nonRollbackArtifacts": [],
      "transactionArtifacts": ["candidate/**"],
      "owningTests": [
        "src/lib/pageIrMutation.test.ts",
        "src/lib/pageIrPipeline.test.ts#persists a typed edit, rebuilds through a candidate, and promotes only the validated projection"
      ],
      "scannerKeys": [
        "write:src/lib/pageIrMutation.ts#executePageIrEditTransaction:rename-source-removal:candidate:1",
        "write:src/lib/pageIrMutation.ts#executePageIrEditTransaction:rename-destination-creation:candidate:1"
      ],
      "status": "compliant"
    },
    {
      "id": "page-ir-edit-recovery",
      "endpoints": ["startup/resume candidate recovery and Page IR edit failure rollback"],
      "modules": [
        "src/lib/candidate.ts#recoverPageIrEditTransactionUnderSiteAuthority"
      ],
      "filesWritten": [
        "page-ir.json",
        "page-ir-edit-history.json",
        "uploads/page-ir-edit-assets/**",
        "candidate/**",
        "candidate.retired-*/**",
        ".page-ir-edit-transaction/**"
      ],
      "authority": "promotion-recovery",
      "snapshotSet": [
        "hash-bound closed Page IR edit journal and exact before-byte snapshots",
        "prior promoted candidate provenance and recognized retired directory",
        "current canonical candidate and live promotion footprint"
      ],
      "rollbackArtifacts": [],
      "nonRollbackArtifacts": [],
      "transactionArtifacts": ["candidate/**"],
      "owningTests": [
        "src/lib/candidateRecovery.test.ts#rolls back the Page IR edit journal crash seam",
        "src/lib/candidateRecovery.test.ts#finalizes a committed promoted Page IR edit"
      ],
      "scannerKeys": [
        "write:src/lib/candidate.ts#recoverPageIrEditTransactionUnderSiteAuthority:rm:candidate:1",
        "write:src/lib/candidate.ts#recoverPageIrEditTransactionUnderSiteAuthority:rm:candidate:2",
        "write:src/lib/candidate.ts#recoverPageIrEditTransactionUnderSiteAuthority:rename-source-removal:candidate:1",
        "write:src/lib/candidate.ts#recoverPageIrEditTransactionUnderSiteAuthority:rename-destination-creation:candidate:1"
      ],
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
        "candidate/provenance.json"
      ],
      "authority": "candidate-compiler",
      "snapshotSet": [
        "candidate receipt/provenance prior bytes; candidate site inventory revalidated before commit"
      ],
      "rollbackArtifacts": [],
      "nonRollbackArtifacts": [],
      "transactionArtifacts": ["candidate/**"],
      "owningTests": [
        "src/lib/gates.candidate.test.ts",
        "src/lib/gates.candidate.integration.test.ts",
        "src/lib/builder.test.ts"
      ],
      "scannerKeys": [
        "write:src/lib/gates.ts#runCandidateGates:atomicWriteCandidateReceipt:candidate:1"
      ],
      "status": "compliant"
    },
    {
      "id": "live-gate-reports",
      "endpoints": [
        "guarded edits through runGuardedMutation after-edit gates",
        "POST /api/evidence/[id] action=record-human-visual-review"
      ],
      "modules": [
        "src/lib/gates.ts#runGates",
        "src/lib/siteMutation.ts#runGuardedMutation",
        "src/app/api/evidence/[id]/route.ts"
      ],
      "filesWritten": ["gates.json"],
      "authority": "guarded-mutation",
      "snapshotSet": [
        "guarded edits include gates.json in their mutation snapshot",
        "human visual review writes the current canonical report under site authority and has no rejectable mutation snapshot"
      ],
      "nonRollbackState": [
        "a successful human-review preflight replaces gates.json with the current full-suite report under site authority"
      ],
      "rollbackArtifacts": ["gates.json"],
      "nonRollbackArtifacts": ["gates.json"],
      "transactionArtifacts": ["gates.json temporary sibling"],
      "artifactDispositionContexts": [
        {
          "endpoint": "guarded edits through runGuardedMutation after-edit gates",
          "rollbackArtifacts": ["gates.json"],
          "nonRollbackArtifacts": [],
          "transactionArtifacts": ["gates.json temporary sibling"]
        },
        {
          "endpoint": "POST /api/evidence/[id] action=record-human-visual-review",
          "rollbackArtifacts": [],
          "nonRollbackArtifacts": ["gates.json"],
          "transactionArtifacts": ["gates.json temporary sibling"]
        }
      ],
      "owningTests": [
        "src/lib/siteMutation.test.ts",
        "src/lib/gates.candidate.test.ts",
        "src/app/api/evidence/[id]/route.test.ts"
      ],
      "scannerKeys": [
        "write:src/lib/gates.ts#writeGates:writeFile:live:1",
        "write:src/lib/gates.ts#writeGates:rename-source-removal:live:1",
        "write:src/lib/gates.ts#writeGates:rename-destination-creation:live:1"
      ],
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
        "candidate-recovery.json"
      ],
      "authority": "promotion-recovery",
      "snapshotSet": [
        "exact promotable candidate manifest/provenance/receipt bytes",
        "prior live site retired directory",
        "prior candidate provenance bytes",
        "prior visual-QA approval state"
      ],
      "rollbackArtifacts": [],
      "nonRollbackArtifacts": [],
      "transactionArtifacts": ["site/**", "candidate/**", ".site-promotion-*/**", "gates.json"],
      "owningTests": [
        "src/lib/candidatePromotion.test.ts",
        "src/lib/candidateRecovery.test.ts",
        "src/lib/siteMutation.test.ts#does not interleave promotion and guarded mutation"
      ],
      "scannerKeys": [
        "write:src/lib/candidate.ts#restorePromotionFootprint:rename-source-removal:promotion:1",
        "write:src/lib/candidate.ts#restorePromotionFootprint:rename-destination-creation:live:1",
        "write:src/lib/candidate.ts#restorePromotionFootprint:rename-source-removal:live:1",
        "write:src/lib/candidate.ts#restorePromotionFootprint:rename-destination-creation:promotion:1",
        "write:src/lib/candidate.ts#restorePromotionFootprint:rename-source-removal:promotion:2",
        "write:src/lib/candidate.ts#restorePromotionFootprint:rename-destination-creation:live:2",
        "write:src/lib/candidate.ts#restorePromotionFootprint:rename-source-removal:promotion:3",
        "write:src/lib/candidate.ts#restorePromotionFootprint:rename-destination-creation:live:3",
        "write:src/lib/candidate.ts#restorePromotionFootprint:rm:promotion:1",
        "write:src/lib/candidate.ts#recoverCanonicalCandidate:rename-source-removal:candidate:1",
        "write:src/lib/candidate.ts#recoverCanonicalCandidate:rename-destination-creation:candidate:1",
        "write:src/lib/candidate.ts#abandonInvalidCanonicalCandidate:durableAtomicWrite:candidate:1",
        "write:src/lib/candidate.ts#cleanupCandidateDiagnosticsUnderAuthority:rm:candidate:1",
        "write:src/lib/candidate.ts#promoteCandidateUnderSiteAuthority:stageLiveBundle:promotion:1",
        "write:src/lib/candidate.ts#promoteCandidateUnderSiteAuthority:rename-source-removal:live:1",
        "write:src/lib/candidate.ts#promoteCandidateUnderSiteAuthority:rename-destination-creation:promotion:1",
        "write:src/lib/candidate.ts#promoteCandidateUnderSiteAuthority:rename-source-removal:promotion:1",
        "write:src/lib/candidate.ts#promoteCandidateUnderSiteAuthority:rename-destination-creation:live:1",
        "write:src/lib/candidate.ts#promoteCandidateUnderSiteAuthority:durableAtomicWrite:candidate:1",
        "write:src/lib/candidate.ts#promoteCandidateUnderSiteAuthority:durableAtomicWrite:live:1",
        "write:src/lib/candidate.ts#promoteCandidateUnderSiteAuthority:rm:promotion:1",
        "write:src/lib/candidate.ts#promoteCandidateUnderSiteAuthority:durableAtomicWrite:candidate:2",
        "write:src/lib/candidate.ts#promoteCandidateUnderSiteAuthority:rename-source-removal:live:2",
        "write:src/lib/candidate.ts#promoteCandidateUnderSiteAuthority:rename-destination-creation:promotion:2",
        "write:src/lib/candidate.ts#promoteCandidateUnderSiteAuthority:rename-source-removal:promotion:2",
        "write:src/lib/candidate.ts#promoteCandidateUnderSiteAuthority:rename-destination-creation:live:2",
        "write:src/lib/candidate.ts#promoteCandidateUnderSiteAuthority:rm:promotion:2"
      ],
      "status": "compliant"
    }
  ]
}
```

## Current disposition

Image generation and orphan recovery stage provider bytes outside the live tree, then
publish them only through `atomicWriteGeneratedSiteFile` inside
`runGuardedMutation`. The inline edit path publishes
`site/assets/generated/<requestId>.<ext>` and snapshots that exact target with the HTML,
element history, and live gate report; its paid-cost ledger and staging file are
explicit non-rollback state.

`listProjectImages()` is also a writer: `synchronizeUnlocked()` may reconcile the
catalog, terminalize ledger reservations, and invalidate stale visual approval while
holding site authority. `runGates()` is a mixed live/candidate module: its live
`gates.json` writer is allowed only when every production call path holds site
authority, while `runCandidateGates()` receives a separate candidate-only callsite.

Seeded scanner fixtures move token, motion, history, catalog, ledger, and gate writes
outside their authorities; redirect a candidate writer to `site/**`; invent an
unapproved promotion callsite; rename a live source into an unclassified destination;
bind direct and helper-mediated raw writes to a different run root; omit one discovered
artifact from the inventory disposition; overlap an unrelated target identifier with an
authorized root name; invoke the generated-site primitive with another run; reuse each
production `finalPath` identifier shape with a matching run but a foreign target; spoof
the validated-producer function name with a foreign-returning body; reassign local and
parameter `finalPath` properties inside guarded callbacks; mutate `finalPath` through
`Object.assign`; shadow the Node path helper; import a noncanonical sibling `runstate`;
shadow a real Node path import with a parameter; mutate a nested `finalPath` carrier;
shadow it through a destructured binding; mutate a computed carrier path; overwrite
custom roots through a spread; supply an unknown later path segment; replace a traced
`finalPath` through a later spread; replace `runGuardedMutation` authority through a
later spread or duplicate `runId` or `runRoot`; propagate replaceable authority through
a guarded callback wrapper; replace `withSiteAuthorityLock` options `runRoot` through a
later spread, computed property, or duplicate, including through the default gate
runner; shadow the canonical `sitePaths` import; escape through parent traversal;
preserve a foreign dynamic-conditional branch; and exercise aliased imports plus
file-handle writes. Each
remains visible as an individual operation. A function-level guard token, unrelated
run/root binding, or candidate-capable import cannot make an escaped write compliant.
