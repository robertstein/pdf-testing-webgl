export function computeDefaultMemoryPolicy() {
  const MB = 1024 * 1024;
  const fallbackBytes = 128 * MB;
  const maxHardBytes = 256 * MB;

  const deviceMemoryGB = Number(navigator.deviceMemory);
  const deviceBytes = Number.isFinite(deviceMemoryGB) && deviceMemoryGB > 0
    ? Math.floor(deviceMemoryGB * 0.2 * 1024 * 1024 * 1024)
    : fallbackBytes;

  const maxTextureBytes = Math.max(64 * MB, Math.min(maxHardBytes, deviceBytes));

  return {
    maxTextureBytes,
    maxTextures: 48,
    oversubscriptionRatio: 1.05
  };
}

export class MemoryManager {
  constructor(policy) {
    this.policy = policy;
    this.currentBytes = 0;
    this.currentCount = 0;
  }

  add(bytes) {
    this.currentBytes += bytes;
    this.currentCount += 1;
  }

  remove(bytes) {
    this.currentBytes = Math.max(0, this.currentBytes - bytes);
    this.currentCount = Math.max(0, this.currentCount - 1);
  }

  shouldEvict() {
    return (
      this.currentCount > this.policy.maxTextures ||
      this.currentBytes > this.policy.maxTextureBytes * this.policy.oversubscriptionRatio
    );
  }

  getUsage() {
    return {
      bytes: this.currentBytes,
      count: this.currentCount,
      maxBytes: this.policy.maxTextureBytes,
      maxCount: this.policy.maxTextures
    };
  }
}
