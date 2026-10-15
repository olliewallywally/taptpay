import {logOperation} from "./structured-log";
import { exec } from "child_process";
import { promisify } from "util";
import type { Server } from "http";
import { config } from "./config";
import {installShutdownHandlers,type ShutdownOptions} from "./server-shutdown";

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
export function setupGracefulShutdown(server:Server,_port:number,options:ShutdownOptions={}) {
  return installShutdownHandlers(server,{production:config.isProduction,...options});
}

/**
 * Attempt to start server with port management
 */
export async function startServerWithPortManagement(
  server:Server,port:number,host="0.0.0.0"
):Promise<boolean> {
  // Binding is authoritative. Never terminate a different process to obtain a port.
  return new Promise<boolean>(resolve=>{
    const onError=()=>{server.removeListener('listening',onListening);logOperation('error','server_bind_failed',{port});resolve(false);};
    const onListening=()=>{server.removeListener('error',onError);resolve(true);};
    server.once('error',onError);server.once('listening',onListening);
    try{server.listen({port,host});}catch{server.removeListener('error',onError);onError();}
  });
}

/**
 * Get helpful error message for port conflicts
 */
export function getPortConflictHelp(port:number,_error?:unknown):string {
  return `Port ${port} is unavailable. Identify its owner and choose a free port or arrange an intentional restart. Startup never terminates another process.`;
}
