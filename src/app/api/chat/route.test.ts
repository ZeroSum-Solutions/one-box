import { afterEach, describe, expect, it, vi } from "vitest";
import { buildChatRequest } from "../../../components/intakeRequest";
import {
  ChatRequestSchema,
  enforceResearchInvariant,
  forceIntakeContext,
  handleChat,
  startPipelineFromIntake,
} from "./route";
import {
  assertPromptOmitsUploadMetadata,
  copyFactsForPrompt,
} from "../../../lib/pipeline";
import { UploadError } from "../../../lib/uploads";

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
        },
        body: "{}",
      })
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Invalid chat request" });
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
      {
        createRun: vi.fn().mockResolvedValue("orphan-run"),
        claimUploadSession: vi.fn().mockRejectedValue(
          new UploadError("The upload session is invalid or expired.", 401)
        ),
        removeRun,
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
      context
    );

    expect(ChatRequestSchema.parse(request).intakeContext).toEqual(context);
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
        }
      )
    );
    expect(parsed.intakeContext.research.allowPaidFirecrawlFallback).toBe(true);
  });

  it("defaults omitted paid fallback consent to false", () => {
    const request = buildChatRequest(
      [{ id: "message-1", role: "user", content: "Build Acme" }],
      context
    );
    const research = { ...request.intakeContext.research } as Partial<
      typeof request.intakeContext.research
    >;
    delete research.allowPaidFirecrawlFallback;
    const parsed = ChatRequestSchema.parse({
      ...request,
      intakeContext: { ...request.intakeContext, research },
    });
    expect(parsed.intakeContext.research.allowPaidFirecrawlFallback).toBe(false);
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
        }
      )
    );
    expect(parsed.intakeContext.research).toEqual({
      enabled: false,
      businessIntelligence: false,
      referoDesignEvidence: false,
      allowPaidFirecrawlFallback: false,
    });
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
