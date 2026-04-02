import fs from 'fs';
import path from 'path';

export type AcaKernelFiles = {
  soul: string;
  identity: string;
  user: string;
};

export type AcaOverlayFiles = {
  job?: string;
  charter?: string;
  comms?: string;
  motivations?: string;
  workqueue?: string;
};

export type AcaLoadResult = {
  kernel: AcaKernelFiles;
  overlay: AcaOverlayFiles;
  kernelMissing: string[];
  overlayMissing: string[];
};

const ENGINE_ID = 'clawtext-session-intelligence';

function readOptionalFile(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}

function truncateUserContent(content: string): string {
  const lines = content.split(/\r?\n/);
  let h2Count = 0;

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].startsWith('## ')) {
      h2Count += 1;
      if (h2Count === 2) {
        return lines.slice(0, index).join('\n');
      }
    }
  }

  return lines.slice(0, 40).join('\n');
}

export function loadAcaFiles(workspacePath: string): AcaLoadResult {
  const kernelMissing: string[] = [];
  const overlayMissing: string[] = [];

  const soulPath = path.join(workspacePath, 'SOUL.md');
  const identityPath = path.join(workspacePath, 'IDENTITY.md');
  const userPath = path.join(workspacePath, 'USER.md');

  const soulRaw = readOptionalFile(soulPath);
  const identityRaw = readOptionalFile(identityPath);
  const userRaw = readOptionalFile(userPath);

  if (soulRaw === null) {
    kernelMissing.push('SOUL.md');
    console.warn(`[${ENGINE_ID}] Missing ACA kernel file: SOUL.md`);
  }

  if (identityRaw === null) {
    kernelMissing.push('IDENTITY.md');
    console.warn(`[${ENGINE_ID}] Missing ACA kernel file: IDENTITY.md`);
  }

  if (userRaw === null) {
    kernelMissing.push('USER.md');
    console.warn(`[${ENGINE_ID}] Missing ACA kernel file: USER.md`);
  }

  const kernel: AcaKernelFiles = {
    soul: soulRaw ?? '',
    identity: identityRaw ?? '',
    user: userRaw !== null ? truncateUserContent(userRaw) : '',
  };

  const overlay: AcaOverlayFiles = {};

  const jobPath = path.join(workspacePath, 'JOB.md');
  const charterPath = path.join(workspacePath, 'CHARTER.md');
  const commsPath = path.join(workspacePath, 'COMMS.md');

  const jobRaw = readOptionalFile(jobPath);
  if (jobRaw === null) {
    overlayMissing.push('JOB.md');
  } else {
    overlay.job = jobRaw;
  }

  const charterRaw = readOptionalFile(charterPath);
  if (charterRaw === null) {
    overlayMissing.push('CHARTER.md');
  } else {
    overlay.charter = charterRaw;
  }

  if (!fs.existsSync(commsPath)) {
    overlayMissing.push('COMMS.md');
  } else {
    const commsResolvedPath = fs.realpathSync(commsPath);
    overlay.comms = fs.readFileSync(commsResolvedPath, 'utf8');
  }

  const motivationsPath = path.join(workspacePath, 'MOTIVATIONS.md');
  const motivationsRaw = readOptionalFile(motivationsPath);
  if (motivationsRaw === null) {
    overlayMissing.push('MOTIVATIONS.md');
  } else {
    overlay.motivations = motivationsRaw;
  }

  const workqueuePath = path.join(workspacePath, 'WORKQUEUE.md');
  const workqueueRaw = readOptionalFile(workqueuePath);
  if (workqueueRaw === null) {
    overlayMissing.push('WORKQUEUE.md');
  } else {
    overlay.workqueue = workqueueRaw;
  }

  if (kernelMissing.length === 3) {
    console.error(`[${ENGINE_ID}] ACA kernel unavailable: SOUL.md, IDENTITY.md, and USER.md are all missing.`);
  }

  return {
    kernel,
    overlay,
    kernelMissing,
    overlayMissing,
  };
}

export function allKernelFilesPresent(result: AcaLoadResult): boolean {
  return result.kernelMissing.length === 0;
}

export function buildKernelContent(kernel: AcaKernelFiles): string {
  return [
    '## Identity Kernel',
    '',
    '### SOUL',
    kernel.soul,
    '',
    '### IDENTITY',
    kernel.identity,
    '',
    '### USER',
    kernel.user,
  ].join('\n');
}

export function buildOverlayContent(overlay: AcaOverlayFiles): string {
  const sections: string[] = [];

  if (typeof overlay.job === 'string') {
    sections.push(['### JOB', overlay.job].join('\n'));
  }

  if (typeof overlay.charter === 'string') {
    sections.push(['### CHARTER', overlay.charter].join('\n'));
  }

  if (typeof overlay.comms === 'string') {
    sections.push(['### COMMS', overlay.comms].join('\n'));
  }

  if (typeof overlay.motivations === 'string') {
    sections.push(['### MOTIVATIONS', overlay.motivations].join('\n'));
  }

  if (typeof overlay.workqueue === 'string') {
    sections.push(['### WORKQUEUE', overlay.workqueue].join('\n'));
  }

  if (sections.length === 0) {
    return '';
  }

  return ['## Active Overlay', '', sections.join('\n\n')].join('\n');
}

export function estimateAcaTokens(result: AcaLoadResult): { kernelTokens: number; overlayTokens: number } {
  const kernelTokens =
    Math.ceil(result.kernel.soul.length / 4)
    + Math.ceil(result.kernel.identity.length / 4)
    + Math.ceil(result.kernel.user.length / 4);

  const overlayTokens =
    (typeof result.overlay.job === 'string' ? Math.ceil(result.overlay.job.length / 4) : 0)
    + (typeof result.overlay.charter === 'string' ? Math.ceil(result.overlay.charter.length / 4) : 0)
    + (typeof result.overlay.comms === 'string' ? Math.ceil(result.overlay.comms.length / 4) : 0)
    + (typeof result.overlay.motivations === 'string' ? Math.ceil(result.overlay.motivations.length / 4) : 0)
    + (typeof result.overlay.workqueue === 'string' ? Math.ceil(result.overlay.workqueue.length / 4) : 0);

  return { kernelTokens, overlayTokens };
}
