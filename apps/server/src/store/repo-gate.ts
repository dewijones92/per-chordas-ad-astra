export class RepoGate {
  private writers = 0;
  private exclusiveActive = false;
  private exclusiveWaiting = 0;
  private waiters: (() => void)[] = [];

  async write<T>(fn: () => Promise<T>): Promise<T> {
    while (this.exclusiveActive || this.exclusiveWaiting > 0) await this.wait();
    this.writers += 1;
    try {
      return await fn();
    } finally {
      this.writers -= 1;
      this.wake();
    }
  }

  async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    this.exclusiveWaiting += 1;
    try {
      while (this.exclusiveActive || this.writers > 0) await this.wait();
    } finally {
      this.exclusiveWaiting -= 1;
    }
    this.exclusiveActive = true;
    try {
      return await fn();
    } finally {
      this.exclusiveActive = false;
      this.wake();
    }
  }

  private wait(): Promise<void> {
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private wake(): void {
    const waiting = this.waiters.splice(0);
    for (const resolve of waiting) resolve();
  }
}
