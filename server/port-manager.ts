import {logOperation} from "./structured-log";
import { exec } from "child_process";
import { promisify } from "util";
import type { Server } from "http";
import { config } from "./config";
import { closeSecurityAuditLog } from "./security-audit-log";

const execAsync = promisify(exec);

export interface PortCheckResult {
  available: boolean;
  pid?: number;
  command?: string;
  error?: string;
}

export interface PortCleanupOptions {
  force?: boolean;
  timeout?: number;
}

/**
 * Check if a port is available on the system
 */
export async function checkPortAvailability(port: number): Promise<PortCheckResult> {
  try {
    // Check if port is in use using netstat/ss
    const { stdout } = await execAsync(`netstat -tlnp 2>/dev/null | grep ":${port} " || ss -tlnp 2>/dev/null | grep ":${port} " || true`);
    
    if (!stdout.trim()) {
      return { available: true };
    }

    // Extract PID from netstat/ss output
    const pidMatch = stdout.match(/(\d+)\/(\S+)/);
    const pid = pidMatch ? parseInt(pidMatch[1]) : undefined;
    const command = pidMatch ? pidMatch[2] : undefined;

    return {
      available: false,
      pid,
      command,
    };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Attempt to free a port by terminating processes using it
 */
export async function cleanupPort(port: number, options: PortCleanupOptions = {}): Promise<boolean> {
  const { force = false, timeout = 5000 } = options;
  
  try {
    const portCheck = await checkPortAvailability(port);
    
    if (portCheck.available) {
      return true; // Port is already free
    }

    if (!portCheck.pid) {
      logOperation("warn","PORT_IS_IN_USE_BUT_COULDN_T_IDENTIFY_THE_PROCESS",{payload:[`⚠️ Port ${port} is in use but couldn't identify the process`]});
      return false;
    }

    logOperation("info","PORT_IS_IN_USE_BY_PID",{payload:[`🔄 Port ${port} is in use by PID ${portCheck.pid} (${portCheck.command || 'unknown'})`]});

    // First try graceful termination
    try {
      await execAsync(`kill ${portCheck.pid}`);
      logOperation("info","SENT_SIGTERM_TO_PROCESS",{payload:[`📤 Sent SIGTERM to process ${portCheck.pid}`]});
      
      // Wait for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, Math.min(timeout, 3000)));
      
      // Check if port is now free
      const recheckResult = await checkPortAvailability(port);
      if (recheckResult.available) {
        logOperation("info","PORT_FREED_SUCCESSFULLY",{payload:[`✅ Port ${port} freed successfully`]});
        return true;
      }
    } catch (killError) {
      logOperation("warn","COULD_NOT_GRACEFULLY_TERMINATE_PROCESS",{payload:[`⚠️ Could not gracefully terminate process ${portCheck.pid}: ${killError}`]});
    }

    // If force is enabled and graceful termination failed, try force kill
    if (force) {
      try {
        await execAsync(`kill -9 ${portCheck.pid}`);
        logOperation("info","FORCE_KILLED_PROCESS",{payload:[`💀 Force killed process ${portCheck.pid}`]});
        
        // Brief wait for cleanup
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const finalCheck = await checkPortAvailability(port);
        if (finalCheck.available) {
          logOperation("info","PORT_FREED_WITH_FORCE_KILL",{payload:[`✅ Port ${port} freed with force kill`]});
          return true;
        }
      } catch (forceKillError) {
        logOperation("error","FORCE_KILL_FAILED_FOR_PROCESS",{payload:[`❌ Force kill failed for process ${portCheck.pid}: ${forceKillError}`]});
      }
    }

    return false;
  } catch (error) {
    logOperation("error","ERROR_CLEANING_UP_PORT",{payload:[`❌ Error cleaning up port ${port}:`,error]});
    return false;
  }
}

/**
 * Setup graceful shutdown handlers for a server
 */
export function setupGracefulShutdown(server: Server, port: number): void {
  let isShuttingDown = false;

  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) {
      logOperation("info","RECEIVED_AGAIN_FORCING_EXIT",{payload:[`⚠️ ${signal} received again, forcing exit...`]});
      process.exit(1);
    }

    isShuttingDown = true;
    logOperation("info","RECEIVED_STARTING_GRACEFUL_SHUTDOWN",{payload:[`🛑 ${signal} received, starting graceful shutdown...`]});

    // Set a timeout for forced shutdown
    const forceShutdownTimeout = setTimeout(() => {
      logOperation("info","SHUTDOWN_TIMEOUT_REACHED_FORCING_EXIT",{payload:[`⏰ Shutdown timeout reached, forcing exit...`]});
      // Even when an HTTP connection never closes, give accepted audit events
      // a bounded chance to finish before exiting.
      void closeSecurityAuditLog(500).finally(() => process.exit(1));
    }, 10000); // 10 second timeout

    try {
      // Close the server
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            logOperation("error","ERROR_CLOSING_SERVER",{payload:[`❌ Error closing server: ${err.message}`]});
            reject(err);
          } else {
            logOperation("info","SERVER_CLOSED_SUCCESSFULLY",{payload:[`✅ Server closed successfully`]});
            resolve();
          }
        });
      });

      const auditFlushed = await closeSecurityAuditLog();
      logOperation("info","CLEANUP_COMPLETED_FOR_PORT",{payload:[`🧹 Cleanup completed for port ${port}`]});
      
      clearTimeout(forceShutdownTimeout);
      process.exit(auditFlushed ? 0 : 1);
    } catch (error) {
      logOperation("error","ERROR_DURING_GRACEFUL_SHUTDOWN",{payload:[`❌ Error during graceful shutdown:`,error]});
      await closeSecurityAuditLog();
      clearTimeout(forceShutdownTimeout);
      process.exit(1);
    }
  };

  // Register signal handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
  // Handle uncaught exceptions. In development, log and keep serving — the
  // Replit workflow does NOT auto-restart a dead process, so exiting here
  // turns one bad request into total downtime. In production the platform
  // (autoscale) replaces crashed instances, so exit fast on unknown state.
  process.on('uncaughtException', (error) => {
    logOperation("error","UNCAUGHT_EXCEPTION_SERVER_KEPT_ALIVE_IN_DEV",{payload:['❌ Uncaught exception (server kept alive in dev):',error]});
    if (config.isProduction) {
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    }
  });

  // Handle unhandled promise rejections: log loudly but NEVER exit. A rejected
  // promise belongs to a single request/background task; killing the whole
  // server over it caused repeated "app is down / timing out" incidents
  // (previously this called gracefulShutdown → process.exit).
  process.on('unhandledRejection', (reason, promise) => {
    logOperation("error","UNHANDLED_REJECTION_AT",{payload:['❌ Unhandled rejection at:',promise,'reason:',reason]});
  });
}

/**
 * Attempt to start server with port management
 */
export async function startServerWithPortManagement(
  server: Server, 
  port: number,
  host: string = "0.0.0.0"
): Promise<boolean> {
  try {
    // Check if port is available
    logOperation("info","CHECKING_PORT_AVAILABILITY",{payload:[`🔍 Checking port ${port} availability...`]});
    const portCheck = await checkPortAvailability(port);
    
    if (!portCheck.available) {
      logOperation("info","PORT_IS_IN_USE",{payload:[`⚠️ Port ${port} is in use`]});
      
      if (portCheck.pid) {
        logOperation("info","PROCESS_DETAILS_PID_COMMAND",{payload:[`📋 Process details: PID ${portCheck.pid}, Command: ${portCheck.command || 'unknown'}`]});
        logOperation("info","ATTEMPTING_TO_CLEAN_UP_PROCESS_ON_PORT",{payload:[`🔄 Attempting to clean up process on port ${port}...`]});
        const cleaned = await cleanupPort(port, { force: true, timeout: 3000 });

        if (!cleaned) {
          logOperation("error","COULD_NOT_CLEAN_UP_PORT_MANUAL_INTERVENTION_REQUIRED",{payload:[`❌ Could not clean up port ${port}. Manual intervention required.`]});
          logOperation("info","TRY_RUNNING_KILL_OR_KILL_9",{payload:[`💡 Try running: kill ${portCheck.pid} or kill -9 ${portCheck.pid}`]});
          return false;
        }
      } else {
        logOperation("error","PORT_IS_IN_USE_BUT_COULDN_T_IDENTIFY_THE_PROCESS",{payload:[`❌ Port ${port} is in use but couldn't identify the process`]});
        logOperation("info","TRY_RUNNING_SUDO_NETSTAT_TLNP_GREP_OR_SUDO_SS_TLNP_GREP",{payload:[`💡 Try running: sudo netstat -tlnp | grep ${port} or sudo ss -tlnp | grep ${port}`]});
        return false;
      }
    }

    // Attempt to start the server
    return new Promise<boolean>((resolve) => {
      const onError = (error: any) => {
        if (error.code === 'EADDRINUSE') {
          logOperation("error","PORT_IS_STILL_IN_USE_AFTER_CLEANUP_ATTEMPTS",{payload:[`❌ Port ${port} is still in use after cleanup attempts`]});
          logOperation("info","SUGGESTIONS",{payload:[`💡 Suggestions:`]});
          logOperation("info","1_WAIT_A_FEW_SECONDS_AND_TRY_AGAIN",{payload:[`   1. Wait a few seconds and try again`]});
          logOperation("info","2_CHECK_FOR_OTHER_PROCESSES_SUDO_NETSTAT_TLNP_GREP",{payload:[`   2. Check for other processes: sudo netstat -tlnp | grep ${port}`]});
          logOperation("info","3_RESTART_YOUR_DEVELOPMENT_ENVIRONMENT",{payload:[`   3. Restart your development environment`]});
        } else {
          logOperation("error","SERVER_STARTUP_ERROR",{payload:[`❌ Server startup error:`,error.message]});
        }
        resolve(false);
      };

      const onListening = () => {
        logOperation("info","SERVER_SUCCESSFULLY_STARTED_ON",{payload:[`✅ Server successfully started on ${host}:${port}`]});
        server.removeListener('error', onError);
        resolve(true);
      };

      server.once('error', onError);
      server.once('listening', onListening);

      server.listen({ port, host, reusePort: true });
    });
  } catch (error) {
    logOperation("error","ERROR_STARTING_SERVER_WITH_PORT_MANAGEMENT",{payload:[`❌ Error starting server with port management:`,error]});
    return false;
  }
}

/**
 * Get helpful error message for port conflicts
 */
export function getPortConflictHelp(port: number, error?: any): string {
  const isEADDRINUSE = error?.code === 'EADDRINUSE';
  
  if (!isEADDRINUSE) {
    return `Server startup failed: ${error?.message || 'Unknown error'}`;
  }

  return `
🚫 Port ${port} is already in use (EADDRINUSE error)

💡 Quick fixes:
  1. Wait 10-15 seconds and restart - previous process may still be shutting down
  2. Kill conflicting processes: sudo netstat -tlnp | grep ${port} then kill <PID>
  3. Use our port cleanup: This should happen automatically on next restart
  4. Restart your development environment completely

🔍 Debug commands:
  • Check what's using the port: sudo netstat -tlnp | grep ${port}
  • Alternative check: sudo ss -tlnp | grep ${port}
  • Check Node.js processes: ps aux | grep node

⚙️ This server will automatically attempt to clean up stale processes on restart.
If the issue persists, it may be a non-Node.js process using the port.
  `.trim();
}
