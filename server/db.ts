if (res.status === 'updated' && res.state) {
          this.data = normalizeLoadedStore(res.state);
          this.remoteVersion = res.version;
          this.writeLocalCache();
          this.hasSyncedFromRemote = true;
        }
      } catch (err) {
        console.error('Failed to sync state from Supabase:', err);
      } finally {
        this.syncPromise = null;
      }
    })();

    return this.syncPromise;
  }

  public async flushToRemote(): Promise<void> {
    if (!isSupabaseDbEnabled() || !this.dirty) return;
    if (this.flushPromise) return this.flushPromise;

    this.flushPromise = (async () => {
      try {
        const nextVer = this.remoteVersion + 1;
        const success = await saveStateToSupabase(this.data, nextVer);
        if (success) {
          this.remoteVersion = nextVer;
          this.dirty = false;
        }
      } catch (err) {
        console.error('Failed to flush state to Supabase:', err);
      } finally {
        this.flushPromise = null;
      }
    })();

    return this.flushPromise;
  }
}

export const db = new MafiaStore();

export function recordAdminAudit(params: {
  actorId: string;
  actorName: string;
  action: AdminAuditAction;
  targetUserId?: string;
  targetUserName?: string;
  details?: string;
  ip?: string;
}): void {
  const store = db.get();
  if (!Array.isArray(store.adminAuditLogs)) {
    store.adminAuditLogs = [];
  }
  const log: AdminAuditLog = {
    id: `audit-${crypto.randomUUID()}`,
    actorId: params.actorId,
    actorName: params.actorName,
    action: params.action,
    targetUserId: params.targetUserId,
    targetUserName: params.targetUserName,
    details: params.details,
    ip: params.ip || 'unknown',
    createdAt: new Date().toISOString(),
  };
  store.adminAuditLogs.unshift(log);
  if (store.adminAuditLogs.length > 500) {
    store.adminAuditLogs = store.adminAuditLogs.slice(0, 500);
  }
  db.save();
}

export function recordAppError(params: {
  source: 'client' | 'server';
  message: string;
  stack?: string;
  path?: string;
  userId?: string;
  notifyAdmin?: boolean;
}): void {
  try {
    const store = db.get();
    if (!Array.isArray(store.errorLogs)) {
      store.errorLogs = [];
    }
    const errorLog: AppErrorLog = {
      id: `err-${crypto.randomUUID()}`,
      source: params.source,
      message: params.message,
      stack: params.stack,
      path: params.path,
      userId: params.userId,
      notifyAdmin: Boolean(params.notifyAdmin),
      resolved: false,
      createdAt: new Date().toISOString(),
    };
    store.errorLogs.unshift(errorLog);
    if (store.errorLogs.length > 200) {
      store.errorLogs = store.errorLogs.slice(0, 200);
    }
    db.save();
  } catch {
    // Fail-safe for storage constraints
  }
}
