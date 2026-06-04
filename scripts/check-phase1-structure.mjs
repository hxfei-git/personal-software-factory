import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const requiredFiles = [
  'AGENTS.md',
  'README.md',
  '.gitignore',
  '.env.example',
  'package.json',
  'pnpm-workspace.yaml',
  'turbo.json',
  'tsconfig.base.json',
  'docker-compose.yml',
  'docs/README.md',
  'summary.md',
  'docs/architecture/structure.md',
  'docs/debug/debug.md',
  'docs/vision/plan.md',
  'docs/status/progress.md',
  'docs/status/next-steps.md',
  'docs/status/README.md',
  'docs/operations/development-standards.md',
  'docs/superpowers/README.md',
  'docs/superpowers/plans/README.md',
  'apps/README.md',
  'apps/hub/README.md',
  'apps/hub/package.json',
  'apps/orchestrator-api/README.md',
  'apps/orchestrator-api/package.json',
  'workers/README.md',
  'workers/codex-worker/README.md',
  'workers/codex-worker/package.json',
  'workers/qa-worker/README.md',
  'workers/qa-worker/package.json',
  'packages/README.md',
  'packages/mission-schema/README.md',
  'packages/mission-schema/package.json',
  'packages/project-passport/README.md',
  'packages/project-passport/package.json',
  'projects/README.md',
  'missions/README.md',
  'artifacts/README.md',
  'workspaces/README.md',
  'scripts/README.md'
];

const requiredDirectories = [
  'apps/hub',
  'apps/orchestrator-api',
  'workers/codex-worker',
  'workers/qa-worker',
  'packages/mission-schema',
  'packages/project-passport',
  'projects',
  'missions',
  'artifacts',
  'workspaces',
  'docs',
  'docs/architecture',
  'docs/debug',
  'docs/vision',
  'docs/status',
  'docs/api',
  'docs/security',
  'docs/runtime',
  'docs/operations',
  'docs/integrations',
  'docs/workers',
  'docs/apps',
  'docs/projects',
  'docs/superpowers',
  'docs/superpowers/plans',
  'scripts'
];

const expectedPackageNames = new Map([
  ['package.json', 'personal-software-factory'],
  ['apps/hub/package.json', '@psf/hub'],
  ['apps/orchestrator-api/package.json', '@psf/orchestrator-api'],
  ['workers/codex-worker/package.json', '@psf/codex-worker'],
  ['workers/qa-worker/package.json', '@psf/qa-worker'],
  ['packages/mission-schema/package.json', '@psf/mission-schema'],
  ['packages/project-passport/package.json', '@psf/project-passport']
]);

const missingFiles = requiredFiles.filter((file) => !existsSync(join(root, file)));
const missingDirectories = requiredDirectories.filter((dir) => {
  const fullPath = join(root, dir);
  return !existsSync(fullPath) || !statSync(fullPath).isDirectory();
});

const packageNameErrors = [];
for (const [file, expectedName] of expectedPackageNames.entries()) {
  const fullPath = join(root, file);
  if (!existsSync(fullPath)) {
    continue;
  }

  const content = JSON.parse(readFileSync(fullPath, 'utf8'));
  if (content.name !== expectedName) {
    packageNameErrors.push(`${file} expected name ${expectedName}, received ${content.name}`);
  }
}

const envExample = readFileSync(join(root, '.env.example'), 'utf8');
const forbiddenSecretPatterns = [/sk-[A-Za-z0-9]/, /ghp_[A-Za-z0-9]/, /xox[baprs]-/];
const secretErrors = forbiddenSecretPatterns
  .filter((pattern) => pattern.test(envExample))
  .map((pattern) => `.env.example matched forbidden secret pattern ${pattern}`);

const errors = [
  ...missingFiles.map((file) => `Missing required file: ${file}`),
  ...missingDirectories.map((dir) => `Missing required directory: ${dir}`),
  ...packageNameErrors,
  ...secretErrors
];

if (errors.length > 0) {
  console.error('Repository structure check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Repository structure check passed.');
console.log(`Validated ${requiredFiles.length} files and ${requiredDirectories.length} directories.`);
