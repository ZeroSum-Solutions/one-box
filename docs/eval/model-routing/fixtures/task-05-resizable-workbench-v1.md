# Task 05 v1: resizable iframe workbench interaction

Produce a bounded TypeScript/React implementation for a preview workbench with a
left inspector and iframe preview. A pointer drag on the divider must resize from
320px through 960px, clamp at both bounds, capture and release the pointer, clean
up listeners on cancel/unmount, and preserve keyboard access with ArrowLeft,
ArrowRight, Home, and End. The iframe must remain mounted while its width changes.

Output one labeled `ResizableWorkbench.tsx` fenced block. Do not include scores,
model identity, provider identity, or claims that the result passes.
