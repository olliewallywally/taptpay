import { exec } from "child_process";
import { promisify } from "util";
import type { Server } from "http";

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
      console.warn(`⚠️ Port ${port} is in use but couldn't identify the process`);
      return false;
    }

    console.log(`🔄 Port ${port} is in use by PID ${portCheck.pid} (${portCheck.command || 'unknown'})`);

    // First try graceful termination
    try {
      await execAsync(`kill ${portCheck.pid}`);
      console.log(`📤 Sent SIGTERM to process ${portCheck.pid}`);
      
      // Wait for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, Math.min(timeout, 3000)));
      
      // Check if port is now free
      const recheckResult = await checkPortAvailability(port);
      if (recheckResult.available) {
        console.log(`✅ Port ${port} freed successfully`);
        return true;
      }
    } catch (killError) {
      console.warn(`⚠️ Could not gracefully terminate process ${portCheck.pid}: ${killError}`);
    }

    // If force is enabled and graceful termination failed, try force kill
    if (force) {
      try {
        await execAsync(`kill -9 ${portCheck.pid}`);
        console.log(`💀 Force killed process ${portCheck.pid}`);
        
        // Brief wait for cleanup
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const finalCheck = await checkPortAvailability(port);
        if (finalCheck.available) {
          console.log(`✅ Port ${port} freed with force kill`);
          return true;
        }
      } catch (forceKillError) {
        console.error(`❌ Force kill failed for process ${portCheck.pid}: ${forceKillError}`);
      }
    }

    return false;
  } catch (error) {
    console.error(`❌ Error cleaning up port ${port}:`, error);
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
      console.log(`⚠️ ${signal} received again, forcing exit...`);
      process.exit(1);
    }

    isShuttingDown = true;
    console.log(`🛑 ${signal} received, starting graceful shutdown...`);

    // Set a timeout for forced shutdown
    const forceShutdownTimeout = setTimeout(() => {
      console.log(`⏰ Shutdown timeout reached, forcing exit...`);
      process.exit(1);
    }, 10000); // 10 second timeout

    try {
      // Close the server
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            console.error(`❌ Error closing server: ${err.message}`);
            reject(err);
          } else {
            console.log(`✅ Server closed successfully`);
            resolve();
          }
        });
      });

      // Additional cleanup if needed
      console.log(`🧹 Cleanup completed for port ${port}`);
      
      clearTimeout(forceShutdownTimeout);
      process.exit(0);
    } catch (error) {
      console.error(`❌ Error during graceful shutdown:`, error);
      clearTimeout(forceShutdownTimeout);
      process.exit(1);
    }
  };

  // Register signal handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
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
    console.log(`🔍 Checking port ${port} availability...`);
    const portCheck = await checkPortAvailability(port);
    
    if (!portCheck.available) {
      console.log(`⚠️ Port ${port} is in use`);
      
      if (portCheck.pid) {
        console.log(`📋 Process details: PID ${portCheck.pid}, Command: ${portCheck.command || 'unknown'}`);
        console.log(`🔄 Attempting to clean up process on port ${port}...`);
        const cleaned = await cleanupPort(port, { force: true, timeout: 3000 });

        if (!cleaned) {
          console.error(`❌ Could not clean up port ${port}. Manual intervention required.`);
          console.log(`💡 Try running: kill ${portCheck.pid} or kill -9 ${portCheck.pid}`);
          return false;
        }
      } else {
        console.error(`❌ Port ${port} is in use but couldn't identify the process`);
        console.log(`💡 Try running: sudo netstat -tlnp | grep ${port} or sudo ss -tlnp | grep ${port}`);
        return false;
      }
    }

    // Attempt to start the server
    return new Promise<boolean>((resolve) => {
      const onError = (error: any) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`❌ Port ${port} is still in use after cleanup attempts`);
          console.log(`💡 Suggestions:`);
          console.log(`   1. Wait a few seconds and try again`);
          console.log(`   2. Check for other processes: sudo netstat -tlnp | grep ${port}`);
          console.log(`   3. Restart your development environment`);
        } else {
          console.error(`❌ Server startup error:`, error.message);
        }
        resolve(false);
      };

      const onListening = () => {
        console.log(`✅ Server successfully started on ${host}:${port}`);
        server.removeListener('error', onError);
        resolve(true);
      };

      server.once('error', onError);
      server.once('listening', onListening);

      server.listen({ port, host, reusePort: true });
    });
  } catch (error) {
    console.error(`❌ Error starting server with port management:`, error);
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