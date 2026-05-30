import { randomUUID } from "node:crypto";
import type { Artifact, MissionEvent, ProjectPassport, WorkerRun } from "@psf/mission-schema";

export interface MissionPlannerInput {
  projectId: string;
  userRequirement: string;
  passport: ProjectPassport;
  qaCharter: string;
  title?: string;
  priority?: "P0" | "P1" | "P2" | "P3";
  missionId?: string;
}

export interface PlannedFile {
  name: "mission.md" | "acceptance.md" | "technical-notes.md" | "risk-notes.md";
  content: string;
}

export interface MissionPlan {
  missionId: string;
  title: string;
  files: PlannedFile[];
  workerRun: WorkerRun;
  artifacts: Artifact[];
  events: MissionEvent[];
}

const artifactTypesByFileName = {
  "mission.md": "mission",
  "acceptance.md": "acceptance",
  "technical-notes.md": "technical_notes",
  "risk-notes.md": "risk_notes",
} as const satisfies Record<PlannedFile["name"], Artifact["type"]>;

export function createDeterministicMissionPlan(input: MissionPlannerInput): MissionPlan {
  const missionId = input.missionId ?? `mission-${randomUUID()}`;
  const title = input.title ?? input.userRequirement.slice(0, 48);
  const priority = input.priority ?? "P2";
  const now = new Date().toISOString();
  const workerRunId = `worker-run-${missionId}-planner`;
  const files = buildFiles(input, missionId, title, priority);
  const artifacts = files.map((file, index): Artifact => ({
    id: `artifact-${missionId}-${index + 1}`,
    mission_id: missionId,
    type: artifactTypesByFileName[file.name],
    path: `missions/${missionId}/${file.name}`,
    worker_run_id: workerRunId,
    content: file.content,
    mime_type: "text/markdown",
    size: Buffer.byteLength(file.content, "utf8"),
    metadata: { generatedBy: "mission-planner" },
    created_at: now,
  }));
  const workerRun: WorkerRun = {
    id: workerRunId,
    mission_id: missionId,
    worker_type: "planner",
    status: "succeeded",
    mode: "dry-run",
    started_at: now,
    finished_at: now,
    exit_code: 0,
    input: {
      projectId: input.projectId,
      userRequirement: input.userRequirement,
      title,
      priority,
      passportProjectId: input.passport.id,
      qaCharter: input.qaCharter,
    },
    output: {
      files: files.map((file) => file.name),
      artifacts: artifacts.map((artifact) => artifact.path),
    },
    logs: [
      "mission planner dry-run started",
      "mission planner generated deterministic templates",
      "mission planner dry-run completed",
    ],
    metadata: { generatedBy: "mission-planner", deterministic: true },
    created_at: now,
    updated_at: now,
  };
  const events: MissionEvent[] = [
    {
      id: `event-${missionId}-planning-started`,
      mission_id: missionId,
      type: "mission.planning.started",
      message: "Mission planning started.",
      payload: { projectId: input.projectId, workerRunId },
      created_at: now,
    },
    {
      id: `event-${missionId}-planning-completed`,
      mission_id: missionId,
      type: "mission.planning.completed",
      message: "Mission planning completed.",
      payload: {
        projectId: input.projectId,
        workerRunId,
        files: files.map((file) => file.name),
      },
      created_at: now,
    },
  ];

  return { missionId, title, files, workerRun, artifacts, events };
}

function buildFiles(
  input: MissionPlannerInput,
  missionId: string,
  title: string,
  priority: "P0" | "P1" | "P2" | "P3",
): PlannedFile[] {
  return [
    { name: "mission.md", content: buildMissionDocument(input, missionId, title, priority) },
    { name: "acceptance.md", content: buildAcceptanceDocument(input) },
    { name: "technical-notes.md", content: buildTechnicalNotesDocument(input) },
    { name: "risk-notes.md", content: buildRiskNotesDocument(input) },
  ];
}

function buildMissionDocument(
  input: MissionPlannerInput,
  missionId: string,
  title: string,
  priority: "P0" | "P1" | "P2" | "P3",
): string {
  return [
    "# Mission Plan",
    "",
    "## Mission 标题",
    title,
    "",
    "## 背景",
    `项目 ${input.passport.name} (${input.projectId}) 收到需求：${input.userRequirement}`,
    "",
    "## 目标",
    "- 将用户需求拆解为可交付、可验收、可测试的开发任务。",
    `- 保持任务 ${missionId} 的范围清晰，优先级为 ${priority}。`,
    "",
    "## 用户故事",
    `- 作为项目用户，我希望${input.userRequirement}，以便获得更完整和可验证的产品能力。`,
    "",
    "## 范围",
    "- 依据 Project Passport、QA Charter 和用户需求生成实现指导。",
    "- 产出 mission、acceptance、technical notes 和 risk notes 四份规划文档。",
    "",
    "## 非目标",
    "- 不调用 LLM 或外部服务。",
    "- 不修改 API、数据库、Worker 执行逻辑或 Hub UI。",
    "- 不执行生产部署或真实业务变更。",
    "",
    "## 验收标准",
    "- 规划文档覆盖任务背景、目标、范围、测试、交付物和风险。",
    "- 验收文档覆盖功能、交互、错误处理、数据一致性、回归、安全和人工审批。",
    "- 技术说明列出相关命令、核心流程、推荐修改区域和测试策略。",
    "",
    "## 必须运行的测试",
    formatCommandList(input.passport.commands.test),
    "",
    "## 禁止事项",
    "- 禁止泄露、记录或提交任何 secret。",
    "- 禁止直接推送 main 分支。",
    "- 禁止在未获批准时部署生产或删除用户数据。",
    "",
    "## 预期交付物",
    "- 可审阅的代码变更。",
    "- 本地测试结果。",
    "- 相关文档更新。",
    "- 如进入后续阶段，提交 GitHub PR 等待人工审阅。",
    "",
    "## 风险点",
    "- 需求可能影响核心流程，需要在实现前确认范围边界。",
    "- QA Charter 中的关键路径必须在后续 QA 阶段覆盖。",
    "- 任何部署、数据迁移或外部成本风险都需要人工审批。",
    "",
  ].join("\n");
}

function buildAcceptanceDocument(input: MissionPlannerInput): string {
  return [
    "# Acceptance Plan",
    "",
    "## 功能验收",
    `- 用户需求“${input.userRequirement}”对应的核心功能可以被人工或自动化步骤验证。`,
    "- 所有声明完成的行为都有明确的期望结果。",
    "",
    "## 交互验收",
    "- 涉及 UI 或命令行交互时，主要路径、取消路径和重复提交路径均可预期。",
    "- 文案和状态反馈不会误导用户。",
    "",
    "## 错误处理验收",
    "- 失败场景返回可理解的错误信息。",
    "- 重试、回滚或人工处理路径被清楚记录。",
    "",
    "## 数据一致性验收",
    "- 任务不破坏既有数据结构和持久化约定。",
    "- 状态变化在后续集成阶段必须可审计。",
    "",
    "## 回归测试验收",
    "- 运行 Project Passport 中声明的测试命令。",
    "- 覆盖 QA Charter 中列出的关键路径。",
    "",
    "## 安全验收",
    "- 不打印、不持久化、不提交 secret。",
    "- 涉及权限、外部服务或生产数据时必须进入人工审批。",
    "",
    "## 人工审批点",
    "- 生产部署。",
    "- 数据库迁移。",
    "- Secret 变更。",
    "- 破坏性操作。",
    "- 外部成本或安全风险。",
    "",
  ].join("\n");
}

function buildTechnicalNotesDocument(input: MissionPlannerInput): string {
  return [
    "# Technical Notes",
    "",
    "## 相关项目命令",
    `- install: ${formatCommandValue(input.passport.commands.install)}`,
    `- test: ${formatCommandValue(input.passport.commands.test)}`,
    `- build: ${formatCommandValue(input.passport.commands.build)}`,
    `- run_staging: ${formatCommandValue(input.passport.commands.run_staging)}`,
    "",
    "## 相关核心流程",
    formatCoreFlows(input.passport),
    "",
    "## 推荐修改区域",
    "- 根据需求优先定位现有业务模块、测试目录和文档。",
    "- 保持 Mission Planner 输出为本地 artifact，不接入 API 或 Worker 执行。",
    "",
    "## 推荐测试策略",
    "- 优先运行与变更面最接近的单元或集成测试。",
    "- 再运行 Project Passport 声明的关键测试命令。",
    "- QA Charter:",
    indentText(input.qaCharter),
    "",
  ].join("\n");
}

function buildRiskNotesDocument(input: MissionPlannerInput): string {
  return [
    "# Risk Notes",
    "",
    "## 技术风险",
    "- 需求可能跨越多个模块，需要避免扩大实现范围。",
    "- 后续 API 集成必须保持规划包可替换为 LLM-backed planner。",
    "",
    "## 数据风险",
    "- 当前规划阶段不写入数据库。",
    "- 后续阶段如涉及状态变更，必须生成 MissionEvent 并保留审计线索。",
    "",
    "## AI 输出风险",
    "- 当前实现不调用 LLM，输出来自确定性模板。",
    "- 后续接入 LLM 时必须保留结构化校验和人工审阅点。",
    "",
    "## 部署风险",
    "- 当前任务不部署。",
    "- 生产部署必须显式人工批准。",
    "",
    "## 需要人工确认的风险",
    `- 需求边界：${input.userRequirement}`,
    "- 是否涉及生产数据、外部付费服务、secret 或破坏性操作。",
    "",
  ].join("\n");
}

function formatCommandList(command: ProjectPassport["commands"]["test"]): string {
  const commands = Array.isArray(command) ? command : [command];

  return commands.map((item) => `- \`${item}\``).join("\n");
}

function formatCommandValue(command: ProjectPassport["commands"]["test"]): string {
  const commands = Array.isArray(command) ? command : [command];

  return commands.map((item) => `\`${item}\``).join(", ");
}

function formatCoreFlows(passport: ProjectPassport): string {
  return passport.core_flows
    .map((flow) => `- ${flow.name} (${flow.id}, ${flow.priority})`)
    .join("\n");
}

function indentText(text: string): string {
  return text
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}
