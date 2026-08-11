#!/usr/bin/env node
import { runLandingPhoneBuildGraph } from './landing-phone-build-graph.mjs';

try {
  process.exitCode = runLandingPhoneBuildGraph();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
