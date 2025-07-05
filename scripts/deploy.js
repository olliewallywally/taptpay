#!/usr/bin/env node

/**
 * Production Deployment Script for Tapt Payment Terminal
 * 
 * This script helps prepare the application for production deployment
 * by checking requirements and providing deployment guidance.
 */

import { execSync } from 'child_process';
import fs from 'fs';

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkEnvironment() {
  log('\n🔍 Checking Environment Variables...', 'blue');
  
  const required = ['DATABASE_URL'];
  const recommended = ['JWT_SECRET', 'WINDCAVE_USERNAME', 'WINDCAVE_API_KEY'];
  
  let allGood = true;
  
  // Check required variables
  for (const env of required) {
    if (process.env[env]) {
      log(`✅ ${env}: Configured`, 'green');
    } else {
      log(`❌ ${env}: Missing (REQUIRED)`, 'red');
      allGood = false;
    }
  }
  
  // Check recommended variables
  for (const env of recommended) {
    if (process.env[env]) {
      log(`✅ ${env}: Configured`, 'green');
    } else {
      log(`⚠️ ${env}: Not set (RECOMMENDED)`, 'yellow');
    }
  }
  
  return allGood;
}

function showDeploymentInstructions() {
  log('\n🚀 Deployment Instructions', 'bold');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  
  log('\n1. Replit Deployment (Recommended):', 'bold');
  log('   • Click the "Deploy" button in Replit');
  log('   • Configure custom domain (optional)');
  log('   • Add secrets via Replit UI');
  log('   • Test with sandbox credentials first');
  
  log('\n2. Environment Variables to Configure:', 'bold');
  log('   • WINDCAVE_USERNAME: Your Windcave API username');
  log('   • WINDCAVE_API_KEY: Your Windcave API key');
  log('   • JWT_SECRET: Strong random string (32+ chars)');
  
  log('\n3. Post-Deployment Testing:', 'bold');
  log('   • Test login: demo@tapt.co.nz / demo123');
  log('   • Create test transaction');
  log('   • Verify QR code generation');
  log('   • Test customer payment flow');
  
  log('\n4. Production Setup:', 'bold');
  log('   • Change demo account password');
  log('   • Create real merchant accounts');
  log('   • Configure custom domain');
  log('   • Setup monitoring and alerts');
}

function main() {
  log('🎯 Tapt Payment Terminal - Production Deployment Check', 'bold');
  log('════════════════════════════════════════════════════════', 'blue');
  
  const envOk = checkEnvironment();
  
  log('\n📊 Deployment Readiness Summary', 'bold');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  
  if (envOk) {
    log('🎉 READY FOR PRODUCTION DEPLOYMENT!', 'green');
    log('   All critical requirements are met.', 'green');
  } else {
    log('⚠️ DEPLOYMENT REQUIRES ATTENTION', 'yellow');
    log('   Some critical requirements are missing.', 'yellow');
  }
  
  showDeploymentInstructions();
  
  log('\n📚 Additional Resources:', 'bold');
  log('   • Security Audit: See SECURITY.md');
  log('   • Deployment Guide: See DEPLOYMENT.md');
  log('   • API Documentation: /api endpoints');
  
  log('\n✨ Happy deploying!', 'green');
}

main();