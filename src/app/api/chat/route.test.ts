import { afterEach, describe, expect, it, vi } from "vitest";
import { buildChatRequest } from "../../../components/intakeRequest";
import {
  ChatRequestSchema,
  enforceResearchInvariant,
  forceIntakeContext,
  handleChat,
  startPipelineFromIntake,
  type StartPipelineResult,
} from "./route";
import {
  assertPromptOmitsUploadMetadata,
  copyFactsForPrompt,
} from "../../../lib/pipeline";
import { UploadError } from "../../../lib/uploads";
import { IntakeAttemptConflict } from "../../../lib/intakeAttempts";

const ATTEMPT_ID = "018f3f39-d1e2-7c3a-9b4d-5e6f708192a3";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.ONE_BOX_API_TOKEN;
});

const context = {
  projectTarget: "ios-app" as const,
  research: {
    enabled: true,
    businessIntelligence: false,
    referoDesignEvidence: true,
    allowPaidFirecrawlFallback: false,
  },
  uploads: [
    {
      id: "upload-1",
      fileName: "brand-guide.pdf",
      kind: "brand-guidelines" as const,
      mediaType: "application/pdf",
      sizeBytes: 512,
      uploadedAt: "2026-08-13T00:00:00.000Z",
    },
  ],
  uploadSession: "a".repeat(43),
};

describe("chat intake request", () => {
  it("rejects hostile and missing-Origin POSTs before body or model work", async () => {
    for (const origin of ["https://hostile.example", null]) {
      let pulls = 0;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          pulls += 1;
          controller.enqueue(new TextEncoder().encode("{}"));
          controller.close();
        },
      });
      const headers = new Headers({ "Content-Type": "application/json" });
      headers.set("Host", "localhost");
      if (origin) headers.set("Origin", origin);
      const request = new Request("http://localhost/api/chat", {
        method: "POST",
        headers,
        body,
        duplex: "half",
      } as RequestInit & { duplex: "half" });
      await Promise.resolve();
      const pullsBefore = pulls;
      const model = vi.fn();
      const response = await handleChat(request, {
        streamText: model as unknown as NonNullable<
          Parameters<typeof handleChat>[1]
        >["streamText"],
      });
      expect(response.status).toBe(403);
      expect(pulls).toBe(pullsBefore);
      expect(model).not.toHaveBeenCalled();
    }
  });

  it("allows a valid local bearer without Origin to reach request validation", async () => {
    process.env.ONE_BOX_API_TOKEN = "test-chat-token";
    const response = await handleChat(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-chat-token",
          "Content-Type": "application/json",
          Host: "localhost",
        },
        body: "{}",
      })
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Invalid chat request" });
  });

  it("lets a rebased legitimate browser request reach validation without model work", async () => {
    const model = vi.fn();
    const response = await handleChat(
      new Request("http://localhost:3000/api/chat", {
        method: "POST",
        headers: {
          Host: "127.0.0.1:3000",
          Origin: "http://127.0.0.1:3000",
          "Sec-Fetch-Site": "same-origin",
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
      {
        streamText: model as unknown as NonNullable<
          Parameters<typeof handleChat>[1]
        >["streamText"],
      }
    );

    expect(response.status).toBe(400);
    expect(model).not.toHaveBeenCalled();
  });

  it("stops missing runtime configuration before creating an attempt or calling a model", async () => {
    const model = vi.fn();
    const reserveIntakeAttempt = vi.fn();
    const response = await handleChat(
      new Request("http://localhost:3000/api/chat", {
        method: "POST",
        headers: {
          Host: "localhost:3000",
          Origin: "http://localhost:3000",
          "Sec-Fetch-Site": "same-origin",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          buildChatRequest(
            [{ id: "message-1", role: "user", content: "Build Acme" }],
            context,
            ATTEMPT_ID
          )
        ),
      }),
      {
        streamText: model as never,
        inspectIntakeAttempt: vi.fn().mockResolvedValue(undefined) as never,
        reserveIntakeAttempt: reserveIntakeAttempt as never,
        preflight: vi.fn().mockReturnValue({
          ok: false,
          blocking: [
            {
              key: "REFERO_OAUTH",
              message: "the Refero reference lock (stage: locked)",
              fix: "turn off Design-reference evidence",
            },
          ],
          advisory: [],
        }),
      }
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "missing-configuration",
      issues: [{ key: "REFERO_OAUTH" }],
    });
    expect(reserveIntakeAttempt).not.toHaveBeenCalled();
    expect(model).not.toHaveBeenCalled();
  });

  it("replays a completed attempt even when current runtime configuration is missing", async () => {
    const model = vi.fn();
    const preflight = vi.fn();
    const response = await handleChat(
      new Request("http://localhost:3000/api/chat", {
        method: "POST",
        headers: {
          Host: "localhost:3000",
          Origin: "http://localhost:3000",
          "Sec-Fetch-Site": "same-origin",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          buildChatRequest(
            [{ id: "message-1", role: "user", content: "Build Acme" }],
            context,
            ATTEMPT_ID
          )
        ),
      }),
      {
        streamText: model as never,
        inspectIntakeAttempt: vi.fn().mockResolvedValue({
          state: "completed",
          runId: "completed-run",
        }) as never,
        reserveIntakeAttempt: vi.fn() as never,
        preflight,
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      runId: "completed-run",
      started: true,
      replayed: true,
    });
    expect(preflight).not.toHaveBeenCalled();
    expect(model).not.toHaveBeenCalled();
  });

  it("returns typed claim expiry and removes the orphan run", async () => {
    const removeRun = vi.fn().mockResolvedValue(undefined);
    const result = await startPipelineFromIntake(
      {
        businessName: "Acme",
        category: "fiber installer",
        location: "Reno, NV",
        services: ["Installation"],
        primaryAction: "quote",
        certifications: [],
        claims: [],
        vibeWords: [],
        projectTarget: "ios-app",
        research: context.research,
        uploads: [],
      },
      context,
      ATTEMPT_ID,
      "a".repeat(64),
      {
        ensureRun: vi.fn().mockResolvedValue("orphan-run"),
        claimUploadSession: vi.fn().mockRejectedValue(
          new UploadError("The upload session is invalid or expired.", 401)
        ),
        removeRun,
        runIntakeAttempt: async (_attemptId, _fingerprint, operation) =>
          operation("orphan-run"),
        startStage: vi.fn(),
        saveArtifact: vi.fn(),
        finishStage: vi.fn(),
      }
    );
    expect(result).toEqual({
      started: false,
      code: "upload-session-expired",
      message: "Your private upload session expired. Choose the files again.",
    });
    expect(removeRun).toHaveBeenCalledOnce();
    expect(removeRun).toHaveBeenCalledWith("orphan-run");
  });

  it("includes selected target, research, and uploads in the client request", () => {
    const request = buildChatRequest(
      [{ id: "message-1", role: "user", content: "Build Acme" }],
      context,
      ATTEMPT_ID
    );

    expect(ChatRequestSchema.parse(request).intakeContext).toEqual(context);
    expect(ChatRequestSchema.parse(request).attemptId).toBe(ATTEMPT_ID);
    expect(request.messages[0].parts[0]).toEqual({
      type: "text",
      text: "Build Acme",
    });
  });

  it("rejects messages that omit the server-owned intake context", () => {
    expect(
      ChatRequestSchema.safeParse({
        messages: [
          {
            id: "message-1",
            role: "user",
            parts: [{ type: "text", text: "Build Acme" }],
          },
        ],
      }).success
    ).toBe(false);
  });

  it("preserves explicit paid fallback only while research is enabled", () => {
    const parsed = ChatRequestSchema.parse(
      buildChatRequest(
        [{ id: "message-1", role: "user", content: "Build Acme" }],
        {
          ...context,
          research: { ...context.research, allowPaidFirecrawlFallback: true },
        },
        ATTEMPT_ID
      )
    );
    expect(parsed.intakeContext.research.allowPaidFirecrawlFallback).toBe(true);
  });

  it("defaults omitted paid fallback consent to true", () => {
    const request = buildChatRequest(
      [{ id: "message-1", role: "user", content: "Build Acme" }],
      context,
      ATTEMPT_ID
    );
    const research = { ...request.intakeContext.research } as Partial<
      typeof request.intakeContext.research
    >;
    delete research.allowPaidFirecrawlFallback;
    const parsed = ChatRequestSchema.parse({
      ...request,
      intakeContext: { ...request.intakeContext, research },
    });
    expect(parsed.intakeContext.research.allowPaidFirecrawlFallback).toBe(true);
  });

  it("forces the request target, research, and uploads over model values", () => {
    const authoritativeUploads = [
      {
        ...context.uploads[0],
        fileName: "server-verified-brand-guide.pdf",
        sha256: "b".repeat(64),
        storagePath: "uploads/upload-1.pdf",
      },
    ];
    const intake = forceIntakeContext(
      {
        businessName: "Acme",
        category: "fiber installer",
        location: "Reno, NV",
        services: ["Installation"],
        primaryAction: "quote",
        certifications: [],
        claims: [],
        vibeWords: [],
        projectTarget: "website",
        research: {
          enabled: false,
          businessIntelligence: true,
          referoDesignEvidence: false,
          allowPaidFirecrawlFallback: true,
        },
        uploads: [],
      },
      context,
      authoritativeUploads
    );

    expect(intake.projectTarget).toBe("ios-app");
    expect(intake.research).toEqual(context.research);
    expect(intake.uploads).toEqual(authoritativeUploads);
    expect(intake.uploads[0].fileName).not.toBe(context.uploads[0].fileName);
  });

  it("forces both research children off when research is disabled", () => {
    expect(
      enforceResearchInvariant({
        enabled: false,
        businessIntelligence: true,
        referoDesignEvidence: true,
        allowPaidFirecrawlFallback: true,
      })
    ).toEqual({
      enabled: false,
      businessIntelligence: false,
      referoDesignEvidence: false,
      allowPaidFirecrawlFallback: false,
    });

    const parsed = ChatRequestSchema.parse(
      buildChatRequest(
        [{ id: "message-1", role: "user", content: "Build Acme" }],
        {
          ...context,
          research: {
            enabled: false,
            businessIntelligence: true,
            referoDesignEvidence: true,
            allowPaidFirecrawlFallback: true,
          },
        },
        ATTEMPT_ID
      )
    );
    expect(parsed.intakeContext.research).toEqual({
      enabled: false,
      businessIntelligence: false,
      referoDesignEvidence: false,
      allowPaidFirecrawlFallback: false,
    });
  });

  it("returns the original run for a repeated intake attempt", async () => {
    const ensureRun = vi.fn().mockResolvedValue("original-run");
    const claimUploadSession = vi.fn().mockResolvedValue([]);
    const removeRun = vi.fn().mockResolvedValue(undefined);
    const completed = new Map<string, StartPipelineResult>();
    const runIntakeAttempt = vi.fn(async (
      attemptId: string,
      _fingerprint: string,
      operation: (runId: string) => Promise<StartPipelineResult>
    ): Promise<StartPipelineResult> => {
      const replay = completed.get(attemptId);
      if (replay) return replay;
      const result = await operation("original-run");
      if (result.started) completed.set(attemptId, result);
      return result;
    });
    const intake = {
      businessName: "Acme",
      category: "fiber installer",
      location: "Reno, NV",
      services: ["Installation"],
      primaryAction: "quote" as const,
      certifications: [],
      claims: [],
      vibeWords: [],
      projectTarget: "ios-app" as const,
      research: context.research,
      uploads: [],
    };
    const dependencies = {
      ensureRun,
      claimUploadSession,
      removeRun,
      runIntakeAttempt,
      startStage: vi.fn(),
      saveArtifact: vi.fn(),
      finishStage: vi.fn(),
    };

    await expect(
      startPipelineFromIntake(
        intake,
        context,
        ATTEMPT_ID,
        "a".repeat(64),
        dependencies
      )
    ).resolves.toEqual({ runId: "original-run", started: true });
    await expect(
      startPipelineFromIntake(
        intake,
        context,
        ATTEMPT_ID,
        "a".repeat(64),
        dependencies
      )
    ).resolves.toEqual({ runId: "original-run", started: true });

    expect(ensureRun).toHaveBeenCalledOnce();
    expect(claimUploadSession).toHaveBeenCalledOnce();
  });

  it("short-circuits a completed replay before model work", async () => {
    const model = vi.fn();
    const response = await handleChat(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: {
          Host: "localhost",
          Origin: "http://localhost",
          "Sec-Fetch-Site": "same-origin",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          buildChatRequest(
            [{ id: "message-1", role: "user", content: "Build Acme" }],
            context,
            ATTEMPT_ID
          )
        ),
      }),
      {
        streamText: model as never,
        preflight: vi.fn().mockReturnValue({
          ok: true,
          blocking: [],
          advisory: [],
        }),
        inspectIntakeAttempt: vi.fn().mockResolvedValue({
          state: "completed",
          runId: "original-run",
        }) as never,
        reserveIntakeAttempt: vi.fn() as never,
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      runId: "original-run",
      replayed: true,
    });
    expect(model).not.toHaveBeenCalled();
  });

  it("returns 409 for an attempt id reused with a different request", async () => {
    const model = vi.fn();
    const response = await handleChat(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: {
          Host: "localhost",
          Origin: "http://localhost",
          "Sec-Fetch-Site": "same-origin",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          buildChatRequest(
            [{ id: "message-1", role: "user", content: "Different" }],
            context,
            ATTEMPT_ID
          )
        ),
      }),
      {
        streamText: model as never,
        preflight: vi.fn().mockReturnValue({
          ok: true,
          blocking: [],
          advisory: [],
        }),
        inspectIntakeAttempt: vi.fn().mockResolvedValue(undefined) as never,
        reserveIntakeAttempt: vi.fn().mockRejectedValue(
          new IntakeAttemptConflict()
        ) as never,
      }
    );

    expect(response.status).toBe(409);
    expect(model).not.toHaveBeenCalled();
  });

  it("builds external-model facts from an allowlist that excludes upload metadata", () => {
    const facts = JSON.stringify(
      copyFactsForPrompt({
        businessName: "Acme",
        category: "fiber installer",
        location: "Reno, NV",
        services: ["Installation"],
        primaryAction: "quote",
        certifications: [],
        claims: [],
        vibeWords: [],
        projectTarget: "website",
        research: context.research,
        uploads: [
          {
            ...context.uploads[0],
            fileName: "PRIVATE-brand-guide.pdf",
            sha256: "b".repeat(64),
            storagePath: "uploads/private.pdf",
          },
        ],
      })
    );
    expect(facts).not.toContain("uploads");
    expect(facts).not.toContain("PRIVATE-brand-guide.pdf");
    expect(facts).not.toContain("b".repeat(64));
    expect(facts).not.toContain("uploads/private.pdf");
    expect(() =>
      assertPromptOmitsUploadMetadata(`safe facts ${facts}`, [
        {
          ...context.uploads[0],
          fileName: "PRIVATE-brand-guide.pdf",
          sha256: "b".repeat(64),
          storagePath: "uploads/private.pdf",
        },
      ])
    ).not.toThrow();
  });

  it("blocks every private upload metadata field at the external-model seam", () => {
    const upload = {
      ...context.uploads[0],
      id: "private-upload-id",
      fileName: "private-file.pdf",
      sha256: "c".repeat(64),
      storagePath: "uploads/private-file.pdf",
    };
    for (const value of [upload.id, upload.fileName, upload.sha256, upload.storagePath]) {
      expect(() => assertPromptOmitsUploadMetadata(`prompt ${value}`, [upload])).toThrow(
        "external model prompt contains private upload metadata"
      );
    }
  });
});
