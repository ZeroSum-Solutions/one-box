import {
  AiTeammateRegistryV1Schema,
  type AiTeammateDefinitionV1,
  type AiTeammateIdV1,
} from "../contracts";

export const AI_TEAMMATE_REGISTRY = AiTeammateRegistryV1Schema.parse([
  {
    schemaVersion: 1,
    id: "researcher",
    displayName: "Researcher",
    specialty: "Evidence research",
    brief: "Finds and organizes evidence into a bounded proposal.",
    skills: ["source-research", "evidence-synthesis"],
    dataClasses: ["public", "project-internal"],
    effectClasses: ["read", "propose"],
    availability: "idle",
  },
  {
    schemaVersion: 1,
    id: "prd-planner",
    displayName: "PRD Planner",
    specialty: "Product requirements",
    brief: "Turns approved context into a bounded requirements proposal.",
    skills: ["requirements-analysis", "acceptance-criteria"],
    dataClasses: ["public", "project-internal"],
    effectClasses: ["read", "propose"],
    availability: "idle",
  },
  {
    schemaVersion: 1,
    id: "architecture-analyst",
    displayName: "Architecture Analyst",
    specialty: "System architecture",
    brief: "Evaluates system boundaries and proposes implementation structure.",
    skills: ["architecture-analysis", "dependency-review"],
    dataClasses: ["public", "project-internal"],
    effectClasses: ["read", "propose"],
    availability: "idle",
  },
  {
    schemaVersion: 1,
    id: "canvas-designer",
    displayName: "Canvas Designer",
    specialty: "Canvas experience design",
    brief: "Proposes accessible Canvas interactions without applying changes.",
    skills: ["interaction-design", "accessibility-review"],
    dataClasses: ["public", "project-internal"],
    effectClasses: ["read", "propose"],
    availability: "idle",
  },
  {
    schemaVersion: 1,
    id: "implementation-producer",
    displayName: "Implementation Producer",
    specialty: "Implementation proposals",
    brief: "Produces bounded implementation proposals for approved work.",
    skills: ["implementation-planning", "change-analysis"],
    dataClasses: ["public", "project-internal"],
    effectClasses: ["read", "propose"],
    availability: "idle",
  },
  {
    schemaVersion: 1,
    id: "qa-challenger",
    displayName: "QA Challenger",
    specialty: "Quality challenges",
    brief: "Challenges proposals against tests, states, and acceptance criteria.",
    skills: ["test-analysis", "failure-mode-review"],
    dataClasses: ["public", "project-internal"],
    effectClasses: ["read", "propose"],
    availability: "idle",
  },
  {
    schemaVersion: 1,
    id: "security-challenger",
    displayName: "Security Challenger",
    specialty: "Security challenges",
    brief: "Challenges proposals against the approved authority and data boundary.",
    skills: ["threat-analysis", "authority-review"],
    dataClasses: ["public", "project-internal"],
    effectClasses: ["read", "propose"],
    availability: "idle",
  },
  {
    schemaVersion: 1,
    id: "seo-qualifier",
    displayName: "SEO Qualifier",
    specialty: "SEO qualification",
    brief: "Evaluates proposed site output against bounded SEO criteria.",
    skills: ["seo-analysis", "content-qualification"],
    dataClasses: ["public", "project-internal"],
    effectClasses: ["read", "propose"],
    availability: "idle",
  },
]);

export function listAiTeammates(): typeof AI_TEAMMATE_REGISTRY {
  return AI_TEAMMATE_REGISTRY;
}

export function getAiTeammate(
  id: AiTeammateIdV1 | string,
): AiTeammateDefinitionV1 | undefined {
  return AI_TEAMMATE_REGISTRY.find((teammate) => teammate.id === id);
}
