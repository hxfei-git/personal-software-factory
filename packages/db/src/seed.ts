import { prisma } from "./client.js";

const projectId = "ai-novelist";
const missionId = "mission-sample-001";
const eventId = "event-sample-001";

async function main(): Promise<void> {
  await prisma.project.upsert({
    where: { id: projectId },
    update: {
      slug: "ai-novelist",
      name: "AI Novel Assistant",
      description: "Web AI writing assistant for novels.",
      repoUrl: "git@github.com:hxfei-git/ai-novelist.git",
      defaultBranch: "main",
      localPath: "./workspaces/ai-novelist",
      passportPath: "projects/ai-novelist/project.passport.yaml",
      productionUrl: "",
      stagingUrl: "",
      status: "active",
    },
    create: {
      id: projectId,
      slug: "ai-novelist",
      name: "AI Novel Assistant",
      description: "Web AI writing assistant for novels.",
      repoUrl: "git@github.com:hxfei-git/ai-novelist.git",
      defaultBranch: "main",
      localPath: "./workspaces/ai-novelist",
      passportPath: "projects/ai-novelist/project.passport.yaml",
      productionUrl: "",
      stagingUrl: "",
      status: "active",
    },
  });

  await prisma.mission.upsert({
    where: { id: missionId },
    update: {
      title: "Standardize startup and test commands",
      slug: "standardize-startup-and-test-commands",
      rawRequest: "Make ai-novelist runnable by workers.",
      missionMarkdown: "# Mission\nStandardize startup and test commands.",
      acceptanceMarkdown: "# Acceptance\nCommands are documented and can run locally.",
      status: "received",
      priority: "P1",
      riskLevel: "medium",
      currentAttempt: 0,
      maxAttempts: 3,
    },
    create: {
      id: missionId,
      projectId,
      title: "Standardize startup and test commands",
      slug: "standardize-startup-and-test-commands",
      rawRequest: "Make ai-novelist runnable by workers.",
      missionMarkdown: "# Mission\nStandardize startup and test commands.",
      acceptanceMarkdown: "# Acceptance\nCommands are documented and can run locally.",
      status: "received",
      priority: "P1",
      riskLevel: "medium",
      currentAttempt: 0,
      maxAttempts: 3,
    },
  });

  await prisma.missionEvent.upsert({
    where: { id: eventId },
    update: {
      type: "mission.created",
      message: "Sample mission created by seed data.",
      payload: { status: "received", seed: true },
    },
    create: {
      id: eventId,
      missionId,
      type: "mission.created",
      message: "Sample mission created by seed data.",
      payload: { status: "received", seed: true },
    },
  });

  console.log("Seeded project " + projectId + " and mission " + missionId + ".");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
